import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoomStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  LiveKitParticipantNotConnectedError,
  LiveKitService,
} from '../livekit/livekit.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { CreateWhiteboardStrokeDto } from './dto/create-whiteboard-stroke.dto';

const DEFAULT_STROKE_WIDTH = 3;

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
      // Lets the client tell "no key in the URL because this room isn't
      // encrypted" apart from "no key in the URL but this room needs
      // one" (e.g. joined via the 9-digit code, which can't carry a
      // URL fragment) — the latter must refuse to connect rather than
      // silently join with broken, undecryptable media.
      e2eeEnabled: boolean;
    }
  | { status: 'denied' };

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly liveKit: LiveKitService,
  ) {}

  async createRoom(hostId: string, dto: CreateRoomDto) {
    if (dto.scheduledFor && new Date(dto.scheduledFor) <= new Date()) {
      throw new BadRequestException('scheduledFor must be in the future');
    }

    const joinCode = await this.generateUniqueJoinCode();

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
          joinCode,
          e2eeEnabled: dto.e2eeEnabled ?? false,
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

  // A short, human-typeable alternative to the room ID/link — 9 random
  // digits, e.g. "482 913 657" once formatted for display. This isn't a
  // security boundary (the waiting room + auth are); it just needs to be
  // unique and hard to type wrong, not cryptographically unguessable, so
  // a bounded existence-check retry is the right amount of rigor — the
  // same trade real products like Zoom make with their own meeting IDs.
  private async generateUniqueJoinCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = String(Math.floor(Math.random() * 1_000_000_000)).padStart(
        9,
        '0',
      );
      const existing = await this.prisma.room.findUnique({
        where: { joinCode: code },
        select: { id: true },
      });
      if (!existing) return code;
    }
    throw new Error('Could not generate a unique join code');
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

  // Any authenticated user may resolve a code to a room — same model as
  // getRoomById above (knowing the code is treated as equivalent to
  // having the join link; the waiting room gates actual admission).
  // Strips non-digits first so "482 913 657" (the display format) works
  // the same as the raw "482913657".
  async findRoomByCode(rawCode: string) {
    const joinCode = rawCode.replace(/\D/g, '');
    const room = await this.prisma.room.findUnique({ where: { joinCode } });
    if (!room) throw new NotFoundException('No meeting found with that code');
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

  // Host-only toggle (guarded by RoomHostGuard at the controller level, same
  // as updateRoom/cancelRoom/endRoom above — no hostId param needed here
  // since the guard already re-verified ownership at the DB level before
  // this method ever runs). Blocks brand-new joiners in joinRoom above;
  // never affects anyone who already has a Participant row, including the
  // host themselves.
  async lockRoom(roomId: string) {
    await this.getRoomById(roomId);
    return this.prisma.room.update({
      where: { id: roomId },
      data: { locked: true },
    });
  }

  async unlockRoom(roomId: string) {
    await this.getRoomById(roomId);
    return this.prisma.room.update({
      where: { id: roomId },
      data: { locked: false },
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

    // A locked room blocks brand-new joiners only — reusing this exact
    // `existing` check (not new "is this an admitted member" logic) is
    // deliberate: it's the same distinction the capacity gate above
    // already makes, and using anything else here risks the lock and the
    // capacity gate disagreeing about who counts as "already in this
    // room". This also means the host is automatically exempt (their own
    // Participant row is created in createRoom, so `existing` is always
    // truthy for them) without needing a separate host special-case.
    if (room.locked && !existing) {
      throw new ForbiddenException('This meeting is locked');
    }

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

    return this.buildJoinResult(room, participant);
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
    const room = await this.getRoomById(roomId);
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

    return this.buildJoinResult(room, participant);
  }

  private async buildJoinResult(
    room: { id: string; e2eeEnabled: boolean },
    participant: ParticipantWithUser,
  ): Promise<JoinResult> {
    if (!participant.admittedAt) {
      return { status: 'waiting', participant };
    }

    const liveKitToken = await this.liveKit.createAccessToken({
      identity: participant.userId,
      name: participant.user.name,
      roomId: room.id,
      role: participant.role,
    });

    return {
      status: 'admitted',
      participant,
      liveKitUrl: this.liveKit.getUrl(),
      liveKitToken,
      e2eeEnabled: room.e2eeEnabled,
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

  // Host-only, read-only aggregation over data the Rooms module already
  // records via joinRoom/leaveRoom/endRoom — no new table, no LiveKit call.
  // Deliberately available for a room in ANY status (scheduled/active/
  // ended), not just after it's ended: a host mid-call gets "attendance so
  // far" (duration computed against `now` for anyone who hasn't left yet),
  // and the exact same endpoint keeps working after the meeting ends for
  // post-hoc review — see FEATURES.md's Research notes for the full
  // reasoning on why "anytime" beat gating this on RoomStatus.ended.
  //
  // Re-checks hostId at the DB level here (not just via RoomHostGuard) even
  // though every other host-only method in this service trusts the guard
  // alone — this endpoint's response contains every participant's name and
  // full join/leave history, sensitive enough that CLAUDE.md's BOLA rule
  // ("verify ownership at the database query level, not just via a route
  // guard") is worth applying a second time here rather than relying
  // solely on the guard having run.
  async getMeetingAnalytics(roomId: string, requestingUserId: string) {
    const room = await this.getRoomById(roomId);
    if (room.hostId !== requestingUserId) {
      throw new ForbiddenException(
        "Only the host can view this meeting's analytics",
      );
    }

    // A scheduled room that nobody has actually joined yet has no call
    // session to report on: the host's own Participant row already exists
    // (created transactionally in createRoom) but its joinedAt is just the
    // room-creation timestamp, not a real join — reporting "duration since
    // creation" for a meeting that hasn't started would be misleading, not
    // just uninteresting.
    if (room.status === RoomStatus.scheduled) {
      return {
        roomId: room.id,
        roomName: room.name,
        status: room.status,
        meetingStartedAt: null,
        meetingEndedAt: null,
        meetingDurationSec: 0,
        totalUniqueParticipants: 0,
        participants: [] as Array<{
          userId: string;
          name: string;
          role: string;
          joinedAt: Date;
          leftAt: Date | null;
          admittedAt: Date | null;
          stillInCall: boolean;
          durationSec: number;
        }>,
      };
    }

    // Participant.@@unique([roomId, userId]) means each user ever gets at
    // most one row per room (joinRoom upserts on reconnect rather than
    // creating a new row) — so this list is already "unique participants",
    // no de-duping needed.
    const participants = await this.prisma.participant.findMany({
      where: { roomId },
      include: { user: { select: { name: true } } },
      orderBy: { joinedAt: 'asc' },
    });

    const now = new Date();
    const participantAnalytics = participants.map((p) => {
      const stillInCall = p.leftAt === null;
      const endPoint = p.leftAt ?? now;
      const durationSec = Math.max(
        0,
        Math.round((endPoint.getTime() - p.joinedAt.getTime()) / 1000),
      );
      return {
        userId: p.userId,
        name: p.user.name,
        role: p.role,
        joinedAt: p.joinedAt,
        leftAt: p.leftAt,
        admittedAt: p.admittedAt,
        stillInCall,
        durationSec,
      };
    });

    const meetingStartedAt = participants.reduce<Date | null>(
      (earliest, p) =>
        earliest === null || p.joinedAt < earliest ? p.joinedAt : earliest,
      null,
    );

    // Room.updatedAt is deliberately NOT used as "ended at" — it's bumped
    // by any mutation on the row (lock/unlock, a future rename, etc.),
    // including ones that can legitimately happen after a meeting ends, so
    // it can't be trusted to mean "when this meeting ended". endRoom sets
    // leftAt for every still-active participant in the same transaction
    // that marks the room ended, so once status is 'ended', every
    // participant row has a leftAt — the latest of those IS exactly when
    // the meeting ended, derived from data already being recorded rather
    // than a new column.
    const meetingEndedAt =
      room.status === RoomStatus.ended
        ? participants.reduce<Date | null>((latest, p) => {
            if (!p.leftAt) return latest;
            return latest === null || p.leftAt > latest ? p.leftAt : latest;
          }, null)
        : null;

    const meetingDurationSec =
      meetingStartedAt === null
        ? 0
        : Math.max(
            0,
            Math.round(
              ((meetingEndedAt ?? now).getTime() - meetingStartedAt.getTime()) /
                1000,
            ),
          );

    return {
      roomId: room.id,
      roomName: room.name,
      status: room.status,
      meetingStartedAt,
      meetingEndedAt,
      meetingDurationSec,
      totalUniqueParticipants: participants.length,
      participants: participantAnalytics,
    };
  }

  async isHost(roomId: string, userId: string): Promise<boolean> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { hostId: true },
    });
    return room?.hostId === userId;
  }

  // Broader than isHost above: true for the real owner OR an active
  // co-host. Deliberately a SEPARATE check, not a change to isHost's own
  // meaning — RoomHostGuard (backed by isHost) still gates room-lifecycle
  // actions (update/cancel/end) and appointing/revoking co-hosts
  // themselves, strictly owner-only. This one backs RoomHostOrCoHostGuard,
  // used only for call-control/queue-management actions (mute, remove,
  // admit, deny, lock, unlock, lower-hand) where a co-host is meant to
  // have the same privileges as the host. See FEATURES.md's Research
  // notes for why the two guards are kept apart rather than loosening
  // RoomHostGuard itself.
  async isHostOrCoHost(roomId: string, userId: string): Promise<boolean> {
    if (await this.isHost(roomId, userId)) return true;
    const participant = await this.prisma.participant.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { role: true, leftAt: true },
    });
    return (
      !!participant &&
      participant.leftAt === null &&
      participant.role === 'cohost'
    );
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

  // Our own Participant row can say "active" (leftAt: null) while
  // LiveKit's live room no longer has that participant at all — e.g.
  // mid-reconnect after a dropped connection, before leftAt catches up.
  // Every host action that touches LiveKit directly after
  // assertActiveNonSelfParticipant (mute/remove/lower-hand) goes through
  // this so that gap surfaces as one honest, shared NotFoundException
  // instead of each call site separately risking an unhandled 500 built
  // from LiveKit's raw Twirp error.
  private async runLiveKitAction<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof LiveKitParticipantNotConnectedError) {
        throw new NotFoundException(
          'This participant is not currently connected to the call',
        );
      }
      throw error;
    }
  }

  async muteParticipant(
    roomId: string,
    hostId: string,
    targetUserId: string,
  ): Promise<void> {
    await this.assertActiveNonSelfParticipant(roomId, hostId, targetUserId);
    await this.runLiveKitAction(() =>
      this.liveKit.muteParticipantAudio(roomId, targetUserId),
    );
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
    await this.runLiveKitAction(() =>
      this.liveKit.removeParticipant(roomId, targetUserId),
    );
    // Reconcile our own record with what just happened in LiveKit — the
    // capacity/lifecycle logic in joinRoom reads leftAt, so a removed
    // participant must be reflected here too, not just kicked from the
    // live call.
    await this.prisma.participant.update({
      where: { id: participant.id },
      data: { leftAt: new Date() },
    });
  }

  // Host-only "lower someone else's hand" (queue management) — NOT the
  // path a participant uses to lower their own hand (that's a direct
  // client-side localParticipant.setMetadata() call, see
  // RaiseHandControl.tsx). Same BOLA-mitigation shape as
  // muteParticipant/removeParticipant: the target must be verified, at
  // the DB level, as a real active participant of THIS room before
  // LiveKit is touched at all, and a host can't target themselves. No DB
  // write here — raised-hand state lives entirely in LiveKit participant
  // metadata, not in Postgres (see FEATURES.md's Research notes for why).
  async lowerParticipantHand(
    roomId: string,
    hostId: string,
    targetUserId: string,
  ): Promise<void> {
    await this.assertActiveNonSelfParticipant(roomId, hostId, targetUserId);
    await this.runLiveKitAction(() =>
      this.liveKit.setHandRaised(roomId, targetUserId, false),
    );
  }

  // Owner-only (RoomHostGuard at the controller level — never
  // RoomHostOrCoHostGuard, so a co-host can't appoint a rival). Reuses the
  // same assertActiveNonSelfParticipant check as mute/remove/lower-hand:
  // the target must be a genuinely active participant of this room, and
  // the host can't target themselves. Promoting someone already a
  // co-host is a harmless no-op rather than an error — idempotent is
  // simpler than adding a "already a co-host" error path nobody needs.
  //
  // Only Participant.role changes — no LiveKit token is reissued here,
  // and that's fine: mute/remove/admit/deny/lock/lower-hand are all
  // backend-mediated RoomServiceClient calls (the backend's own API
  // key/secret, not the caller's personal LiveKit token), gated by
  // RoomHostOrCoHostGuard's DB-level check — so a promotion takes effect
  // immediately for every action that actually matters, with no
  // reconnect needed. The token's own roomAdmin bit only catches up on
  // the co-host's next reconnect, but nothing in this app reads that bit
  // client-side today (see LiveKitService.createAccessToken).
  async promoteToCoHost(
    roomId: string,
    hostId: string,
    targetUserId: string,
  ): Promise<void> {
    const participant = await this.assertActiveNonSelfParticipant(
      roomId,
      hostId,
      targetUserId,
    );
    await this.prisma.participant.update({
      where: { id: participant.id },
      data: { role: 'cohost' },
    });
  }

  // Demoting someone who isn't currently a co-host is likewise a harmless
  // no-op — always resolves to 'participant' regardless of their prior
  // role (viewer demotion isn't a real scenario since joinRoom never
  // assigns 'viewer' today, but this stays correct either way).
  async demoteCoHost(
    roomId: string,
    hostId: string,
    targetUserId: string,
  ): Promise<void> {
    const participant = await this.assertActiveNonSelfParticipant(
      roomId,
      hostId,
      targetUserId,
    );
    await this.prisma.participant.update({
      where: { id: participant.id },
      data: { role: 'participant' },
    });
  }

  // Late-joiner path: fetched via REST on mount by WhiteboardControl,
  // before that client has any live data-channel connection to have
  // missed broadcasts on. Ordered oldest-first so the canvas replays in
  // the order strokes were actually drawn. See FEATURES.md's Research
  // notes for why this (DB persistence + REST fetch), not LiveKit
  // metadata or a peer-resync protocol, was chosen for a whiteboard.
  listWhiteboardStrokes(roomId: string) {
    return this.prisma.whiteboardStroke.findMany({
      where: { roomId },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Persists the stroke so a future late joiner can fetch it via
  // listWhiteboardStrokes above. The caller (WhiteboardControl) is
  // responsible for ALSO broadcasting it over the LiveKit data channel so
  // already-connected participants see it live without polling — this
  // method only does the persistence half.
  async addWhiteboardStroke(
    roomId: string,
    authorId: string,
    dto: CreateWhiteboardStrokeDto,
  ) {
    await this.getRoomById(roomId);
    return this.prisma.whiteboardStroke.create({
      data: {
        roomId,
        authorId,
        // dto.points is a validated array of {x,y} DTO instances, already
        // plain-object-shaped — Prisma's InputJsonValue just doesn't
        // structurally recognize a class-validator array type, so this
        // is a type-level cast only, not a runtime transformation.
        points: dto.points as unknown as Prisma.InputJsonValue,
        color: dto.color,
        width: dto.width ?? DEFAULT_STROKE_WIDTH,
      },
    });
  }

  // Undoes the CALLER's own most recent stroke only — scoped to authorId
  // from the authenticated request, never a client-supplied stroke id, so
  // this can't be used to undo someone else's drawing (same DB-level-
  // scoping principle as assertActiveNonSelfParticipant elsewhere in this
  // file, just applied to "whose row can this request touch" rather than
  // "which participant can this request target").
  async undoLastWhiteboardStroke(roomId: string, authorId: string) {
    const stroke = await this.prisma.whiteboardStroke.findFirst({
      where: { roomId, authorId },
      orderBy: { createdAt: 'desc' },
    });
    if (!stroke) {
      throw new NotFoundException("You haven't drawn anything to undo");
    }
    await this.prisma.whiteboardStroke.delete({ where: { id: stroke.id } });
    return stroke;
  }

  // Host-only (see RoomHostGuard on the controller route) — clears every
  // participant's strokes, not just the caller's own. "Everyone can draw"
  // is this feature's collaborative default, but wiping out everyone
  // ELSE's work too is a meaningfully more destructive action than
  // undoing your own last stroke, so it gets the same stricter guard as
  // mute/remove/lock rather than RoomMemberGuard.
  async clearWhiteboard(roomId: string): Promise<void> {
    await this.getRoomById(roomId);
    await this.prisma.whiteboardStroke.deleteMany({ where: { roomId } });
  }
}
