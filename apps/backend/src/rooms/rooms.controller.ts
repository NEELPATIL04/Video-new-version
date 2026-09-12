import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoomHostGuard } from './guards/room-host.guard';
import { RoomMemberGuard } from './guards/room-member.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  create(@CurrentUser() user: { userId: string }, @Body() dto: CreateRoomDto) {
    return this.rooms.createRoom(user.userId, dto);
  }

  @Get()
  listMine(@CurrentUser() user: { userId: string }) {
    return this.rooms.listMyRooms(user.userId);
  }

  // Room IDs are unguessable UUIDs (122 bits of randomness) — knowing the
  // ID is treated as equivalent to "having the meeting link", the same
  // model Zoom/Meet use for join links. Any authenticated user may fetch
  // basic room metadata this way. The participant list is more sensitive
  // (reveals who's in the meeting) and stays member-only below.
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.rooms.getRoomById(id);
  }

  @UseGuards(RoomHostGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRoomDto) {
    return this.rooms.updateRoom(id, dto);
  }

  @UseGuards(RoomHostGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancel(@Param('id') id: string) {
    return this.rooms.cancelRoom(id);
  }

  @UseGuards(RoomHostGuard)
  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  end(@Param('id') id: string) {
    return this.rooms.endRoom(id);
  }

  // A host is admitted immediately; anyone else lands in the waiting room
  // (status: 'waiting') until the host admits or denies them — see
  // RoomsService.joinRoom/buildJoinResult for why a LiveKit token is only
  // ever issued once admittedAt is actually set in the database, never
  // just because the caller says they're the host.
  @Post(':id/join')
  join(@Param('id') id: string, @CurrentUser() user: { userId: string }) {
    return this.rooms.joinRoom(id, user.userId);
  }

  // Polled by a waiting participant to find out once the host has acted.
  // No RoomMemberGuard here deliberately — see the service method's own
  // comment for why its DB-level check is scoped differently.
  @Get(':id/join-status')
  getJoinStatus(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.rooms.getParticipantStatus(id, user.userId);
  }

  // Host-only: who's currently waiting to be let in.
  @UseGuards(RoomHostGuard)
  @Get(':id/waiting')
  listWaiting(@Param('id') id: string) {
    return this.rooms.listWaitingParticipants(id);
  }

  @UseGuards(RoomHostGuard)
  @Post(':id/waiting/:userId/admit')
  @HttpCode(HttpStatus.OK)
  admitParticipant(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.rooms.admitParticipant(id, user.userId, userId);
  }

  @UseGuards(RoomHostGuard)
  @Post(':id/waiting/:userId/deny')
  @HttpCode(HttpStatus.OK)
  denyParticipant(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.rooms.denyParticipant(id, user.userId, userId);
  }

  @UseGuards(RoomMemberGuard)
  @Post(':id/leave')
  @HttpCode(HttpStatus.OK)
  leave(@Param('id') id: string, @CurrentUser() user: { userId: string }) {
    return this.rooms.leaveRoom(id, user.userId);
  }

  @UseGuards(RoomMemberGuard)
  @Get(':id/participants')
  listParticipants(@Param('id') id: string) {
    return this.rooms.listActiveParticipants(id);
  }

  // Host-only admin actions. RoomHostGuard re-verifies ownership at the DB
  // level per request (never trusts a client-side "I'm the host" claim);
  // RoomsService additionally blocks targeting an inactive/non-existent
  // participant or the host themselves.
  @UseGuards(RoomHostGuard)
  @Post(':id/participants/:userId/mute')
  @HttpCode(HttpStatus.OK)
  muteParticipant(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.rooms.muteParticipant(id, user.userId, userId);
  }

  @UseGuards(RoomHostGuard)
  @Post(':id/participants/:userId/remove')
  @HttpCode(HttpStatus.OK)
  removeParticipant(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.rooms.removeParticipant(id, user.userId, userId);
  }
}
