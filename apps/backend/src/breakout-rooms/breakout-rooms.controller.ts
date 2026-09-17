import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { BreakoutRoomsService } from './breakout-rooms.service';
import { CreateBreakoutRoomsDto } from './dto/create-breakout-rooms.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoomHostGuard } from '../rooms/guards/room-host.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('rooms/:id/breakout-rooms')
export class BreakoutRoomsController {
  constructor(private readonly breakoutRooms: BreakoutRoomsService) {}

  // Host-only: split the currently-admitted participants into N sub-rooms
  // in one request. RoomHostGuard re-verifies ownership at the DB level
  // (never trusts a client-side "I'm the host" claim); the service
  // additionally verifies every targeted participant at the DB level
  // (assertAssignableParticipants) rather than trusting the client's list.
  @UseGuards(RoomHostGuard)
  @Post()
  create(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateBreakoutRoomsDto,
  ) {
    return this.breakoutRooms.createBreakoutRooms(id, user.userId, dto);
  }

  // Host-only: current breakout rooms and who's in each, for the host's
  // management panel.
  @UseGuards(RoomHostGuard)
  @Get()
  list(@Param('id') id: string) {
    return this.breakoutRooms.listBreakoutRooms(id);
  }

  // Host-only: brings everyone back to the main room.
  @UseGuards(RoomHostGuard)
  @Post('end')
  @HttpCode(HttpStatus.OK)
  end(@Param('id') id: string) {
    return this.breakoutRooms.endBreakoutRooms(id);
  }

  // Polled by every participant's client while connected to the call —
  // see FEATURES.md's Research notes for why polling (not a LiveKit
  // data-channel/metadata signal) is the reconnect-notification mechanism
  // here. Deliberately NOT guarded by RoomHostGuard/RoomMemberGuard — same
  // reasoning as RoomsService.getParticipantStatus's own comment: the
  // service scopes this to the CALLER's own Participant row (roomId + the
  // authenticated userId from the JWT, never a client-supplied id), which
  // is exactly the authorization this polling endpoint needs.
  @Get('my-assignment')
  myAssignment(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.breakoutRooms.getMyBreakoutAssignment(id, user.userId);
  }
}
