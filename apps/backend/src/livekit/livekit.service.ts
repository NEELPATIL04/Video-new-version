import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  ParticipantPermission,
  RoomServiceClient,
  ServerError,
  TrackType,
  VideoGrant,
} from 'livekit-server-sdk';
import { RoomRole } from '@prisma/client';

// Thrown when a RoomServiceClient call (mute/remove/updateParticipant)
// targets a participant our own DB says is active but LiveKit's live room
// no longer has — e.g. mid-reconnect after a dropped connection, or any
// window where our Participant.leftAt hasn't caught up yet. Lets
// RoomsService translate this into a clean, honest NotFoundException
// instead of an unhandled 500 leaking LiveKit's raw Twirp error. See
// isParticipantNotConnected below for why this is detected via the
// Twirp response's HTTP status rather than its `code` field.
export class LiveKitParticipantNotConnectedError extends Error {
  constructor(roomId: string, identity: string) {
    super(
      `Participant "${identity}" is not currently connected to LiveKit room "${roomId}"`,
    );
    this.name = 'LiveKitParticipantNotConnectedError';
  }
}

// LiveKit's Twirp server returns HTTP 404 for "participant does not
// exist" (confirmed by observing a real response — response.statusText
// was "Not Found" — while building the lower-hand feature), but its own
// `code` field for this case is the unhelpfully generic "unknown", not
// a distinguishable Twirp code. The HTTP status is the only reliable
// signal here, so that's what this matches on rather than `code` or a
// fragile substring match on `message`.
function isParticipantNotConnected(error: unknown): boolean {
  return error instanceof ServerError && error.status === 404;
}

@Injectable()
export class LiveKitService {
  private roomService: RoomServiceClient | null = null;

  constructor(private readonly config: ConfigService) {}

  // A viewer (see Room.webinarMode in schema.prisma) is the only role
  // that ever differs on the one grant that actually matters for media:
  // whether this identity can publish its own audio/video/screen-share
  // tracks at all. Shared by createAccessToken below (the token minted
  // at join time) AND updateParticipantPermissions (a LIVE permission
  // update for an already-connected participant, used when a webinar
  // viewer is promoted/demoted mid-call) so the two can't drift apart.
  private canPublishForRole(role: RoomRole): boolean {
    return role !== 'viewer';
  }

  // Grants mirror the role/grant scheme decided in WEBRTC_LIVEKIT.md #2:
  // host/cohost/participant can publish+subscribe their own media, a
  // viewer is subscribe-only for MEDIA specifically — chat, reactions,
  // raise-hand, and poll votes all go over canPublishData/
  // canUpdateOwnMetadata instead, which stay true for everyone
  // (including a viewer) so a webinar's view-only attendees can still be
  // an interactive audience, not a fully silent one. Never derived from
  // client input — always looked up server-side from the Participant row
  // for this exact user+room.
  async createAccessToken(params: {
    identity: string;
    name: string;
    roomId: string;
    role: RoomRole;
  }): Promise<string> {
    const apiKey = this.config.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.config.get<string>('LIVEKIT_API_SECRET');

    const token = new AccessToken(apiKey, apiSecret, {
      identity: params.identity,
      name: params.name,
      ttl: '10m',
    });

    const grant: VideoGrant = {
      room: params.roomId,
      roomJoin: true,
      canPublish: this.canPublishForRole(params.role),
      canSubscribe: true,
      canPublishData: true,
      // A co-host performs genuinely admin-shaped actions (mute, remove,
      // admit, deny, lock, lower-hand — see RoomHostOrCoHostGuard), so
      // they get roomAdmin too. roomRecord stays host-only: recording
      // isn't built yet, and there's no reason to pre-grant it broadly
      // ahead of that feature's own access-control design. Neither grant
      // is actually consumed by any client-side code in this app today —
      // every one of those actions goes through our OWN backend's
      // RoomServiceClient (the backend's API key/secret, not the caller's
      // personal token) — so this is about token correctness/future-
      // proofing, not something a client SDK call depends on right now.
      roomAdmin: params.role === 'host' || params.role === 'cohost',
      roomRecord: params.role === 'host',
      // Lets a participant call localParticipant.setMetadata() on
      // themselves client-side (used for raise-hand — see
      // RaiseHandControl.tsx and FEATURES.md's Research notes). LiveKit
      // enforces the "own" part of this grant server-side: it only ever
      // allows a participant to update THEIR OWN metadata, never another
      // participant's, so this can't be used to forge someone else's
      // state. True for everyone, including a viewer — raising a hand
      // doesn't require publish rights.
      canUpdateOwnMetadata: true,
    };
    token.addGrant(grant);

    return token.toJwt();
  }

  getUrl(): string {
    return this.config.get<string>('LIVEKIT_URL', '');
  }

  // RoomServiceClient is the server-to-server admin API (twirp/HTTP),
  // separate from the ws:// URL clients use to connect — LIVEKIT_URL is
  // ws://.../wss://... for the client, so it needs mapping to http(s)://
  // here. Lazily constructed and cached rather than built per-call.
  //
  // requestTimeout bounds every call through this client. Without it, a
  // slow/unreachable LiveKit admin API would hang indefinitely — most
  // consequentially for isIdentityConnected below, which (unlike
  // mute/remove/setHandRaised, all explicit host actions) now sits in
  // the ordinary join path every already-admitted participant hits.
  private getRoomService(): RoomServiceClient {
    if (!this.roomService) {
      const wsUrl = this.getUrl();
      const httpUrl = wsUrl.replace(/^ws/, 'http');
      const apiKey = this.config.get<string>('LIVEKIT_API_KEY');
      const apiSecret = this.config.get<string>('LIVEKIT_API_SECRET');
      this.roomService = new RoomServiceClient(httpUrl, apiKey, apiSecret, {
        requestTimeout: 5,
      });
    }
    return this.roomService;
  }

  // Mutes the participant's microphone track specifically (not video) —
  // a host silencing a disruptive speaker shouldn't also black out their
  // camera. No-ops if they haven't published audio (e.g. joined muted
  // already) rather than erroring, since that's not actually a failure.
  async muteParticipantAudio(roomId: string, identity: string): Promise<void> {
    const roomService = this.getRoomService();
    try {
      const participant = await roomService.getParticipant(roomId, identity);
      const audioTrack = participant.tracks.find(
        (t) => t.type === TrackType.AUDIO,
      );
      if (!audioTrack) return;
      await roomService.mutePublishedTrack(
        roomId,
        identity,
        audioTrack.sid,
        true,
      );
    } catch (error) {
      if (isParticipantNotConnected(error)) {
        throw new LiveKitParticipantNotConnectedError(roomId, identity);
      }
      throw error;
    }
  }

  async removeParticipant(roomId: string, identity: string): Promise<void> {
    try {
      await this.getRoomService().removeParticipant(roomId, identity);
    } catch (error) {
      if (isParticipantNotConnected(error)) {
        throw new LiveKitParticipantNotConnectedError(roomId, identity);
      }
      throw error;
    }
  }

  // Used by RoomsService.joinRoom to detect "this identity is already
  // live in this LiveKit room" before minting a second access token for
  // it — unlike mute/remove above, "not connected" is the EXPECTED,
  // non-error outcome here (proceed with the join), not a failure to
  // translate into LiveKitParticipantNotConnectedError.
  async isIdentityConnected(
    roomId: string,
    identity: string,
  ): Promise<boolean> {
    try {
      await this.getRoomService().getParticipant(roomId, identity);
      return true;
    } catch (error) {
      if (isParticipantNotConnected(error)) return false;
      throw error;
    }
  }

  // Updates an ALREADY-CONNECTED participant's live enforced permissions
  // — not just metadata. Used by RoomsService.promoteToCoHost/
  // demoteCoHost specifically for a webinar's viewer<->cohost
  // transition, where canPublish genuinely flips (unlike a plain
  // participant<->cohost promotion, where canPublish never changes and
  // this call would be a no-op — still safe to make regardless, just
  // pointless there). Confirmed via the SDK's own shipped types
  // (RoomServiceClient.updateParticipant's `permission` parameter,
  // ParticipantPermission's canSubscribe/canPublish/canPublishData
  // fields) that this genuinely updates what LiveKit enforces for a live
  // connection, not just a value the client can read — the promoted
  // participant does not need to reconnect.
  async updateParticipantPermissions(
    roomId: string,
    identity: string,
    role: RoomRole,
  ): Promise<void> {
    const permission: Partial<ParticipantPermission> = {
      canSubscribe: true,
      canPublish: this.canPublishForRole(role),
      canPublishData: true,
    };
    try {
      await this.getRoomService().updateParticipant(
        roomId,
        identity,
        undefined,
        permission,
      );
    } catch (error) {
      if (isParticipantNotConnected(error)) {
        throw new LiveKitParticipantNotConnectedError(roomId, identity);
      }
      throw error;
    }
  }

  // A breakout room is just another ordinary LiveKit room (see
  // FEATURES.md's Research notes) — there is no "breakout" primitive in
  // LiveKit at all. Pre-creating it explicitly (rather than relying on
  // LiveKit's implicit "first participant to join creates the room"
  // behavior) means an empty breakout room the host hasn't assigned
  // anyone to yet still genuinely exists as a room, and its name is
  // always the BreakoutRoom's own id — a fresh, unguessable UUID distinct
  // from any main Room's id (different table, same id space, and neither
  // is ever derived from the other), so there's no risk of a breakout
  // room name colliding with an existing main-room LiveKit room.
  async createBreakoutRoom(name: string): Promise<void> {
    await this.getRoomService().createRoom({ name });
  }

  // Best-effort cleanup when the host ends breakouts — deliberately NOT
  // in the critical path. Our own DB state (BreakoutRoom.endedAt,
  // Participant.breakoutRoomId cleared) is the source of truth a
  // participant's poll reacts to; if LiveKit's room happens to already be
  // gone (e.g. its emptyTimeout already fired) or this call otherwise
  // fails, that must never block the DB-level "breakouts have ended" from
  // taking effect.
  async deleteBreakoutRoom(name: string): Promise<void> {
    try {
      await this.getRoomService().deleteRoom(name);
    } catch {
      // Swallowed deliberately — see comment above.
    }
  }

  // Only used for the HOST-lowers-ANOTHER-participant's-hand path.
  // Raising/lowering your OWN hand goes straight from the browser via
  // localParticipant.setMetadata() (see the canUpdateOwnMetadata grant
  // above) — that call can only ever touch the caller's own metadata, so
  // it has no way to reach another participant's state. This method is
  // what lets a host act on someone else's, via the same server-to-server
  // RoomServiceClient used for mute/remove above.
  //
  // Overwrites the participant's whole metadata string rather than
  // merging fields — safe today because raised-hand is the only thing
  // stored there. If a second field is ever added to participant
  // metadata, this needs to read-modify-write instead.
  async setHandRaised(
    roomId: string,
    identity: string,
    raised: boolean,
  ): Promise<void> {
    try {
      await this.getRoomService().updateParticipant(
        roomId,
        identity,
        JSON.stringify({ handRaised: raised }),
      );
    } catch (error) {
      if (isParticipantNotConnected(error)) {
        throw new LiveKitParticipantNotConnectedError(roomId, identity);
      }
      throw error;
    }
  }
}
