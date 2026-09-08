import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RoomStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  async createRoom(hostId: string, dto: CreateRoomDto) {
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
        },
      });

      await tx.participant.create({
        data: { roomId: room.id, userId: hostId, role: 'host' },
      });

      return room;
    });
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

  async joinRoom(roomId: string, userId: string) {
    const room = await this.getRoomById(roomId);
    if (room.status === RoomStatus.ended) {
      throw new ConflictException('This meeting has already ended');
    }

    const activeCount = await this.prisma.participant.count({
      where: { roomId, leftAt: null },
    });

    // Someone already occupying a seat and rejoining (rare race: they
    // haven't left yet but are "rejoining", e.g. duplicate tab) shouldn't
    // count twice against capacity — check that separately from the
    // capacity gate below.
    const existing = await this.prisma.participant.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });

    if (!existing && activeCount >= room.maxParticipants) {
      throw new ForbiddenException('This meeting is full');
    }

    // Roles are NEVER accepted from the client — upsert always assigns
    // "participant" for a new join. The one and only "host" row is created
    // in createRoom and is never reassigned here, preventing any joining
    // user from escalating themselves to host.
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

    return participant;
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

  async isHost(roomId: string, userId: string): Promise<boolean> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { hostId: true },
    });
    return room?.hostId === userId;
  }

  async isMember(roomId: string, userId: string): Promise<boolean> {
    if (await this.isHost(roomId, userId)) return true;
    const participant = await this.prisma.participant.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    return !!participant && participant.leftAt === null;
  }
}
