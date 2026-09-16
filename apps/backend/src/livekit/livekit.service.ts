import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
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

  // Grants mirror the role/grant scheme decided in WEBRTC_LIVEKIT.md #2:
  // host can admin the room (mute/remove others, trigger recording),
  // participant can publish/subscribe their own media, viewer is
  // subscribe-only. Never derived from client input — always looked up
  // server-side from the Participant row for this exact user+room.
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
      canPublish: params.role !== 'viewer',
      canSubscribe: true,
      canPublishData: params.role !== 'viewer',
      roomAdmin: params.role === 'host',
      roomRecord: params.role === 'host',
      // Lets a participant call localParticipant.setMetadata() on
      // themselves client-side (used for raise-hand — see
      // RaiseHandControl.tsx and FEATURES.md's Research notes). LiveKit
      // enforces the "own" part of this grant server-side: it only ever
      // allows a participant to update THEIR OWN metadata, never another
      // participant's, so this can't be used to forge someone else's
      // state. Off by default in LiveKit, same viewer carve-out as
      // canPublish/canPublishData above.
      canUpdateOwnMetadata: params.role !== 'viewer',
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
  private getRoomService(): RoomServiceClient {
    if (!this.roomService) {
      const wsUrl = this.getUrl();
      const httpUrl = wsUrl.replace(/^ws/, 'http');
      const apiKey = this.config.get<string>('LIVEKIT_API_KEY');
      const apiSecret = this.config.get<string>('LIVEKIT_API_SECRET');
      this.roomService = new RoomServiceClient(httpUrl, apiKey, apiSecret);
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
