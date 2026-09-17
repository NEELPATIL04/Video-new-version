import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RoomStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsService } from '../rooms/rooms.service';
import { LiveKitService } from '../livekit/livekit.service';
import { CreateBreakoutRoomsDto } from './dto/create-breakout-rooms.dto';

// Polled by a connected participant's client to find out whether the host
// has assigned them to a breakout room, or ended breakouts and sent them
// back to the main room. See FEATURES.md's Research notes for why this is
// polling rather than a LiveKit data-channel/metadata signal.
type MyBreakoutAssignment =
  | { status: 'none' }
  | {
      status: 'assigned';
      breakoutRoomId: string;
      label: string;
      liveKitUrl: string;
      liveKitToken: string;
    };

@Injectable()
export class BreakoutRoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rooms: RoomsService,
    private readonly liveKit: LiveKitService,
  ) {}

  // Host-only (RoomHostGuard at the controller level). v1 is manual
  // assignment only (see FEATURES.md's Research notes on why automatic
  // distribution is a documented stretch goal, not built) — the host
  // designs the whole split client-side and submits it as one request,
  // created in a single DB transaction so no participant ever observes a
  // half-split meeting.
  async createBreakoutRooms(
    roomId: string,
    hostId: string,
    dto: CreateBreakoutRoomsDto,
  ) {
    const room = await this.rooms.getRoomById(roomId);
    if (room.status !== RoomStatus.active) {
      throw new ConflictException(
        'Breakout rooms can only be created while the meeting is active',
      );
    }
    // A breakout room is a SEPARATE LiveKit room with no key-distribution
    // story of its own (see e2ee.ts / FEATURES.md's Research notes on why
    // the E2EE key only ever travels via the main room URL's fragment) —
    // silently moving an E2EE participant into an unencrypted breakout
    // would be a real, invisible security downgrade, not a missing nice-
    // to-have. Refusing outright here matches this codebase's existing
    // pattern of refusing rather than silently degrading (see
    // JoinByCodeForm's e2eeEnabled refusal).
    if (room.e2eeEnabled) {
      throw new ConflictException(
        'Breakout rooms are not yet supported for end-to-end encrypted meetings',
      );
    }

    const allUserIds = dto.rooms.flatMap((r) => r.participantUserIds);
    if (new Set(allUserIds).size !== allUserIds.length) {
      throw new BadRequestException(
        'A participant cannot be assigned to more than one breakout room at once',
      );
    }
    // The host never moves themselves into a breakout in v1 (see
    // FEATURES.md's Research notes — host movement between rooms is a
    // documented stretch goal, not built) — rejecting this explicitly
    // here, rather than just letting the DB-level check below fail to
    // resolve it, gives the host an honest reason instead of a confusing
    // "not assignable" error.
    if (allUserIds.includes(hostId)) {
      throw new BadRequestException(
        'The host cannot be assigned to a breakout room',
      );
    }

    if (allUserIds.length > 0) {
      await this.assertAssignableParticipants(roomId, allUserIds);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const results: {
        id: string;
        label: string;
        participantUserIds: string[];
      }[] = [];
      for (const def of dto.rooms) {
        const breakoutRoom = await tx.breakoutRoom.create({
          data: { roomId, label: def.label },
        });
        if (def.participantUserIds.length > 0) {
          await tx.participant.updateMany({
            where: { roomId, userId: { in: def.participantUserIds } },
            data: { breakoutRoomId: breakoutRoom.id },
          });
        }
        results.push({
          id: breakoutRoom.id,
          label: breakoutRoom.label,
          participantUserIds: def.participantUserIds,
        });
      }
      return results;
    });

    // Pre-creating the actual LiveKit rooms happens AFTER the DB
    // transaction commits, deliberately outside it — LiveKit can't
    // participate in a Postgres transaction, and this is best-effort
    // anyway: LiveKit creates a room implicitly on first join regardless,
    // so a failure here doesn't need to roll back an assignment that's
    // already correctly recorded in our own database.
    await Promise.all(
      created.map((c) =>
        this.liveKit.createBreakoutRoom(c.id).catch(() => undefined),
      ),
    );

    return created;
  }

  // Same BOLA-mitigation shape as RoomsService's
  // assertActiveNonSelfParticipant/assertWaitingNonSelfParticipant: never
  // trusts that a client-supplied userId is actually a real, currently
  // assignable member of THIS room — verified at the DB level. A
  // participant must be an active (leftAt: null), already-admitted
  // (admittedAt not null — someone still sitting in the waiting room
  // isn't in the call at all, let alone assignable to a breakout) member
  // of THIS room who isn't already assigned to a different breakout.
  private async assertAssignableParticipants(
    roomId: string,
    userIds: string[],
  ) {
    const participants = await this.prisma.participant.findMany({
      where: {
        roomId,
        userId: { in: userIds },
        leftAt: null,
        admittedAt: { not: null },
        breakoutRoomId: null,
      },
    });
    if (participants.length !== userIds.length) {
      throw new NotFoundException(
        'One or more participants are not currently assignable to a breakout room — they must be an active, admitted member of this meeting who is not already in a breakout',
      );
    }
    return participants;
  }

  // Host-only. Brings everyone back to the main room: clears every
  // breakout assignment so the next my-assignment poll from each affected
  // participant's client resolves to "none", which their frontend treats
  // as "reconnect to the main room" (see FEATURES.md's Research notes).
  async endBreakoutRooms(roomId: string) {
    const open = await this.prisma.breakoutRoom.findMany({
      where: { roomId, endedAt: null },
    });
    if (open.length === 0) {
      throw new ConflictException('There are no active breakout rooms to end');
    }
    const openIds = open.map((r) => r.id);

    await this.prisma.$transaction([
      this.prisma.participant.updateMany({
        where: { roomId, breakoutRoomId: { in: openIds } },
        data: { breakoutRoomId: null },
      }),
      this.prisma.breakoutRoom.updateMany({
        where: { id: { in: openIds } },
        data: { endedAt: new Date() },
      }),
    ]);

    // Best-effort LiveKit cleanup — see LiveKitService.deleteBreakoutRoom
    // for why a failure here is deliberately swallowed rather than
    // surfaced: our own DB state above is what every client's poll
    // reacts to, not LiveKit's.
    await Promise.all(open.map((r) => this.liveKit.deleteBreakoutRoom(r.id)));
  }

  // Host-only. Powers the host's management panel — which rooms exist
  // right now and who's in each, so the host can decide who to move next
  // or when to end breakouts entirely.
  listBreakoutRooms(roomId: string) {
    return this.prisma.breakoutRoom.findMany({
      where: { roomId, endedAt: null },
      include: {
        participants: {
          where: { leftAt: null },
          select: { userId: true, user: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Polled by every participant's own client (see the controller's own
  // comment for why this has no RoomHostGuard/RoomMemberGuard — it's
  // scoped to the CALLER's own Participant row via the (roomId, userId)
  // unique constraint, never a client-supplied target id, so there's
  // nothing here for one participant to peek into another's assignment).
  async getMyBreakoutAssignment(
    roomId: string,
    userId: string,
  ): Promise<MyBreakoutAssignment> {
    const participant = await this.prisma.participant.findUnique({
      where: { roomId_userId: { roomId, userId } },
      include: { user: { select: { name: true } }, breakoutRoom: true },
    });

    if (!participant || participant.leftAt) {
      throw new NotFoundException(
        'You are not an active participant in this room',
      );
    }

    if (!participant.breakoutRoomId || !participant.breakoutRoom) {
      return { status: 'none' };
    }

    // Reuses LiveKitService.createAccessToken exactly as it's used for
    // the main room in RoomsService — a breakout room still needs the
    // same role-based VideoGrant logic (host/participant/viewer), just
    // pointed at the breakout room's own LiveKit room name instead of the
    // main Room's id.
    const liveKitToken = await this.liveKit.createAccessToken({
      identity: userId,
      name: participant.user.name,
      roomId: participant.breakoutRoomId,
      role: participant.role,
    });

    return {
      status: 'assigned',
      breakoutRoomId: participant.breakoutRoomId,
      label: participant.breakoutRoom.label,
      liveKitUrl: this.liveKit.getUrl(),
      liveKitToken,
    };
  }
}
