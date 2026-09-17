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
import { PollsService } from './polls.service';
import { CreatePollDto } from './dto/create-poll.dto';
import { VotePollDto } from './dto/vote-poll.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoomHostGuard } from '../rooms/guards/room-host.guard';
import { RoomMemberGuard } from '../rooms/guards/room-member.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// Nested under /rooms/:id/polls rather than a top-level /polls resource —
// a poll never exists independent of a room (same relationship
// Recording/Participant have to Room), and every one of this module's
// routes needs the exact same "is this caller allowed to act on THIS
// room" check RoomHostGuard/RoomMemberGuard already provide. Reusing them
// here (rather than writing new poll-specific guards) requires the route
// param to be named `id` for this room segment, same as RoomsController —
// both guards read `request.params.id` directly.
@UseGuards(JwtAuthGuard)
@Controller('rooms/:id/polls')
export class PollsController {
  constructor(private readonly polls: PollsService) {}

  // Host-only: creating a poll is a host action, same tier as lock/mute/
  // remove on RoomsController.
  @UseGuards(RoomHostGuard)
  @Post()
  create(
    @Param('id') roomId: string,
    @CurrentUser() user: { userId: string },
    @Body() dto: CreatePollDto,
  ) {
    return this.polls.createPoll(roomId, user.userId, dto);
  }

  // Any active room member (host or participant) — this is what a late
  // joiner's client calls on mount to see the current poll's live state,
  // backing up the data-channel broadcast that only reaches participants
  // already connected when an event fires. See CallRoom/PollControl and
  // FEATURES.md's Research notes for the full late-joiner writeup.
  @UseGuards(RoomMemberGuard)
  @Get('current')
  current(
    @Param('id') roomId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.polls.getCurrentPoll(roomId, user.userId);
  }

  // Any active room member may vote (not host-only) — the DTO's
  // optionId is validated against THIS poll at the DB query level inside
  // PollsService.vote, not trusted from the client.
  @UseGuards(RoomMemberGuard)
  @Post(':pollId/vote')
  @HttpCode(HttpStatus.OK)
  vote(
    @Param('id') roomId: string,
    @Param('pollId') pollId: string,
    @CurrentUser() user: { userId: string },
    @Body() dto: VotePollDto,
  ) {
    return this.polls.vote(roomId, pollId, user.userId, dto);
  }

  // Host-only: locks further voting. Does not delete the poll — results
  // stay visible/auditable (see PollsService.closePoll's own comment).
  @UseGuards(RoomHostGuard)
  @Post(':pollId/close')
  @HttpCode(HttpStatus.OK)
  close(
    @Param('id') roomId: string,
    @Param('pollId') pollId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.polls.closePoll(roomId, user.userId, pollId);
  }
}
