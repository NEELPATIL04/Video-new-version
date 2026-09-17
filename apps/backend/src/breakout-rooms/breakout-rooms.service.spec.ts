import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { BreakoutRoomsService } from './breakout-rooms.service';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsService } from '../rooms/rooms.service';
import { LiveKitService } from '../livekit/livekit.service';

describe('BreakoutRoomsService', () => {
  let service: BreakoutRoomsService;
  let prisma: {
    breakoutRoom: {
      create: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
    };
    participant: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let rooms: { getRoomById: jest.Mock };
  let liveKit: {
    createAccessToken: jest.Mock;
    getUrl: jest.Mock;
    createBreakoutRoom: jest.Mock;
    deleteBreakoutRoom: jest.Mock;
  };

  const makeRoom = (overrides: Record<string, unknown> = {}) => ({
    id: 'room-1',
    name: 'Standup',
    status: 'active',
    hostId: 'host-1',
    e2eeEnabled: false,
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      breakoutRoom: {
        create: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      participant: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((arg) => {
        // Mirrors RoomsService's own mock: a callback (createBreakoutRooms)
        // or an array of already-issued operations (endBreakoutRooms).
        if (typeof arg === 'function') return arg(prisma);
        return Promise.all(arg);
      }),
    };

    rooms = {
      getRoomById: jest.fn().mockResolvedValue(makeRoom()),
    };

    liveKit = {
      createAccessToken: jest.fn().mockResolvedValue('signed-token'),
      getUrl: jest.fn().mockReturnValue('ws://localhost:7880'),
      createBreakoutRoom: jest.fn().mockResolvedValue(undefined),
      deleteBreakoutRoom: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        BreakoutRoomsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RoomsService, useValue: rooms },
        { provide: LiveKitService, useValue: liveKit },
      ],
    }).compile();

    service = moduleRef.get(BreakoutRoomsService);
  });

  describe('createBreakoutRooms', () => {
    it('refuses to create breakout rooms unless the meeting is active', async () => {
      rooms.getRoomById.mockResolvedValue(makeRoom({ status: 'scheduled' }));

      await expect(
        service.createBreakoutRooms('room-1', 'host-1', {
          rooms: [{ label: 'Room 1', participantUserIds: [] }],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.breakoutRoom.create).not.toHaveBeenCalled();
    });

    it('refuses to create breakout rooms for an end-to-end encrypted meeting', async () => {
      rooms.getRoomById.mockResolvedValue(makeRoom({ e2eeEnabled: true }));

      await expect(
        service.createBreakoutRooms('room-1', 'host-1', {
          rooms: [{ label: 'Room 1', participantUserIds: [] }],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.breakoutRoom.create).not.toHaveBeenCalled();
    });

    it('refuses to assign the same participant to more than one room', async () => {
      await expect(
        service.createBreakoutRooms('room-1', 'host-1', {
          rooms: [
            { label: 'Room 1', participantUserIds: ['user-2'] },
            { label: 'Room 2', participantUserIds: ['user-2'] },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.participant.findMany).not.toHaveBeenCalled();
    });

    it('refuses to assign the host to a breakout room', async () => {
      await expect(
        service.createBreakoutRooms('room-1', 'host-1', {
          rooms: [{ label: 'Room 1', participantUserIds: ['host-1'] }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.participant.findMany).not.toHaveBeenCalled();
    });

    it('refuses when a targeted participant is not an active, admitted member of this room (BOLA check)', async () => {
      // Only one of the two requested participants actually resolves —
      // the DB-level check must catch a client trying to target someone
      // who isn't really a current member of THIS room.
      prisma.participant.findMany.mockResolvedValue([{ userId: 'user-2' }]);

      await expect(
        service.createBreakoutRooms('room-1', 'host-1', {
          rooms: [
            { label: 'Room 1', participantUserIds: ['user-2', 'stranger'] },
          ],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.breakoutRoom.create).not.toHaveBeenCalled();
    });

    it('creates each breakout room and assigns the listed participants, all inside one transaction', async () => {
      prisma.participant.findMany.mockResolvedValue([
        { userId: 'user-2' },
        { userId: 'user-3' },
      ]);
      prisma.breakoutRoom.create
        .mockResolvedValueOnce({ id: 'bo-1', label: 'Room 1' })
        .mockResolvedValueOnce({ id: 'bo-2', label: 'Room 2' });
      prisma.participant.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.createBreakoutRooms('room-1', 'host-1', {
        rooms: [
          { label: 'Room 1', participantUserIds: ['user-2'] },
          { label: 'Room 2', participantUserIds: ['user-3'] },
        ],
      });

      expect(prisma.breakoutRoom.create).toHaveBeenNthCalledWith(1, {
        data: { roomId: 'room-1', label: 'Room 1' },
      });
      expect(prisma.breakoutRoom.create).toHaveBeenNthCalledWith(2, {
        data: { roomId: 'room-1', label: 'Room 2' },
      });
      expect(prisma.participant.updateMany).toHaveBeenNthCalledWith(1, {
        where: { roomId: 'room-1', userId: { in: ['user-2'] } },
        data: { breakoutRoomId: 'bo-1' },
      });
      expect(prisma.participant.updateMany).toHaveBeenNthCalledWith(2, {
        where: { roomId: 'room-1', userId: { in: ['user-3'] } },
        data: { breakoutRoomId: 'bo-2' },
      });
      expect(result).toEqual([
        { id: 'bo-1', label: 'Room 1', participantUserIds: ['user-2'] },
        { id: 'bo-2', label: 'Room 2', participantUserIds: ['user-3'] },
      ]);
    });

    it('allows creating an empty breakout room (no participants yet)', async () => {
      prisma.breakoutRoom.create.mockResolvedValue({
        id: 'bo-1',
        label: 'Room 1',
      });

      await service.createBreakoutRooms('room-1', 'host-1', {
        rooms: [{ label: 'Room 1', participantUserIds: [] }],
      });

      expect(prisma.participant.findMany).not.toHaveBeenCalled();
      expect(prisma.participant.updateMany).not.toHaveBeenCalled();
    });

    it('pre-creates the actual LiveKit room for each breakout room after the DB transaction commits', async () => {
      prisma.breakoutRoom.create.mockResolvedValue({
        id: 'bo-1',
        label: 'Room 1',
      });

      await service.createBreakoutRooms('room-1', 'host-1', {
        rooms: [{ label: 'Room 1', participantUserIds: [] }],
      });

      expect(liveKit.createBreakoutRoom).toHaveBeenCalledWith('bo-1');
    });

    it('does not fail the request when LiveKit room pre-creation fails (best-effort only)', async () => {
      prisma.breakoutRoom.create.mockResolvedValue({
        id: 'bo-1',
        label: 'Room 1',
      });
      liveKit.createBreakoutRoom.mockRejectedValue(new Error('livekit down'));

      await expect(
        service.createBreakoutRooms('room-1', 'host-1', {
          rooms: [{ label: 'Room 1', participantUserIds: [] }],
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('endBreakoutRooms', () => {
    it('refuses when there are no active breakout rooms', async () => {
      prisma.breakoutRoom.findMany.mockResolvedValue([]);

      await expect(service.endBreakoutRooms('room-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.participant.updateMany).not.toHaveBeenCalled();
    });

    it('clears breakoutRoomId for every affected participant and marks every open room ended', async () => {
      prisma.breakoutRoom.findMany.mockResolvedValue([
        { id: 'bo-1' },
        { id: 'bo-2' },
      ]);
      prisma.participant.updateMany.mockResolvedValue({ count: 3 });
      prisma.breakoutRoom.updateMany.mockResolvedValue({ count: 2 });

      await service.endBreakoutRooms('room-1');

      expect(prisma.participant.updateMany).toHaveBeenCalledWith({
        where: { roomId: 'room-1', breakoutRoomId: { in: ['bo-1', 'bo-2'] } },
        data: { breakoutRoomId: null },
      });
      expect(prisma.breakoutRoom.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['bo-1', 'bo-2'] } },
        data: { endedAt: expect.any(Date) },
      });
    });

    it('best-effort deletes the LiveKit room for every ended breakout room', async () => {
      prisma.breakoutRoom.findMany.mockResolvedValue([
        { id: 'bo-1' },
        { id: 'bo-2' },
      ]);
      prisma.participant.updateMany.mockResolvedValue({ count: 0 });
      prisma.breakoutRoom.updateMany.mockResolvedValue({ count: 2 });

      await service.endBreakoutRooms('room-1');

      expect(liveKit.deleteBreakoutRoom).toHaveBeenCalledWith('bo-1');
      expect(liveKit.deleteBreakoutRoom).toHaveBeenCalledWith('bo-2');
    });
  });

  describe('listBreakoutRooms', () => {
    it('queries only currently-open breakout rooms (endedAt null) for this room', async () => {
      prisma.breakoutRoom.findMany.mockResolvedValue([]);

      await service.listBreakoutRooms('room-1');

      expect(prisma.breakoutRoom.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { roomId: 'room-1', endedAt: null },
        }),
      );
    });
  });

  describe('getMyBreakoutAssignment', () => {
    it('throws NotFoundException when the caller has no participant record for this room', async () => {
      prisma.participant.findUnique.mockResolvedValue(null);

      await expect(
        service.getMyBreakoutAssignment('room-1', 'user-2'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when the caller already left the room', async () => {
      prisma.participant.findUnique.mockResolvedValue({
        leftAt: new Date(),
        breakoutRoomId: null,
      });

      await expect(
        service.getMyBreakoutAssignment('room-1', 'user-2'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns "none" when the participant is not currently assigned to a breakout', async () => {
      prisma.participant.findUnique.mockResolvedValue({
        leftAt: null,
        breakoutRoomId: null,
        breakoutRoom: null,
      });

      const result = await service.getMyBreakoutAssignment('room-1', 'user-2');

      expect(result).toEqual({ status: 'none' });
      expect(liveKit.createAccessToken).not.toHaveBeenCalled();
    });

    it('returns "assigned" with a fresh breakout-scoped LiveKit token, reusing createAccessToken', async () => {
      prisma.participant.findUnique.mockResolvedValue({
        leftAt: null,
        role: 'participant',
        userId: 'user-2',
        breakoutRoomId: 'bo-1',
        breakoutRoom: { id: 'bo-1', label: 'Room 1' },
        user: { name: 'User Two' },
      });

      const result = await service.getMyBreakoutAssignment('room-1', 'user-2');

      expect(result).toEqual({
        status: 'assigned',
        breakoutRoomId: 'bo-1',
        label: 'Room 1',
        liveKitUrl: 'ws://localhost:7880',
        liveKitToken: 'signed-token',
      });
      expect(liveKit.createAccessToken).toHaveBeenCalledWith({
        identity: 'user-2',
        name: 'User Two',
        roomId: 'bo-1',
        role: 'participant',
      });
    });

    it("mints the breakout token with the participant's OWN role, not a hardcoded one", async () => {
      prisma.participant.findUnique.mockResolvedValue({
        leftAt: null,
        role: 'viewer',
        userId: 'user-2',
        breakoutRoomId: 'bo-1',
        breakoutRoom: { id: 'bo-1', label: 'Room 1' },
        user: { name: 'User Two' },
      });

      await service.getMyBreakoutAssignment('room-1', 'user-2');

      expect(liveKit.createAccessToken).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'viewer' }),
      );
    });
  });
});
