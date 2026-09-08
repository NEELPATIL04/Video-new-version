import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken, VideoGrant } from 'livekit-server-sdk';
import { RoomRole } from '@prisma/client';

@Injectable()
export class LiveKitService {
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
}
