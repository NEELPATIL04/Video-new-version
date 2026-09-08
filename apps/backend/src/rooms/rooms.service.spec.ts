import { Test } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { PrismaService } from '../prisma/prisma.service';

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
    $transaction: jest.Mock;
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
      $transaction: jest.fn((arg) => {
        // Mirrors Prisma's two $transaction call shapes used in the
        // service: a callback (createRoom) and an array of already-issued
        // operations (cancelRoom/endRoom).
        if (typeof arg === 'function') return arg(prisma);
        return Promise.all(arg);
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [RoomsService, { provide: PrismaService, useValue: prisma }],
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
        data: { roomId: room.id, userId: 'host-1', role: 'host' },
      });
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

    it('transitions a scheduled room to active on the first join', async () => {
      prisma.room.findUnique.mockResolvedValue(
        makeRoom({ status: 'scheduled', maxParticipants: 10 }),
      );
      prisma.participant.count.mockResolvedValue(0);
      prisma.participant.findUnique.mockResolvedValue(null);
      prisma.participant.upsert.mockResolvedValue({ id: 'p-3' });
      prisma.room.update.mockResolvedValue({});

      await service.joinRoom('room-1', 'user-3');

      expect(prisma.room.update).toHaveBeenCalledWith({
        where: { id: 'room-1' },
        data: { status: 'active' },
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
});
