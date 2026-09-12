import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoomStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LiveKitService } from '../livekit/livekit.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

type ParticipantWithUser = Prisma.ParticipantGetPayload<{
  include: { user: { select: { name: true } } };
}>;

// A discriminated union so callers (and the frontend, via the identical
// shape returned over HTTP) can't accidentally read liveKitToken off a
// still-waiting participant — TypeScript only allows it once status has
// been narrowed to 'admitted'.
type JoinResult =
  | { status: 'waiting'; participant: ParticipantWithUser }
  | {
      status: 'admitted';
      participant: ParticipantWithUser;
      liveKitUrl: string;
      liveKitToken: string;
    }
  | { status: 'denied' };

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly liveKit: LiveKitService,
  ) {}

  async createRoom(hostId: string, dto: CreateRoomDto) {
    // Room + the host's own Participant row must be created together — a
    // room that exists with no host membership row would break
    // listParticipants and the membership guard for its own creator.
    return this.prisma.$transaction(async (tx) => {
      const room = await tx.room.create({
        data: {
          name: dto.name,
          scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : null,
          maxParticipants: dto.maxParticipants,
          hostId,
        },
      });

      // The host is always admitted immediately — they can't be excluded
      // from their own meeting's waiting room.
      await tx.participant.create({
        data: {
          roomId: room.id,
          userId: hostId,
          role: 'host',
          admittedAt: new Date(),
        },
      });

      return room;
    });
  }

  // Rooms the user hosts, or is currently an active participant in.
  listMyRooms(userId: string) {
    return this.prisma.room.findMany({
      where: {
        OR: [
          { hostId: userId },
          { participants: { some: { userId, leftAt: null } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRoomById(roomId: string) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');
    return room;
  }

  async updateRoom(roomId: string, dto: UpdateRoomDto) {
    await this.getRoomById(roomId);
    return this.prisma.room.update({
      where: { id: roomId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.scheduledFor !== undefined && {
          scheduledFor: new Date(dto.scheduledFor),
        }),
        ...(dto.maxParticipants !== undefined && {
          maxParticipants: dto.maxParticipants,
        }),
      },
    });
  }

  // Hard delete — only while nothing has happened yet. Once a room has
  // gone active (someone joined) or ended, its participant/recording
  // history must be preserved; use endRoom for that case instead.
  async cancelRoom(roomId: string) {
    const room = await this.getRoomById(roomId);
    if (room.status !== RoomStatus.scheduled) {
      throw new ConflictException(
        "Only a room that hasn't started yet can be cancelled",
      );
    }

    await this.prisma.$transaction([
      this.prisma.participant.deleteMany({ where: { roomId } }),
      this.prisma.room.delete({ where: { id: roomId } }),
    ]);
  }

  async endRoom(roomId: string) {
    const room = await this.getRoomById(roomId);
    if (room.status === RoomStatus.ended) {
      throw new ConflictException('Room has already ended');
    }

    await this.prisma.$transaction([
      this.prisma.room.update({
        where: { id: roomId },
        data: { status: RoomStatus.ended },
      }),
      this.prisma.participant.updateMany({
        where: { roomId, leftAt: null },
        data: { leftAt: new Date() },
      }),
    ]);
  }

  async joinRoom(roomId: string, userId: string): Promise<JoinResult> {
    const room = await this.getRoomById(roomId);
    if (room.status === RoomStatus.ended) {
      throw new ConflictException('This meeting has already ended');
    }

    // Capacity is checked against ADMITTED participants only — someone
    // sitting in the waiting room hasn't taken a seat in the call yet, so
    // a full waiting room must never block new arrivals from queuing up
    // behind them. That's the entire point of a lobby: it lets people
    // wait beyond live capacity, admitted one at a time as space frees up.
    const admittedCount = await this.prisma.participant.count({
      where: { roomId, leftAt: null, admittedAt: { not: null } },
    });

    // Someone already occupying a seat and rejoining (rare race: they
    // haven't left yet but are "rejoining", e.g. duplicate tab) shouldn't
    // count twice against capacity — check that separately from the
    // capacity gate below.
    const existing = await this.prisma.participant.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });

    if (!existing && admittedCount >= room.maxParticipants) {
      throw new ForbiddenException('This meeting is full');
    }

    // Roles are NEVER accepted from the client — upsert always assigns
    // "participant" for a new join. The one and only "host" row is created
    // in createRoom and is never reassigned here, preventing any joining
    // user from escalating themselves to host.
    //
    // admittedAt is deliberately untouched on the update branch: a
    // returning participant (page refresh, flaky connection) keeps
    // whatever admission state they already had rather than being forced
    // back into the waiting room on every reconnect. It's only ever set on
    // first creation (never, for a regular participant) or later by an
    // explicit host admit action.
    const participant = await this.prisma.participant.upsert({
      where: { roomId_userId: { roomId, userId } },
      update: { leftAt: null, joinedAt: new Date() },
      create: { roomId, userId, role: 'participant' },
      include: { user: { select: { name: true } } },
    });

    if (room.status === RoomStatus.scheduled) {
      await this.prisma.room.update({
        where: { id: roomId },
        data: { status: RoomStatus.active },
      });
    }

    return this.buildJoinResult(roomId, participant);
  }

  // Polled by a waiting participant's client to find out when the host has
  // acted. Deliberately NOT guarded by RoomMemberGuard (isMember requires
  // leftAt === null, which a denied participant no longer satisfies) —
  // this method does its own DB-level ownership check instead, scoped to
  // "does the CALLER (never a client-supplied id) have any participant
  // record for this room at all", which is exactly what the polling
  // endpoint's own authorization model needs.
  async getParticipantStatus(
    roomId: string,
    userId: string,
  ): Promise<JoinResult> {
    const participant = await this.prisma.participant.findUnique({
      where: { roomId_userId: { roomId, userId } },
      include: { user: { select: { name: true } } },
    });

    if (!participant) {
      throw new NotFoundException('You have not requested to join this room');
    }

    if (participant.leftAt) {
      return { status: 'denied' };
    }

    return this.buildJoinResult(roomId, participant);
  }

  private async buildJoinResult(
    roomId: string,
    participant: ParticipantWithUser,
  ): Promise<JoinResult> {
    if (!participant.admittedAt) {
      return { status: 'waiting', participant };
    }

    const liveKitToken = await this.liveKit.createAccessToken({
      identity: participant.userId,
      name: participant.user.name,
      roomId,
      role: participant.role,
    });

    return {
      status: 'admitted',
      participant,
      liveKitUrl: this.liveKit.getUrl(),
      liveKitToken,
    };
  }

  // Hosts see who's currently waiting so they can admit or deny them —
  // scoped to leftAt: null so a denied-then-reconsidered participant who
  // hasn't re-knocked doesn't linger in the list.
  listWaitingParticipants(roomId: string) {
    return this.prisma.participant.findMany({
      where: { roomId, leftAt: null, admittedAt: null },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { joinedAt: 'asc' },
    });
  }

  // Same BOLA-mitigation shape as assertActiveNonSelfParticipant below,
  // scoped to the waiting-room state instead of the live-call state — a
  // host can only admit/deny someone who is genuinely, currently waiting
  // on THIS room, verified at the DB level rather than trusted from the
  // request.
  private async assertWaitingNonSelfParticipant(
    roomId: string,
    hostId: string,
    targetUserId: string,
  ) {
    if (targetUserId === hostId) {
      throw new BadRequestException(
        'You cannot target yourself with a host action',
      );
    }

    const participant = await this.prisma.participant.findUnique({
      where: { roomId_userId: { roomId, userId: targetUserId } },
    });

    if (!participant || participant.leftAt || participant.admittedAt) {
      throw new NotFoundException(
        'This user is not currently waiting to join this room',
      );
    }

    return participant;
  }

  async admitParticipant(
    roomId: string,
    hostId: string,
    targetUserId: string,
  ): Promise<void> {
    const participant = await this.assertWaitingNonSelfParticipant(
      roomId,
      hostId,
      targetUserId,
    );
    await this.prisma.participant.update({
      where: { id: participant.id },
      data: { admittedAt: new Date() },
    });
  }

  async denyParticipant(
    roomId: string,
    hostId: string,
    targetUserId: string,
  ): Promise<void> {
    const participant = await this.assertWaitingNonSelfParticipant(
      roomId,
      hostId,
      targetUserId,
    );
    // Same "not currently active" signal the rest of the codebase already
    // uses (leftAt), rather than deleting the row — keeps a denied
    // request's history and lets them knock again later via a plain
    // joinRoom() call, which clears leftAt.
    await this.prisma.participant.update({
      where: { id: participant.id },
      data: { leftAt: new Date() },
    });
  }

  async leaveRoom(roomId: string, userId: string) {
    const participant = await this.prisma.participant.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });

    if (!participant || participant.leftAt) {
      throw new NotFoundException(
        'You are not an active participant in this room',
      );
    }

    await this.prisma.participant.update({
      where: { id: participant.id },
      data: { leftAt: new Date() },
    });
  }

  listActiveParticipants(roomId: string) {
    return this.prisma.participant.findMany({
      where: { roomId, leftAt: null },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async isHost(roomId: string, userId: string): Promise<boolean> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { hostId: true },
    });
    return room?.hostId === userId;
  }

  async isMember(roomId: string, userId: string): Promise<boolean> {
    if (await this.isHost(roomId, userId)) return true;
    const participant = await this.prisma.participant.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    return !!participant && participant.leftAt === null;
  }

  // Shared validation for both host actions below. Not merely "is this a
  // real user" — verifies the target is an ACTIVE participant of THIS
  // specific room (DB-level check, same BOLA-mitigation pattern as
  // RoomHostGuard/RoomMemberGuard), and blocks a host from running an
  // admin action on themselves — muting/removing yourself via an admin
  // endpoint is nonsensical when you already have direct control over
  // your own mic and connection.
  private async assertActiveNonSelfParticipant(
    roomId: string,
    hostId: string,
    targetUserId: string,
  ) {
    if (targetUserId === hostId) {
      throw new BadRequestException(
        'You cannot target yourself with a host action',
      );
    }

    const participant = await this.prisma.participant.findUnique({
      where: { roomId_userId: { roomId, userId: targetUserId } },
    });

    if (!participant || participant.leftAt) {
      throw new NotFoundException(
        'This user is not an active participant in this room',
      );
    }

    return participant;
  }

  async muteParticipant(
    roomId: string,
    hostId: string,
    targetUserId: string,
  ): Promise<void> {
    await this.assertActiveNonSelfParticipant(roomId, hostId, targetUserId);
    await this.liveKit.muteParticipantAudio(roomId, targetUserId);
  }

  async removeParticipant(
    roomId: string,
    hostId: string,
    targetUserId: string,
  ): Promise<void> {
    const participant = await this.assertActiveNonSelfParticipant(
      roomId,
      hostId,
      targetUserId,
    );
    await this.liveKit.removeParticipant(roomId, targetUserId);
    // Reconcile our own record with what just happened in LiveKit — the
    // capacity/lifecycle logic in joinRoom reads leftAt, so a removed
    // participant must be reflected here too, not just kicked from the
    // live call.
    await this.prisma.participant.update({
      where: { id: participant.id },
      data: { leftAt: new Date() },
    });
  }
}
