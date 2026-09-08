import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TokenVerifier } from 'livekit-server-sdk';
import { LiveKitService } from './livekit.service';

// Real AccessToken/TokenVerifier are used (not mocked) — round-tripping an
// actual signed JWT is the only way to prove the grants we think we're
// issuing are the grants a LiveKit server would actually enforce.
describe('LiveKitService', () => {
  let service: LiveKitService;
  const apiKey = 'test-key';
  const apiSecret = 'test-secret-at-least-32-chars-long';

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        LiveKitService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'LIVEKIT_API_KEY') return apiKey;
              if (key === 'LIVEKIT_API_SECRET') return apiSecret;
              if (key === 'LIVEKIT_URL') return 'ws://localhost:7880';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(LiveKitService);
  });

  const decode = async (jwt: string) =>
    new TokenVerifier(apiKey, apiSecret).verify(jwt);

  it('issues a valid, verifiable token carrying the right identity and room', async () => {
    const jwt = await service.createAccessToken({
      identity: 'user-1',
      name: 'Alice',
      roomId: 'room-1',
      role: 'participant',
    });

    const claims = await decode(jwt);
    expect(claims.sub).toBe('user-1');
    expect(claims.video?.room).toBe('room-1');
  });

  it('grants a host full admin + recording rights', async () => {
    const jwt = await service.createAccessToken({
      identity: 'host-1',
      name: 'Host',
      roomId: 'room-1',
      role: 'host',
    });

    const claims = await decode(jwt);
    expect(claims.video?.roomAdmin).toBe(true);
    expect(claims.video?.roomRecord).toBe(true);
    expect(claims.video?.canPublish).toBe(true);
    expect(claims.video?.canSubscribe).toBe(true);
  });

  it('grants a participant publish+subscribe but never admin/record', async () => {
    const jwt = await service.createAccessToken({
      identity: 'user-2',
      name: 'Bob',
      roomId: 'room-1',
      role: 'participant',
    });

    const claims = await decode(jwt);
    expect(claims.video?.canPublish).toBe(true);
    expect(claims.video?.canSubscribe).toBe(true);
    expect(claims.video?.roomAdmin).toBeFalsy();
    expect(claims.video?.roomRecord).toBeFalsy();
  });

  it('grants a viewer subscribe-only — never publish, never admin', async () => {
    const jwt = await service.createAccessToken({
      identity: 'user-3',
      name: 'Carol',
      roomId: 'room-1',
      role: 'viewer',
    });

    const claims = await decode(jwt);
    expect(claims.video?.canPublish).toBe(false);
    expect(claims.video?.canPublishData).toBe(false);
    expect(claims.video?.canSubscribe).toBe(true);
    expect(claims.video?.roomAdmin).toBeFalsy();
  });

  it('never issues a valid token for a wrong secret (confirms real signing, not a stub)', async () => {
    const jwt = await service.createAccessToken({
      identity: 'user-1',
      name: 'Alice',
      roomId: 'room-1',
      role: 'participant',
    });

    await expect(
      new TokenVerifier(apiKey, 'wrong-secret-that-is-long-enough').verify(jwt),
    ).rejects.toBeDefined();
  });

  it('getUrl returns the configured LiveKit URL', () => {
    expect(service.getUrl()).toBe('ws://localhost:7880');
  });
});
