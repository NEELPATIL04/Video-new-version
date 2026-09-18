import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  LiveKitParticipantNotConnectedError,
  LiveKitService,
} from '../livekit/livekit.service';

describe('RoomsService', () => {
  let service: RoomsService;
  let prisma: {
    room: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    participant: {
      create: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
      count: jest.Mock;
      findMany: jest.Mock;
    };
    whiteboardStroke: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
    meetingTemplate: {
      findUnique: jest.Mock;
    };
    agendaItem: {
      create: jest.Mock;
      createMany: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let liveKit: {
    muteParticipantAudio: jest.Mock;
    removeParticipant: jest.Mock;
    createAccessToken: jest.Mock;
    getUrl: jest.Mock;
    setHandRaised: jest.Mock;
  };

  const makeRoom = (overrides: Record<string, unknown> = {}) => ({
    id: 'room-1',
    name: 'Standup',
    status: 'scheduled',
    scheduledFor: null,
    maxParticipants: 2,
    hostId: 'host-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    e2eeEnabled: false,
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      room: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      participant: {
        create: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
      whiteboardStroke: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      meetingTemplate: {
        findUnique: jest.fn(),
      },
      agendaItem: {
        create: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn((arg) => {
        // Mirrors Prisma's two $transaction call shapes used in the
        // service: a callback (createRoom) and an array of already-issued
        // operations (cancelRoom/endRoom).
        if (typeof arg === 'function') return arg(prisma);
        return Promise.all(arg);
      }),
    };

    liveKit = {
      muteParticipantAudio: jest.fn(),
      removeParticipant: jest.fn(),
      createAccessToken: jest.fn().mockResolvedValue('signed-token'),
      getUrl: jest.fn().mockReturnValue('ws://localhost:7880'),
      setHandRaised: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RoomsService,
        { provide: PrismaService, useValue: prisma },
        { provide: LiveKitService, useValue: liveKit },
      ],
    }).compile();

    service = moduleRef.get(RoomsService);
  });

  describe('createRoom', () => {
    it('creates the room and a host Participant row together', async () => {
      const room = makeRoom();
      prisma.room.create.mockResolvedValue(room);
      prisma.participant.create.mockResolvedValue({ id: 'p-1', role: 'host' });

      const result = await service.createRoom('host-1', { name: 'Standup' });

      expect(prisma.room.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: 'Standup', hostId: 'host-1' }),
      });
      expect(prisma.participant.create).toHaveBeenCalledWith({
        data: {
          roomId: room.id,
          userId: 'host-1',
          role: 'host',
          admittedAt: expect.any(Date),
        },
      });
      expect(result).toBe(room);
    });

    it('defaults e2eeEnabled to false when not specified', async () => {
      const room = makeRoom();
      prisma.room.create.mockResolvedValue(room);
      prisma.participant.create.mockResolvedValue({ id: 'p-1', role: 'host' });

      await service.createRoom('host-1', { name: 'Standup' });

      expect(prisma.room.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ e2eeEnabled: false }),
      });
    });

    it('persists e2eeEnabled: true when the host opts in at creation', async () => {
      const room = makeRoom({ e2eeEnabled: true });
      prisma.room.create.mockResolvedValue(room);
      prisma.participant.create.mockResolvedValue({ id: 'p-1', role: 'host' });

      await service.createRoom('host-1', {
        name: 'Standup',
        e2eeEnabled: true,
      });

      expect(prisma.room.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ e2eeEnabled: true }),
      });
    });

    it('rejects a scheduledFor date that is not in the future', async () => {
      await expect(
        service.createRoom('host-1', {
          name: 'Standup',
          scheduledFor: new Date(Date.now() - 60_000).toISOString(),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.room.create).not.toHaveBeenCalled();
    });

    it('accepts a scheduledFor date in the future', async () => {
      const room = makeRoom({ status: 'scheduled' });
      prisma.room.create.mockResolvedValue(room);
      prisma.participant.create.mockResolvedValue({ id: 'p-1', role: 'host' });
      const future = new Date(Date.now() + 60 * 60_000).toISOString();

      await service.createRoom('host-1', {
        name: 'Standup',
        scheduledFor: future,
      });

      expect(prisma.room.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ scheduledFor: new Date(future) }),
      });
    });

    it('generates a 9-digit joinCode and includes it in the created room', async () => {
      prisma.room.findUnique.mockResolvedValue(null); // no collision
      const room = makeRoom();
      prisma.room.create.mockResolvedValue(room);
      prisma.participant.create.mockResolvedValue({ id: 'p-1', role: 'host' });

      await service.createRoom('host-1', { name: 'Standup' });

      expect(prisma.room.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          joinCode: expect.stringMatching(/^\d{9}$/),
        }),
      });
    });

    it('retries join code generation on a collision', async () => {
      // First candidate collides (findUnique returns an existing room),
      // second candidate is free.
      prisma.room.findUnique
        .mockResolvedValueOnce({ id: 'some-other-room' })
        .mockResolvedValueOnce(null);
      const room = makeRoom();
      prisma.room.create.mockResolvedValue(room);
      prisma.participant.create.mockResolvedValue({ id: 'p-1', role: 'host' });

      await service.createRoom('host-1', { name: 'Standup' });

      expect(prisma.room.findUnique).toHaveBeenCalledTimes(2);
      expect(prisma.room.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          joinCode: expect.stringMatching(/^\d{9}$/),
        }),
      });
    });

    it("seeds AgendaItem rows from the template's agendaItems, in order, inside the same transaction", async () => {
      prisma.meetingTemplate.findUnique.mockResolvedValue({
        hostId: 'host-1',
        agendaItems: ['Kickoff', 'Retro'],
      });
      const room = makeRoom();
      prisma.room.create.mockResolvedValue(room);
      prisma.participant.create.mockResolvedValue({ id: 'p-1', role: 'host' });

      await service.createRoom('host-1', {
        name: 'Standup',
        templateId: 'template-1',
      });

      expect(prisma.meetingTemplate.findUnique).toHaveBeenCalledWith({
        where: { id: 'template-1' },
        select: { hostId: true, agendaItems: true },
      });
      expect(prisma.agendaItem.createMany).toHaveBeenCalledWith({
        data: [
          { roomId: room.id, title: 'Kickoff', order: 0 },
          { roomId: room.id, title: 'Retro', order: 1 },
        ],
      });
    });

    it('does not touch agendaItem when the template has an empty agenda', async () => {
      prisma.meetingTemplate.findUnique.mockResolvedValue({
        hostId: 'host-1',
        agendaItems: [],
      });
      prisma.room.create.mockResolvedValue(makeRoom());
      prisma.participant.create.mockResolvedValue({ id: 'p-1', role: 'host' });

      await service.createRoom('host-1', {
        name: 'Standup',
        templateId: 'template-1',
      });

      expect(prisma.agendaItem.createMany).not.toHaveBeenCalled();
    });

    it('rejects a templateId that does not exist (never silently ignored)', async () => {
      prisma.meetingTemplate.findUnique.mockResolvedValue(null);

      await expect(
        service.createRoom('host-1', {
          name: 'Standup',
          templateId: 'template-x',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.room.create).not.toHaveBeenCalled();
    });

    it('rejects a templateId that belongs to a different host', async () => {
      prisma.meetingTemplate.findUnique.mockResolvedValue({
        hostId: 'someone-else',
        agendaItems: ['Kickoff'],
      });

      await expect(
        service.createRoom('host-1', {
          name: 'Standup',
          templateId: 'template-1',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.room.create).not.toHaveBeenCalled();
    });
  });

  describe('findRoomByCode', () => {
    it('strips non-digit characters before looking up the code', async () => {
      prisma.room.findUnique.mockResolvedValue(makeRoom());

      await service.findRoomByCode('482 913 657');

      expect(prisma.room.findUnique).toHaveBeenCalledWith({
        where: { joinCode: '482913657' },
      });
    });

    it('throws NotFoundException when no room matches the code', async () => {
      prisma.room.findUnique.mockResolvedValue(null);

      await expect(service.findRoomByCode('000000000')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns the matching room', async () => {
      const room = makeRoom();
      prisma.room.findUnique.mockResolvedValue(room);

      const result = await service.findRoomByCode('482913657');

      expect(result).toBe(room);
    });
  });

  describe('getRoomById', () => {
    it('throws NotFoundException for a missing room', async () => {
      prisma.room.findUnique.mockResolvedValue(null);
      await expect(service.getRoomById('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('lockRoom / unlockRoom', () => {
    it('lockRoom sets locked: true on an existing room', async () => {
      prisma.room.findUnique.mockResolvedValue(makeRoom());
      prisma.room.update.mockResolvedValue(makeRoom({ locked: true }));

      await service.lockRoom('room-1');

      expect(prisma.room.update).toHaveBeenCalledWith({
        where: { id: 'room-1' },
        data: { locked: true },
      });
    });

    it('unlockRoom sets locked: false on an existing room', async () => {
      prisma.room.findUnique.mockResolvedValue(makeRoom({ locked: true }));
      prisma.room.update.mockResolvedValue(makeRoom({ locked: false }));

      await service.unlockRoom('room-1');

      expect(prisma.room.update).toHaveBeenCalledWith({
        where: { id: 'room-1' },
        data: { locked: false },
      });
    });

    it('lockRoom throws NotFoundException for a missing room', async () => {
      prisma.room.findUnique.mockResolvedValue(null);
      await expect(service.lockRoom('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.room.update).not.toHaveBeenCalled();
    });
  });

  describe('cancelRoom', () => {
    it("hard-deletes a room that hasn't started yet", async () => {
      prisma.room.findUnique.mockResolvedValue(
        makeRoom({ status: 'scheduled' }),
      );
      prisma.participant.deleteMany.mockResolvedValue({ count: 1 });
      prisma.room.delete.mockResolvedValue({});

      await service.cancelRoom('room-1');

      expect(prisma.participant.deleteMany).toHaveBeenCalledWith({
        where: { roomId: 'room-1' },
      });
      expect(prisma.room.delete).toHaveBeenCalledWith({
        where: { id: 'room-1' },
      });
    });

    it('refuses to cancel a room that has already gone active', async () => {
      prisma.room.findUnique.mockResolvedValue(makeRoom({ status: 'active' }));

      await expect(service.cancelRoom('room-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.room.delete).not.toHaveBeenCalled();
    });
  });

  describe('endRoom', () => {
    it('marks the room ended and clears leftAt for active participants', async () => {
      prisma.room.findUnique.mockResolvedValue(makeRoom({ status: 'active' }));
      prisma.room.update.mockResolvedValue({});
      prisma.participant.updateMany.mockResolvedValue({ count: 2 });

      await service.endRoom('room-1');

      expect(prisma.room.update).toHaveBeenCalledWith({
        where: { id: 'room-1' },
        data: { status: 'ended' },
      });
      expect(prisma.participant.updateMany).toHaveBeenCalledWith({
        where: { roomId: 'room-1', leftAt: null },
        data: { leftAt: expect.any(Date) },
      });
    });

    it('refuses to end an already-ended room', async () => {
      prisma.room.findUnique.mockResolvedValue(makeRoom({ status: 'ended' }));

      await expect(service.endRoom('room-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('joinRoom', () => {
    it('rejects joining a room that has already ended', async () => {
      prisma.room.findUnique.mockResolvedValue(makeRoom({ status: 'ended' }));

      await expect(service.joinRoom('room-1', 'user-2')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects a new joiner once the room is at capacity', async () => {
      prisma.room.findUnique.mockResolvedValue(
        makeRoom({ status: 'active', maxParticipants: 2 }),
      );
      prisma.participant.count.mockResolvedValue(2);
      prisma.participant.findUnique.mockResolvedValue(null); // not already a member

      await expect(service.joinRoom('room-1', 'user-3')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('checks capacity against ADMITTED participants only — a full waiting room must never block new arrivals', async () => {
      // The whole point of a lobby is letting people queue up beyond live
      // capacity — if a waiting room could itself fill "the room", it
      // would defeat its own purpose the moment two people are waiting.
      prisma.room.findUnique.mockResolvedValue(
        makeRoom({ status: 'active', maxParticipants: 2 }),
      );
      prisma.participant.count.mockResolvedValue(0); // 0 currently admitted
      prisma.participant.findUnique.mockResolvedValue(null);
      prisma.participant.upsert.mockResolvedValue({
        id: 'p-3',
        userId: 'user-3',
        role: 'participant',
        admittedAt: null,
        user: { name: 'User Three' },
      });

      await service.joinRoom('room-1', 'user-3');

      expect(prisma.participant.count).toHaveBeenCalledWith({
        where: { roomId: 'room-1', leftAt: null, admittedAt: { not: null } },
      });
    });

    it('lets an existing member rejoin even when the room is at capacity', async () => {
      prisma.room.findUnique.mockResolvedValue(
        makeRoom({ status: 'active', maxParticipants: 2 }),
      );
      prisma.participant.count.mockResolvedValue(2);
      prisma.participant.findUnique.mockResolvedValue({ id: 'p-2' }); // already a member
      prisma.participant.upsert.mockResolvedValue({
        id: 'p-2',
        role: 'participant',
      });

      await expect(service.joinRoom('room-1', 'user-2')).resolves.toBeDefined();
    });

    it('rejects a brand-new joiner when the room is locked', async () => {
      prisma.room.findUnique.mockResolvedValue(
        makeRoom({ status: 'active', locked: true }),
      );
      prisma.participant.count.mockResolvedValue(0);
      prisma.participant.findUnique.mockResolvedValue(null); // not already a member

      await expect(
        service.joinRoom('room-1', 'stranger'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.participant.upsert).not.toHaveBeenCalled();
    });

    it('lets an existing member back in while the room is locked (a lock blocks new people, not reconnects)', async () => {
      prisma.room.findUnique.mockResolvedValue(
        makeRoom({ status: 'active', locked: true }),
      );
      prisma.participant.count.mockResolvedValue(1);
      prisma.participant.findUnique.mockResolvedValue({ id: 'p-2' }); // already a member
      prisma.participant.upsert.mockResolvedValue({
        id: 'p-2',
        userId: 'user-2',
        role: 'participant',
        admittedAt: new Date(),
        user: { name: 'User Two' },
      });

      await expect(service.joinRoom('room-1', 'user-2')).resolves.toBeDefined();
    });

    it('the host is never locked out of their own room (their own Participant row always makes them "existing")', async () => {
      prisma.room.findUnique.mockResolvedValue(
        makeRoom({ status: 'active', locked: true, hostId: 'host-1' }),
      );
      prisma.participant.count.mockResolvedValue(1);
      prisma.participant.findUnique.mockResolvedValue({ id: 'p-host' }); // host's own row
      prisma.participant.upsert.mockResolvedValue({
        id: 'p-host',
        userId: 'host-1',
        role: 'host',
        admittedAt: new Date(),
        user: { name: 'Host' },
      });

      await expect(service.joinRoom('room-1', 'host-1')).resolves.toBeDefined();
    });

    it('a locked room still enforces the ended-room check first', async () => {
      prisma.room.findUnique.mockResolvedValue(
        makeRoom({ status: 'ended', locked: true }),
      );

      await expect(
        service.joinRoom('room-1', 'stranger'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('always assigns the participant role on join — never accepts a client-supplied role', async () => {
      prisma.room.findUnique.mockResolvedValue(
        makeRoom({ status: 'active', maxParticipants: 10 }),
      );
      prisma.participant.count.mockResolvedValue(0);
      prisma.participant.findUnique.mockResolvedValue(null);
      prisma.participant.upsert.mockResolvedValue({
        id: 'p-3',
        role: 'participant',
      });

      await service.joinRoom('room-1', 'user-3');

      expect(prisma.participant.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { roomId: 'room-1', userId: 'user-3', role: 'participant' },
        }),
      );
    });

    it('returns "waiting" for a newly-joining non-host, without issuing a LiveKit token', async () => {
      prisma.room.findUnique.mockResolvedValue(
        makeRoom({ status: 'active', maxParticipants: 10 }),
      );
      prisma.participant.count.mockResolvedValue(0);
      prisma.participant.findUnique.mockResolvedValue(null);
      prisma.participant.upsert.mockResolvedValue({
        id: 'p-3',
        userId: 'user-3',
        role: 'participant',
        admittedAt: null,
        user: { name: 'User Three' },
      });

      const result = await service.joinRoom('room-1', 'user-3');

      expect(result).toEqual({
        status: 'waiting',
        participant: expect.objectContaining({ id: 'p-3' }),
      });
      expect(liveKit.createAccessToken).not.toHaveBeenCalled();
    });

    it('returns "admitted" with a LiveKit token for a participant whose admittedAt is already set', async () => {
      prisma.room.findUnique.mockResolvedValue(
        makeRoom({ status: 'active', maxParticipants: 10 }),
      );
      prisma.participant.count.mockResolvedValue(1);
      const admittedAt = new Date();
      prisma.participant.findUnique.mockResolvedValue({ id: 'p-3' });
      prisma.participant.upsert.mockResolvedValue({
        id: 'p-3',
        userId: 'user-3',
        role: 'participant',
        admittedAt,
        user: { name: 'User Three' },
      });

      const result = await service.joinRoom('room-1', 'user-3');

      expect(result).toEqual({
        status: 'admitted',
        participant: expect.objectContaining({ id: 'p-3' }),
        liveKitUrl: 'ws://localhost:7880',
        liveKitToken: 'signed-token',
        e2eeEnabled: false,
      });
      expect(liveKit.createAccessToken).toHaveBeenCalledWith({
        identity: 'user-3',
        name: 'User Three',
        roomId: 'room-1',
        role: 'participant',
      });
    });

    it('never touches admittedAt on the update branch — a reconnect keeps existing admission state', async () => {
      prisma.room.findUnique.mockResolvedValue(
        makeRoom({ status: 'active', maxParticipants: 10 }),
      );
      prisma.participant.count.mockResolvedValue(1);
      prisma.participant.findUnique.mockResolvedValue({ id: 'p-3' }); // already a member
      prisma.participant.upsert.mockResolvedValue({
        id: 'p-3',
        userId: 'user-3',
        role: 'participant',
        admittedAt: null,
        user: { name: 'User Three' },
      });

      await service.joinRoom('room-1', 'user-3');

      expect(prisma.participant.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { leftAt: null, joinedAt: expect.any(Date) },
        }),
      );
    });

    it('transitions a scheduled room to active on the first join', async () => {
      prisma.room.findUnique.mockResolvedValue(
        makeRoom({ status: 'scheduled', maxParticipants: 10 }),
      );
      prisma.participant.count.mockResolvedValue(0);
      prisma.participant.findUnique.mockResolvedValue(null);
      prisma.participant.upsert.mockResolvedValue({
        id: 'p-3',
        admittedAt: null,
      });
      prisma.room.update.mockResolvedValue({});

      await service.joinRoom('room-1', 'user-3');

      expect(prisma.room.update).toHaveBeenCalledWith({
        where: { id: 'room-1' },
        data: { status: 'active' },
      });
    });
  });

  describe('getParticipantStatus', () => {
    it('throws NotFoundException when the caller has no participant record for this room', async () => {
      prisma.participant.findUnique.mockResolvedValue(null);

      await expect(
        service.getParticipantStatus('room-1', 'user-2'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns "denied" once the participant has been denied (leftAt set, never admitted)', async () => {
      prisma.room.findUnique.mockResolvedValue(makeRoom());
      prisma.participant.findUnique.mockResolvedValue({
        id: 'p-2',
        leftAt: new Date(),
        admittedAt: null,
      });

      const result = await service.getParticipantStatus('room-1', 'user-2');

      expect(result).toEqual({ status: 'denied' });
      expect(liveKit.createAccessToken).not.toHaveBeenCalled();
    });

    it('returns "waiting" while still sitting in the waiting room', async () => {
      prisma.room.findUnique.mockResolvedValue(makeRoom());
      prisma.participant.findUnique.mockResolvedValue({
        id: 'p-2',
        leftAt: null,
        admittedAt: null,
        userId: 'user-2',
        role: 'participant',
        user: { name: 'User Two' },
      });

      const result = await service.getParticipantStatus('room-1', 'user-2');

      expect(result).toEqual({
        status: 'waiting',
        participant: expect.objectContaining({ id: 'p-2' }),
      });
    });

    it('returns "admitted" with a fresh LiveKit token once the host has admitted them', async () => {
      prisma.room.findUnique.mockResolvedValue(makeRoom());
      prisma.participant.findUnique.mockResolvedValue({
        id: 'p-2',
        leftAt: null,
        admittedAt: new Date(),
        userId: 'user-2',
        role: 'participant',
        user: { name: 'User Two' },
      });

      const result = await service.getParticipantStatus('room-1', 'user-2');

      expect(result).toEqual({
        status: 'admitted',
        participant: expect.objectContaining({ id: 'p-2' }),
        liveKitUrl: 'ws://localhost:7880',
        liveKitToken: 'signed-token',
        e2eeEnabled: false,
      });
    });

    it('includes e2eeEnabled: true in the admitted result for an encrypted room', async () => {
      prisma.room.findUnique.mockResolvedValue(makeRoom({ e2eeEnabled: true }));
      prisma.participant.findUnique.mockResolvedValue({
        id: 'p-2',
        leftAt: null,
        admittedAt: new Date(),
        userId: 'user-2',
        role: 'participant',
        user: { name: 'User Two' },
      });

      const result = await service.getParticipantStatus('room-1', 'user-2');

      expect(result).toEqual(
        expect.objectContaining({ status: 'admitted', e2eeEnabled: true }),
      );
    });
  });

  describe('listWaitingParticipants', () => {
    it('queries only currently-waiting participants (leftAt null, admittedAt null)', async () => {
      prisma.participant.findMany.mockResolvedValue([]);

      await service.listWaitingParticipants('room-1');

      expect(prisma.participant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { roomId: 'room-1', leftAt: null, admittedAt: null },
        }),
      );
    });
  });

  describe('admitParticipant', () => {
    it('refuses a host admitting themselves', async () => {
      await expect(
        service.admitParticipant('room-1', 'host-1', 'host-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.participant.update).not.toHaveBeenCalled();
    });

    it('refuses to admit someone with no participant record', async () => {
      prisma.participant.findUnique.mockResolvedValue(null);

      await expect(
        service.admitParticipant('room-1', 'host-1', 'stranger'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to admit someone who already left (was denied, or left before being admitted)', async () => {
      prisma.participant.findUnique.mockResolvedValue({
        id: 'p-2',
        leftAt: new Date(),
        admittedAt: null,
      });

      await expect(
        service.admitParticipant('room-1', 'host-1', 'user-2'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to admit someone who is already admitted', async () => {
      prisma.participant.findUnique.mockResolvedValue({
        id: 'p-2',
        leftAt: null,
        admittedAt: new Date(),
      });

      await expect(
        service.admitParticipant('room-1', 'host-1', 'user-2'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('sets admittedAt for a genuinely-waiting participant', async () => {
      prisma.participant.findUnique.mockResolvedValue({
        id: 'p-2',
        leftAt: null,
        admittedAt: null,
      });
      prisma.participant.update.mockResolvedValue({});

      await service.admitParticipant('room-1', 'host-1', 'user-2');

      expect(prisma.participant.update).toHaveBeenCalledWith({
        where: { id: 'p-2' },
        data: { admittedAt: expect.any(Date) },
      });
    });
  });

  describe('denyParticipant', () => {
    it('refuses a host denying themselves', async () => {
      await expect(
        service.denyParticipant('room-1', 'host-1', 'host-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.participant.update).not.toHaveBeenCalled();
    });

    it('refuses to deny someone who is already admitted (not currently waiting)', async () => {
      prisma.participant.findUnique.mockResolvedValue({
        id: 'p-2',
        leftAt: null,
        admittedAt: new Date(),
      });

      await expect(
        service.denyParticipant('room-1', 'host-1', 'user-2'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('sets leftAt (not a delete) for a waiting participant, so they can knock again later', async () => {
      prisma.participant.findUnique.mockResolvedValue({
        id: 'p-2',
        leftAt: null,
        admittedAt: null,
      });
      prisma.participant.update.mockResolvedValue({});

      await service.denyParticipant('room-1', 'host-1', 'user-2');

      expect(prisma.participant.update).toHaveBeenCalledWith({
        where: { id: 'p-2' },
        data: { leftAt: expect.any(Date) },
      });
    });
  });

  describe('leaveRoom', () => {
    it('throws if the caller has no active participant row', async () => {
      prisma.participant.findUnique.mockResolvedValue(null);
      await expect(
        service.leaveRoom('room-1', 'user-2'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws if the caller already left', async () => {
      prisma.participant.findUnique.mockResolvedValue({
        id: 'p-2',
        leftAt: new Date(),
      });
      await expect(
        service.leaveRoom('room-1', 'user-2'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('sets leftAt for a currently-active participant', async () => {
      prisma.participant.findUnique.mockResolvedValue({
        id: 'p-2',
        leftAt: null,
      });
      prisma.participant.update.mockResolvedValue({});

      await service.leaveRoom('room-1', 'user-2');

      expect(prisma.participant.update).toHaveBeenCalledWith({
        where: { id: 'p-2' },
        data: { leftAt: expect.any(Date) },
      });
    });
  });

  describe('isHost / isMember', () => {
    it("isHost is true only for the room's hostId", async () => {
      prisma.room.findUnique.mockResolvedValue({ hostId: 'host-1' });
      expect(await service.isHost('room-1', 'host-1')).toBe(true);
      expect(await service.isHost('room-1', 'someone-else')).toBe(false);
    });

    it('isMember is true for the host without needing a Participant row lookup', async () => {
      prisma.room.findUnique.mockResolvedValue({ hostId: 'host-1' });
      expect(await service.isMember('room-1', 'host-1')).toBe(true);
      expect(prisma.participant.findUnique).not.toHaveBeenCalled();
    });

    it("isMember is true for an active participant, false once they've left", async () => {
      prisma.room.findUnique.mockResolvedValue({ hostId: 'host-1' });

      prisma.participant.findUnique.mockResolvedValueOnce({ leftAt: null });
      expect(await service.isMember('room-1', 'user-2')).toBe(true);

      prisma.participant.findUnique.mockResolvedValueOnce({
        leftAt: new Date(),
      });
      expect(await service.isMember('room-1', 'user-2')).toBe(false);
    });

    it('isMember is false for a stranger with no participant row at all', async () => {
      prisma.room.findUnique.mockResolvedValue({ hostId: 'host-1' });
      prisma.participant.findUnique.mockResolvedValue(null);
      expect(await service.isMember('room-1', 'stranger')).toBe(false);
    });
  });

  describe('isHostOrCoHost', () => {
    it('is true for the real host without needing a Participant row lookup', async () => {
      prisma.room.findUnique.mockResolvedValue({ hostId: 'host-1' });
      expect(await service.isHostOrCoHost('room-1', 'host-1')).toBe(true);
      expect(prisma.participant.findUnique).not.toHaveBeenCalled();
    });

    it('is true for an active participant whose role is cohost', async () => {
      prisma.room.findUnique.mockResolvedValue({ hostId: 'host-1' });
      prisma.participant.findUnique.mockResolvedValue({
        role: 'cohost',
        leftAt: null,
      });
      expect(await service.isHostOrCoHost('room-1', 'user-2')).toBe(true);
    });

    it('is false for a plain participant (never promoted)', async () => {
      prisma.room.findUnique.mockResolvedValue({ hostId: 'host-1' });
      prisma.participant.findUnique.mockResolvedValue({
        role: 'participant',
        leftAt: null,
      });
      expect(await service.isHostOrCoHost('room-1', 'user-2')).toBe(false);
    });

    it('is false for a co-host who has already left the room', async () => {
      prisma.room.findUnique.mockResolvedValue({ hostId: 'host-1' });
      prisma.participant.findUnique.mockResolvedValue({
        role: 'cohost',
        leftAt: new Date(),
      });
      expect(await service.isHostOrCoHost('room-1', 'user-2')).toBe(false);
    });

    it('is false for a stranger with no participant row at all', async () => {
      prisma.room.findUnique.mockResolvedValue({ hostId: 'host-1' });
      prisma.participant.findUnique.mockResolvedValue(null);
      expect(await service.isHostOrCoHost('room-1', 'stranger')).toBe(false);
    });
  });

  describe('promoteToCoHost / demoteCoHost', () => {
    it('refuses a host promoting themselves', async () => {
      await expect(
        service.promoteToCoHost('room-1', 'host-1', 'host-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.participant.update).not.toHaveBeenCalled();
    });

    it('refuses to promote someone who is not an active participant', async () => {
      prisma.participant.findUnique.mockResolvedValue(null);
      await expect(
        service.promoteToCoHost('room-1', 'host-1', 'stranger'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.participant.update).not.toHaveBeenCalled();
    });

    it('sets an active participant’s role to cohost', async () => {
      prisma.participant.findUnique.mockResolvedValue({
        id: 'p-2',
        leftAt: null,
      });

      await service.promoteToCoHost('room-1', 'host-1', 'user-2');

      expect(prisma.participant.update).toHaveBeenCalledWith({
        where: { id: 'p-2' },
        data: { role: 'cohost' },
      });
    });

    it('promoting an already-cohost participant is a harmless no-op, not an error', async () => {
      prisma.participant.findUnique.mockResolvedValue({
        id: 'p-2',
        role: 'cohost',
        leftAt: null,
      });

      await expect(
        service.promoteToCoHost('room-1', 'host-1', 'user-2'),
      ).resolves.toBeUndefined();
      expect(prisma.participant.update).toHaveBeenCalledWith({
        where: { id: 'p-2' },
        data: { role: 'cohost' },
      });
    });

    it('refuses a host demoting themselves', async () => {
      await expect(
        service.demoteCoHost('room-1', 'host-1', 'host-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.participant.update).not.toHaveBeenCalled();
    });

    it('sets a co-host’s role back to participant', async () => {
      prisma.participant.findUnique.mockResolvedValue({
        id: 'p-2',
        role: 'cohost',
        leftAt: null,
      });

      await service.demoteCoHost('room-1', 'host-1', 'user-2');

      expect(prisma.participant.update).toHaveBeenCalledWith({
        where: { id: 'p-2' },
        data: { role: 'participant' },
      });
    });

    it('demoting a participant who was never a cohost is a harmless no-op', async () => {
      prisma.participant.findUnique.mockResolvedValue({
        id: 'p-2',
        role: 'participant',
        leftAt: null,
      });

      await expect(
        service.demoteCoHost('room-1', 'host-1', 'user-2'),
      ).resolves.toBeUndefined();
    });
  });

  describe('muteParticipant', () => {
    it('refuses a host muting themselves — never calls LiveKit', async () => {
      await expect(
        service.muteParticipant('room-1', 'host-1', 'host-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(liveKit.muteParticipantAudio).not.toHaveBeenCalled();
    });

    it('refuses to mute someone who is not an active participant of this room', async () => {
      prisma.participant.findUnique.mockResolvedValue(null);

      await expect(
        service.muteParticipant('room-1', 'host-1', 'stranger'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(liveKit.muteParticipantAudio).not.toHaveBeenCalled();
    });

    it('refuses to mute a participant who already left', async () => {
      prisma.participant.findUnique.mockResolvedValue({
        id: 'p-2',
        leftAt: new Date(),
      });

      await expect(
        service.muteParticipant('room-1', 'host-1', 'user-2'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(liveKit.muteParticipantAudio).not.toHaveBeenCalled();
    });

    it('mutes an active participant via LiveKit and touches no DB state', async () => {
      prisma.participant.findUnique.mockResolvedValue({
        id: 'p-2',
        leftAt: null,
      });

      await service.muteParticipant('room-1', 'host-1', 'user-2');

      expect(liveKit.muteParticipantAudio).toHaveBeenCalledWith(
        'room-1',
        'user-2',
      );
      expect(prisma.participant.update).not.toHaveBeenCalled();
    });

    it('reports a clean 404 instead of crashing when the target is DB-active but not connected to LiveKit', async () => {
      prisma.participant.findUnique.mockResolvedValue({
        id: 'p-2',
        leftAt: null,
      });
      liveKit.muteParticipantAudio.mockRejectedValue(
        new LiveKitParticipantNotConnectedError('room-1', 'user-2'),
      );

      await expect(
        service.muteParticipant('room-1', 'host-1', 'user-2'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('removeParticipant', () => {
    it('refuses a host removing themselves', async () => {
      await expect(
        service.removeParticipant('room-1', 'host-1', 'host-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(liveKit.removeParticipant).not.toHaveBeenCalled();
    });

    it('refuses to remove someone who is not an active participant', async () => {
      prisma.participant.findUnique.mockResolvedValue(null);

      await expect(
        service.removeParticipant('room-1', 'host-1', 'stranger'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(liveKit.removeParticipant).not.toHaveBeenCalled();
    });

    it('removes via LiveKit AND reconciles our own Participant record (leftAt)', async () => {
      prisma.participant.findUnique.mockResolvedValue({
        id: 'p-2',
        leftAt: null,
      });
      prisma.participant.update.mockResolvedValue({});

      await service.removeParticipant('room-1', 'host-1', 'user-2');

      expect(liveKit.removeParticipant).toHaveBeenCalledWith(
        'room-1',
        'user-2',
      );
      expect(prisma.participant.update).toHaveBeenCalledWith({
        where: { id: 'p-2' },
        data: { leftAt: expect.any(Date) },
      });
    });

    it('reports a clean 404 instead of crashing when the target is DB-active but not connected to LiveKit, and does not reconcile leftAt', async () => {
      prisma.participant.findUnique.mockResolvedValue({
        id: 'p-2',
        leftAt: null,
      });
      liveKit.removeParticipant.mockRejectedValue(
        new LiveKitParticipantNotConnectedError('room-1', 'user-2'),
      );

      await expect(
        service.removeParticipant('room-1', 'host-1', 'user-2'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.participant.update).not.toHaveBeenCalled();
    });
  });

  describe('lowerParticipantHand', () => {
    it('refuses a host lowering their own hand via the host-action path', async () => {
      await expect(
        service.lowerParticipantHand('room-1', 'host-1', 'host-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(liveKit.setHandRaised).not.toHaveBeenCalled();
    });

    it('refuses to target someone who is not an active participant of this room', async () => {
      prisma.participant.findUnique.mockResolvedValue(null);

      await expect(
        service.lowerParticipantHand('room-1', 'host-1', 'stranger'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(liveKit.setHandRaised).not.toHaveBeenCalled();
    });

    it('refuses to target a participant who already left', async () => {
      prisma.participant.findUnique.mockResolvedValue({
        id: 'p-2',
        leftAt: new Date(),
      });

      await expect(
        service.lowerParticipantHand('room-1', 'host-1', 'user-2'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(liveKit.setHandRaised).not.toHaveBeenCalled();
    });

    it("lowers an active participant's hand via LiveKit and touches no DB state", async () => {
      prisma.participant.findUnique.mockResolvedValue({
        id: 'p-2',
        leftAt: null,
      });

      await service.lowerParticipantHand('room-1', 'host-1', 'user-2');

      expect(liveKit.setHandRaised).toHaveBeenCalledWith(
        'room-1',
        'user-2',
        false,
      );
      expect(prisma.participant.update).not.toHaveBeenCalled();
    });

    it('reports a clean 404 instead of crashing when the target is DB-active but not connected to LiveKit', async () => {
      prisma.participant.findUnique.mockResolvedValue({
        id: 'p-2',
        leftAt: null,
      });
      liveKit.setHandRaised.mockRejectedValue(
        new LiveKitParticipantNotConnectedError('room-1', 'user-2'),
      );

      await expect(
        service.lowerParticipantHand('room-1', 'host-1', 'user-2'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getMeetingAnalytics', () => {
    const makeParticipant = (overrides: Record<string, unknown> = {}) => ({
      id: 'p-x',
      userId: 'user-x',
      role: 'participant',
      joinedAt: new Date('2026-01-01T10:00:00.000Z'),
      leftAt: null,
      admittedAt: new Date('2026-01-01T10:00:00.000Z'),
      user: { name: 'User X' },
      ...overrides,
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('throws NotFoundException for a missing room', async () => {
      prisma.room.findUnique.mockResolvedValue(null);

      await expect(
        service.getMeetingAnalytics('nope', 'host-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.participant.findMany).not.toHaveBeenCalled();
    });

    it('refuses a non-host — never leaks attendance data to a stranger', async () => {
      prisma.room.findUnique.mockResolvedValue(
        makeRoom({ status: 'active', hostId: 'host-1' }),
      );

      await expect(
        service.getMeetingAnalytics('room-1', 'not-the-host'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.participant.findMany).not.toHaveBeenCalled();
    });

    it('returns a trivial "not started" shape for a scheduled room, without querying participants', async () => {
      prisma.room.findUnique.mockResolvedValue(
        makeRoom({ status: 'scheduled', hostId: 'host-1' }),
      );

      const result = await service.getMeetingAnalytics('room-1', 'host-1');

      expect(result).toEqual({
        roomId: 'room-1',
        roomName: 'Standup',
        status: 'scheduled',
        meetingStartedAt: null,
        meetingEndedAt: null,
        meetingDurationSec: 0,
        totalUniqueParticipants: 0,
        participants: [],
      });
      expect(prisma.participant.findMany).not.toHaveBeenCalled();
    });

    it('computes durationSec as leftAt - joinedAt for a participant who has already left', async () => {
      prisma.room.findUnique.mockResolvedValue(
        makeRoom({ status: 'active', hostId: 'host-1' }),
      );
      prisma.participant.findMany.mockResolvedValue([
        makeParticipant({
          userId: 'user-2',
          joinedAt: new Date('2026-01-01T10:00:00.000Z'),
          leftAt: new Date('2026-01-01T10:05:00.000Z'), // 5 minutes
          user: { name: 'User Two' },
        }),
      ]);

      const result = await service.getMeetingAnalytics('room-1', 'host-1');

      expect(result.participants).toEqual([
        expect.objectContaining({
          userId: 'user-2',
          name: 'User Two',
          stillInCall: false,
          durationSec: 300,
        }),
      ]);
    });

    it('computes durationSec as now - joinedAt for a participant still in the call (leftAt: null)', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T10:10:00.000Z'));
      prisma.room.findUnique.mockResolvedValue(
        makeRoom({ status: 'active', hostId: 'host-1' }),
      );
      prisma.participant.findMany.mockResolvedValue([
        makeParticipant({
          userId: 'user-2',
          joinedAt: new Date('2026-01-01T10:00:00.000Z'),
          leftAt: null,
          user: { name: 'User Two' },
        }),
      ]);

      const result = await service.getMeetingAnalytics('room-1', 'host-1');

      expect(result.participants).toEqual([
        expect.objectContaining({
          userId: 'user-2',
          stillInCall: true,
          durationSec: 600, // 10 minutes against the frozen "now"
        }),
      ]);
    });

    it('aggregates multiple participants: totalUniqueParticipants and per-participant durations', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T11:00:00.000Z'));
      prisma.room.findUnique.mockResolvedValue(
        makeRoom({ status: 'active', hostId: 'host-1' }),
      );
      prisma.participant.findMany.mockResolvedValue([
        makeParticipant({
          userId: 'host-1',
          role: 'host',
          joinedAt: new Date('2026-01-01T10:00:00.000Z'),
          leftAt: null,
          user: { name: 'Host' },
        }),
        makeParticipant({
          userId: 'user-2',
          joinedAt: new Date('2026-01-01T10:05:00.000Z'),
          leftAt: new Date('2026-01-01T10:35:00.000Z'), // 30 minutes
          user: { name: 'User Two' },
        }),
        makeParticipant({
          userId: 'user-3',
          joinedAt: new Date('2026-01-01T10:10:00.000Z'),
          leftAt: new Date('2026-01-01T10:20:00.000Z'), // 10 minutes
          user: { name: 'User Three' },
        }),
      ]);

      const result = await service.getMeetingAnalytics('room-1', 'host-1');

      expect(result.totalUniqueParticipants).toBe(3);
      expect(result.participants).toHaveLength(3);
      expect(result.participants).toEqual([
        expect.objectContaining({ userId: 'host-1', durationSec: 3600 }),
        expect.objectContaining({ userId: 'user-2', durationSec: 1800 }),
        expect.objectContaining({ userId: 'user-3', durationSec: 600 }),
      ]);
    });

    it('an ongoing (non-ended) room has meetingEndedAt: null and measures duration against now', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T10:30:00.000Z'));
      prisma.room.findUnique.mockResolvedValue(
        makeRoom({ status: 'active', hostId: 'host-1' }),
      );
      prisma.participant.findMany.mockResolvedValue([
        makeParticipant({
          userId: 'host-1',
          role: 'host',
          joinedAt: new Date('2026-01-01T10:00:00.000Z'),
          leftAt: null,
        }),
      ]);

      const result = await service.getMeetingAnalytics('room-1', 'host-1');

      expect(result.meetingStartedAt).toEqual(
        new Date('2026-01-01T10:00:00.000Z'),
      );
      expect(result.meetingEndedAt).toBeNull();
      expect(result.meetingDurationSec).toBe(1800);
    });

    it("an ended room's meetingEndedAt is the latest participant leftAt, not Room.updatedAt", async () => {
      prisma.room.findUnique.mockResolvedValue(
        makeRoom({ status: 'ended', hostId: 'host-1' }),
      );
      prisma.participant.findMany.mockResolvedValue([
        makeParticipant({
          userId: 'host-1',
          role: 'host',
          joinedAt: new Date('2026-01-01T10:00:00.000Z'),
          leftAt: new Date('2026-01-01T10:45:00.000Z'),
        }),
        makeParticipant({
          userId: 'user-2',
          joinedAt: new Date('2026-01-01T10:05:00.000Z'),
          leftAt: new Date('2026-01-01T10:40:00.000Z'),
        }),
      ]);

      const result = await service.getMeetingAnalytics('room-1', 'host-1');

      expect(result.meetingStartedAt).toEqual(
        new Date('2026-01-01T10:00:00.000Z'),
      );
      expect(result.meetingEndedAt).toEqual(
        new Date('2026-01-01T10:45:00.000Z'),
      );
      expect(result.meetingDurationSec).toBe(45 * 60);
    });
  });

  describe('whiteboard', () => {
    const points = [
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 0.2 },
    ];

    describe('listWhiteboardStrokes', () => {
      it('returns strokes for the room ordered oldest-first', async () => {
        const strokes = [{ id: 'stroke-1' }, { id: 'stroke-2' }];
        prisma.whiteboardStroke.findMany.mockResolvedValue(strokes);

        const result = await service.listWhiteboardStrokes('room-1');

        expect(prisma.whiteboardStroke.findMany).toHaveBeenCalledWith({
          where: { roomId: 'room-1' },
          orderBy: { createdAt: 'asc' },
        });
        expect(result).toBe(strokes);
      });
    });

    describe('addWhiteboardStroke', () => {
      it('persists a stroke scoped to the room and the calling user', async () => {
        prisma.room.findUnique.mockResolvedValue(makeRoom());
        const created = { id: 'stroke-1', points, color: '#ff0000', width: 3 };
        prisma.whiteboardStroke.create.mockResolvedValue(created);

        const result = await service.addWhiteboardStroke('room-1', 'user-1', {
          points,
          color: '#ff0000',
        });

        expect(prisma.whiteboardStroke.create).toHaveBeenCalledWith({
          data: {
            roomId: 'room-1',
            authorId: 'user-1',
            points,
            color: '#ff0000',
            width: 3,
          },
        });
        expect(result).toBe(created);
      });

      it('defaults width when none is supplied', async () => {
        prisma.room.findUnique.mockResolvedValue(makeRoom());
        prisma.whiteboardStroke.create.mockResolvedValue({});

        await service.addWhiteboardStroke('room-1', 'user-1', {
          points,
          color: '#00ff00',
          width: 8,
        });

        expect(prisma.whiteboardStroke.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ width: 8 }),
        });
      });

      it('404s if the room does not exist', async () => {
        prisma.room.findUnique.mockResolvedValue(null);

        await expect(
          service.addWhiteboardStroke('room-x', 'user-1', {
            points,
            color: '#ff0000',
          }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(prisma.whiteboardStroke.create).not.toHaveBeenCalled();
      });
    });

    describe('undoLastWhiteboardStroke', () => {
      it("deletes only the CALLING user's own most recent stroke in this room", async () => {
        const stroke = { id: 'stroke-9', authorId: 'user-1' };
        prisma.whiteboardStroke.findFirst.mockResolvedValue(stroke);

        const result = await service.undoLastWhiteboardStroke(
          'room-1',
          'user-1',
        );

        expect(prisma.whiteboardStroke.findFirst).toHaveBeenCalledWith({
          where: { roomId: 'room-1', authorId: 'user-1' },
          orderBy: { createdAt: 'desc' },
        });
        expect(prisma.whiteboardStroke.delete).toHaveBeenCalledWith({
          where: { id: 'stroke-9' },
        });
        expect(result).toBe(stroke);
      });

      it('404s when the calling user has nothing of their own to undo — even if other participants have drawn strokes', async () => {
        // The key BOLA-shaped guarantee here: this query is scoped by
        // authorId, so it can never find (and therefore never delete)
        // another participant's stroke just because one exists in the
        // room.
        prisma.whiteboardStroke.findFirst.mockResolvedValue(null);

        await expect(
          service.undoLastWhiteboardStroke('room-1', 'user-1'),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(prisma.whiteboardStroke.delete).not.toHaveBeenCalled();
      });
    });

    describe('clearWhiteboard', () => {
      it('deletes every stroke in the room, not scoped to any one author', async () => {
        prisma.room.findUnique.mockResolvedValue(makeRoom());

        await service.clearWhiteboard('room-1');

        expect(prisma.whiteboardStroke.deleteMany).toHaveBeenCalledWith({
          where: { roomId: 'room-1' },
        });
      });

      it('404s if the room does not exist', async () => {
        prisma.room.findUnique.mockResolvedValue(null);

        await expect(service.clearWhiteboard('room-x')).rejects.toBeInstanceOf(
          NotFoundException,
        );
        expect(prisma.whiteboardStroke.deleteMany).not.toHaveBeenCalled();
      });
    });
  });

  describe('agenda', () => {
    describe('listAgendaItems', () => {
      it('returns items for the room ordered by order ascending', async () => {
        const items = [{ id: 'item-1' }, { id: 'item-2' }];
        prisma.agendaItem.findMany.mockResolvedValue(items);

        const result = await service.listAgendaItems('room-1');

        expect(prisma.agendaItem.findMany).toHaveBeenCalledWith({
          where: { roomId: 'room-1' },
          orderBy: { order: 'asc' },
        });
        expect(result).toBe(items);
      });
    });

    describe('addAgendaItem', () => {
      it('appends a new item with order = current count of existing items', async () => {
        prisma.room.findUnique.mockResolvedValue(makeRoom());
        prisma.agendaItem.count.mockResolvedValue(2);
        const created = { id: 'item-3', title: 'New topic', order: 2 };
        prisma.agendaItem.create.mockResolvedValue(created);

        const result = await service.addAgendaItem('room-1', {
          title: 'New topic',
        });

        expect(prisma.agendaItem.count).toHaveBeenCalledWith({
          where: { roomId: 'room-1' },
        });
        expect(prisma.agendaItem.create).toHaveBeenCalledWith({
          data: { roomId: 'room-1', title: 'New topic', order: 2 },
        });
        expect(result).toBe(created);
      });

      it('404s if the room does not exist', async () => {
        prisma.room.findUnique.mockResolvedValue(null);

        await expect(
          service.addAgendaItem('room-x', { title: 'New topic' }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(prisma.agendaItem.create).not.toHaveBeenCalled();
      });
    });

    describe('toggleAgendaItem', () => {
      it('toggles completed on an item scoped to this room (BOLA: id+roomId both in the query)', async () => {
        prisma.agendaItem.findFirst.mockResolvedValue({
          id: 'item-1',
          roomId: 'room-1',
        });
        const updated = { id: 'item-1', completed: true };
        prisma.agendaItem.update.mockResolvedValue(updated);

        const result = await service.toggleAgendaItem('room-1', 'item-1', {
          completed: true,
        });

        expect(prisma.agendaItem.findFirst).toHaveBeenCalledWith({
          where: { id: 'item-1', roomId: 'room-1' },
        });
        expect(prisma.agendaItem.update).toHaveBeenCalledWith({
          where: { id: 'item-1' },
          data: { completed: true },
        });
        expect(result).toBe(updated);
      });

      it('404s for an item that does not belong to this room — never falls back to a bare findUnique(id)', async () => {
        prisma.agendaItem.findFirst.mockResolvedValue(null);

        await expect(
          service.toggleAgendaItem('room-1', 'item-from-other-room', {
            completed: true,
          }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(prisma.agendaItem.update).not.toHaveBeenCalled();
      });
    });

    describe('removeAgendaItem', () => {
      it('deletes an item scoped to this room (BOLA: id+roomId both in the query)', async () => {
        prisma.agendaItem.findFirst.mockResolvedValue({
          id: 'item-1',
          roomId: 'room-1',
        });

        await service.removeAgendaItem('room-1', 'item-1');

        expect(prisma.agendaItem.findFirst).toHaveBeenCalledWith({
          where: { id: 'item-1', roomId: 'room-1' },
        });
        expect(prisma.agendaItem.delete).toHaveBeenCalledWith({
          where: { id: 'item-1' },
        });
      });

      it('404s for an item that does not belong to this room', async () => {
        prisma.agendaItem.findFirst.mockResolvedValue(null);

        await expect(
          service.removeAgendaItem('room-1', 'item-from-other-room'),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(prisma.agendaItem.delete).not.toHaveBeenCalled();
      });
    });
  });
});
