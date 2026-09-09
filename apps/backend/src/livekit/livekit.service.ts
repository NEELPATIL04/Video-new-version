import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  RoomServiceClient,
  TrackType,
  VideoGrant,
} from 'livekit-server-sdk';
import { RoomRole } from '@prisma/client';

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
  }

  async removeParticipant(roomId: string, identity: string): Promise<void> {
    await this.getRoomService().removeParticipant(roomId, identity);
  }
}
