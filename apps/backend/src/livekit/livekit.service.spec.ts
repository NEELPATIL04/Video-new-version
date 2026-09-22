import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ServerError, TokenVerifier } from 'livekit-server-sdk';
import {
  LiveKitParticipantNotConnectedError,
  LiveKitService,
} from './livekit.service';

// Only RoomServiceClient is mocked here (the server-to-server admin API
// that talks to a real LiveKit server over HTTP) — AccessToken/
// TokenVerifier/ServerError above are the genuine SDK classes, same as
// the rest of this file's "real signing, not a stub" approach.
const mockGetParticipant = jest.fn();
const mockMutePublishedTrack = jest.fn();
const mockRemoveParticipant = jest.fn();
const mockUpdateParticipant = jest.fn();
const mockCreateRoom = jest.fn();
const mockDeleteRoom = jest.fn();
jest.mock('livekit-server-sdk', () => {
  const actual = jest.requireActual('livekit-server-sdk');
  return {
    ...actual,
    RoomServiceClient: jest.fn().mockImplementation(() => ({
      getParticipant: mockGetParticipant,
      mutePublishedTrack: mockMutePublishedTrack,
      removeParticipant: mockRemoveParticipant,
      updateParticipant: mockUpdateParticipant,
      createRoom: mockCreateRoom,
      deleteRoom: mockDeleteRoom,
    })),
  };
});

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

  it('grants a co-host roomAdmin but never roomRecord (recording stays owner-only)', async () => {
    const jwt = await service.createAccessToken({
      identity: 'cohost-1',
      name: 'Co-Host',
      roomId: 'room-1',
      role: 'cohost',
    });

    const claims = await decode(jwt);
    expect(claims.video?.roomAdmin).toBe(true);
    expect(claims.video?.roomRecord).toBeFalsy();
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

  // A viewer (webinar-mode attendee — see Room.webinarMode in
  // schema.prisma) can't publish their own audio/video/screen, but IS
  // still an interactive attendee: canPublishData (chat, reactions, poll
  // votes) and canUpdateOwnMetadata (raise-hand) both stay true so a
  // webinar's view-only audience isn't a fully silent one.
  it('grants a viewer subscribe-only for media, but still interactive (chat/react/raise-hand)', async () => {
    const jwt = await service.createAccessToken({
      identity: 'user-3',
      name: 'Carol',
      roomId: 'room-1',
      role: 'viewer',
    });

    const claims = await decode(jwt);
    expect(claims.video?.canPublish).toBe(false);
    expect(claims.video?.canPublishData).toBe(true);
    expect(claims.video?.canUpdateOwnMetadata).toBe(true);
    expect(claims.video?.canSubscribe).toBe(true);
    expect(claims.video?.roomAdmin).toBeFalsy();
  });

  // Raise-hand relies on a participant being able to set THEIR OWN
  // LiveKit metadata client-side (see RaiseHandControl.tsx) — LiveKit
  // only allows this at all when canUpdateOwnMetadata is granted, and
  // (per LiveKit's own semantics) it only ever lets a participant touch
  // their own metadata, never someone else's, which is exactly why the
  // self raise/lower path needs no backend round trip. True for every
  // role, including a viewer — see the test above.
  it('grants canUpdateOwnMetadata to every role', async () => {
    const hostJwt = await service.createAccessToken({
      identity: 'host-1',
      name: 'Host',
      roomId: 'room-1',
      role: 'host',
    });
    const participantJwt = await service.createAccessToken({
      identity: 'user-2',
      name: 'Bob',
      roomId: 'room-1',
      role: 'participant',
    });

    expect((await decode(hostJwt)).video?.canUpdateOwnMetadata).toBe(true);
    expect((await decode(participantJwt)).video?.canUpdateOwnMetadata).toBe(
      true,
    );
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

  // A breakout room is just another ordinary LiveKit room (see
  // FEATURES.md's Research notes) — these two methods are thin wrappers
  // around the same RoomServiceClient used for everything else here,
  // proving no new admin-API surface was invented for this feature.
  describe('createBreakoutRoom / deleteBreakoutRoom', () => {
    beforeEach(() => {
      mockCreateRoom.mockReset();
      mockDeleteRoom.mockReset();
    });

    it('creates a LiveKit room named after the breakout room id', async () => {
      mockCreateRoom.mockResolvedValue({});

      await service.createBreakoutRoom('breakout-1');

      expect(mockCreateRoom).toHaveBeenCalledWith({ name: 'breakout-1' });
    });

    it('deletes the LiveKit room for a breakout room', async () => {
      mockDeleteRoom.mockResolvedValue(undefined);

      await service.deleteBreakoutRoom('breakout-1');

      expect(mockDeleteRoom).toHaveBeenCalledWith('breakout-1');
    });

    it('swallows a deleteRoom failure rather than throwing — DB state is the source of truth, not LiveKit', async () => {
      mockDeleteRoom.mockRejectedValue(new Error('already gone'));

      await expect(
        service.deleteBreakoutRoom('breakout-1'),
      ).resolves.toBeUndefined();
    });
  });

  // Real evidence this shape is right, not a guess: while building
  // lower-hand, calling RoomServiceClient.updateParticipant() against a
  // participant not currently in the live LiveKit room produced a real
  // Twirp response with statusText "Not Found" (status 404) and a `code`
  // of the unhelpfully generic "unknown" — which is exactly why this is
  // matched on `status`, not `code` or the message string.
  describe('translating LiveKit "participant not found" into a typed error', () => {
    beforeEach(() => {
      mockGetParticipant.mockReset();
      mockMutePublishedTrack.mockReset();
      mockRemoveParticipant.mockReset();
      mockUpdateParticipant.mockReset();
    });

    const notFoundError = () =>
      new ServerError(
        'Not Found',
        'twirp error unknown: participant does not exist',
        404,
        'unknown',
      );

    it('muteParticipantAudio throws LiveKitParticipantNotConnectedError on a 404', async () => {
      mockGetParticipant.mockRejectedValue(notFoundError());

      await expect(
        service.muteParticipantAudio('room-1', 'user-2'),
      ).rejects.toBeInstanceOf(LiveKitParticipantNotConnectedError);
    });

    it('removeParticipant throws LiveKitParticipantNotConnectedError on a 404', async () => {
      mockRemoveParticipant.mockRejectedValue(notFoundError());

      await expect(
        service.removeParticipant('room-1', 'user-2'),
      ).rejects.toBeInstanceOf(LiveKitParticipantNotConnectedError);
    });

    it('setHandRaised throws LiveKitParticipantNotConnectedError on a 404', async () => {
      mockUpdateParticipant.mockRejectedValue(notFoundError());

      await expect(
        service.setHandRaised('room-1', 'user-2', false),
      ).rejects.toBeInstanceOf(LiveKitParticipantNotConnectedError);
    });

    it('does not swallow an unrelated LiveKit error (e.g. a real 500) as "not connected"', async () => {
      mockRemoveParticipant.mockRejectedValue(
        new ServerError('Internal Server Error', 'boom', 500, 'internal'),
      );

      await expect(
        service.removeParticipant('room-1', 'user-2'),
      ).rejects.toThrow('boom');
    });

    it('does not swallow a non-LiveKit error either', async () => {
      mockRemoveParticipant.mockRejectedValue(new Error('network down'));

      await expect(
        service.removeParticipant('room-1', 'user-2'),
      ).rejects.toThrow('network down');
    });
  });

  // Used by RoomsService.joinRoom to detect a duplicate-device join
  // before minting a second token — unlike the block above, "not
  // connected" here is the expected outcome (resolves false), never an
  // error to translate.
  describe('isIdentityConnected', () => {
    beforeEach(() => {
      mockGetParticipant.mockReset();
    });

    const notFoundError = () =>
      new ServerError(
        'Not Found',
        'twirp error unknown: participant does not exist',
        404,
        'unknown',
      );

    it('resolves true when LiveKit reports the identity as live', async () => {
      mockGetParticipant.mockResolvedValue({ identity: 'user-2' });

      await expect(
        service.isIdentityConnected('room-1', 'user-2'),
      ).resolves.toBe(true);
    });

    it('resolves false on a 404 instead of throwing', async () => {
      mockGetParticipant.mockRejectedValue(notFoundError());

      await expect(
        service.isIdentityConnected('room-1', 'user-2'),
      ).resolves.toBe(false);
    });

    it('does not swallow an unrelated LiveKit error as "not connected"', async () => {
      mockGetParticipant.mockRejectedValue(
        new ServerError('Internal Server Error', 'boom', 500, 'internal'),
      );

      await expect(
        service.isIdentityConnected('room-1', 'user-2'),
      ).rejects.toThrow('boom');
    });
  });

  // Used by RoomsService.promoteToCoHost/demoteCoHost for a webinar's
  // viewer<->cohost transition — updates an ALREADY-CONNECTED
  // participant's live enforced permissions, same three-case error shape
  // as the rest of this file (isParticipantNotConnected on a 404, rethrow
  // otherwise), but ALSO has to get the actual permission payload right
  // per role, since that's the one thing this method exists to change.
  describe('updateParticipantPermissions', () => {
    beforeEach(() => {
      mockUpdateParticipant.mockReset();
    });

    const notFoundError = () =>
      new ServerError(
        'Not Found',
        'twirp error unknown: participant does not exist',
        404,
        'unknown',
      );

    it('grants canPublish for cohost (a promoted webinar viewer can start publishing)', async () => {
      mockUpdateParticipant.mockResolvedValue({});

      await service.updateParticipantPermissions('room-1', 'user-2', 'cohost');

      expect(mockUpdateParticipant).toHaveBeenCalledWith(
        'room-1',
        'user-2',
        undefined,
        expect.objectContaining({
          canPublish: true,
          canPublishData: true,
          canSubscribe: true,
        }),
      );
    });

    it('revokes canPublish for viewer (a demoted webinar presenter loses it again)', async () => {
      mockUpdateParticipant.mockResolvedValue({});

      await service.updateParticipantPermissions('room-1', 'user-2', 'viewer');

      expect(mockUpdateParticipant).toHaveBeenCalledWith(
        'room-1',
        'user-2',
        undefined,
        expect.objectContaining({
          canPublish: false,
          canPublishData: true,
        }),
      );
    });

    it('throws LiveKitParticipantNotConnectedError on a 404', async () => {
      mockUpdateParticipant.mockRejectedValue(notFoundError());

      await expect(
        service.updateParticipantPermissions('room-1', 'user-2', 'cohost'),
      ).rejects.toBeInstanceOf(LiveKitParticipantNotConnectedError);
    });

    it('does not swallow an unrelated LiveKit error', async () => {
      mockUpdateParticipant.mockRejectedValue(
        new ServerError('Internal Server Error', 'boom', 500, 'internal'),
      );

      await expect(
        service.updateParticipantPermissions('room-1', 'user-2', 'cohost'),
      ).rejects.toThrow('boom');
    });
  });
});
