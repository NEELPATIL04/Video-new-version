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
import { LiveKitService } from '../livekit/livekit.service';

@UseGuards(JwtAuthGuard)
@Controller('rooms')
export class RoomsController {
  constructor(
    private readonly rooms: RoomsService,
    private readonly liveKit: LiveKitService,
  ) {}

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

  // Returns both the DB participant record AND a LiveKit access token —
  // joining a room in our data model and actually being able to connect
  // to the live call are two different things; the client needs both to
  // do anything useful.
  @Post(':id/join')
  async join(@Param('id') id: string, @CurrentUser() user: { userId: string }) {
    const participant = await this.rooms.joinRoom(id, user.userId);
    const liveKitToken = await this.liveKit.createAccessToken({
      identity: user.userId,
      name: participant.user.name,
      roomId: id,
      role: participant.role,
    });

    return { participant, liveKitUrl: this.liveKit.getUrl(), liveKitToken };
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
}
