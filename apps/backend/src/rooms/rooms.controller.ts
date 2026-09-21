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
import { CreateWhiteboardStrokeDto } from './dto/create-whiteboard-stroke.dto';
import { AddAgendaItemDto } from './dto/add-agenda-item.dto';
import { ToggleAgendaItemDto } from './dto/toggle-agenda-item.dto';
import { JoinRoomDto } from './dto/join-room.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoomHostGuard } from './guards/room-host.guard';
import { RoomHostOrCoHostGuard } from './guards/room-host-or-cohost.guard';
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

  // MUST stay registered before @Get(':id') below — Nest/Express match
  // routes in declaration order, so if ':id' came first, a request to
  // /rooms/by-code/482913657 would match it with id="by-code" and never
  // reach this handler at all.
  //
  // Stricter than the global default (60/min) — a 9-digit code is a
  // ~30-bit keyspace (vs. the 122-bit UUID room IDs), enumerable enough
  // that this is a brute-force target the same way the auth endpoints
  // are, not just a convenience lookup.
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Get('by-code/:code')
  getByCode(@Param('code') code: string) {
    return this.rooms.findRoomByCode(code);
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

  // Host-or-co-host. Blocks brand-new joiners in joinRoom (see the
  // service's own comment on why it reuses the exact same "existing
  // member" check as the capacity gate) — never affects anyone already
  // admitted, including the host. Returns the updated room so the client
  // can reflect the new locked state without a second fetch.
  @UseGuards(RoomHostOrCoHostGuard)
  @Post(':id/lock')
  @HttpCode(HttpStatus.OK)
  lock(@Param('id') id: string) {
    return this.rooms.lockRoom(id);
  }

  @UseGuards(RoomHostOrCoHostGuard)
  @Post(':id/unlock')
  @HttpCode(HttpStatus.OK)
  unlock(@Param('id') id: string) {
    return this.rooms.unlockRoom(id);
  }

  // A host is admitted immediately; anyone else lands in the waiting room
  // (status: 'waiting') until the host admits or denies them — see
  // RoomsService.joinRoom/buildJoinResult for why a LiveKit token is only
  // ever issued once admittedAt is actually set in the database, never
  // just because the caller says they're the host.
  @Post(':id/join')
  join(
    @Param('id') id: string,
    @Body() dto: JoinRoomDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.rooms.joinRoom(id, user.userId, dto.force ?? false);
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

  // Host-or-co-host: who's currently waiting to be let in.
  @UseGuards(RoomHostOrCoHostGuard)
  @Get(':id/waiting')
  listWaiting(@Param('id') id: string) {
    return this.rooms.listWaitingParticipants(id);
  }

  @UseGuards(RoomHostOrCoHostGuard)
  @Post(':id/waiting/:userId/admit')
  @HttpCode(HttpStatus.OK)
  admitParticipant(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.rooms.admitParticipant(id, user.userId, userId);
  }

  @UseGuards(RoomHostOrCoHostGuard)
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

  // Host-or-co-host admin actions. RoomHostOrCoHostGuard re-verifies at the
  // DB level per request (never trusts a client-side claim); RoomsService
  // additionally blocks targeting an inactive/non-existent participant or
  // the caller themselves.
  @UseGuards(RoomHostOrCoHostGuard)
  @Post(':id/participants/:userId/mute')
  @HttpCode(HttpStatus.OK)
  muteParticipant(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.rooms.muteParticipant(id, user.userId, userId);
  }

  @UseGuards(RoomHostOrCoHostGuard)
  @Post(':id/participants/:userId/remove')
  @HttpCode(HttpStatus.OK)
  removeParticipant(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.rooms.removeParticipant(id, user.userId, userId);
  }

  // Host-only. Pure Postgres aggregation over data joinRoom/leaveRoom/
  // endRoom already record — no LiveKit call, so this works identically
  // whether the meeting is still live or has already ended. See
  // RoomsService.getMeetingAnalytics and FEATURES.md's Research notes for
  // why it's deliberately available in either state rather than gated on
  // RoomStatus.ended.
  @UseGuards(RoomHostGuard)
  @Get(':id/analytics')
  getAnalytics(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.rooms.getMeetingAnalytics(id, user.userId);
  }

  // Host or co-host lowering ANOTHER participant's hand (queue
  // management). A participant lowering their OWN hand never calls this —
  // that happens directly client-side via localParticipant.setMetadata(),
  // which LiveKit restricts to the caller's own identity. Same
  // RoomHostOrCoHostGuard + DB-level non-self-target check as mute/remove
  // above.
  @UseGuards(RoomHostOrCoHostGuard)
  @Post(':id/participants/:userId/lower-hand')
  @HttpCode(HttpStatus.OK)
  lowerParticipantHand(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.rooms.lowerParticipantHand(id, user.userId, userId);
  }

  // Owner-only (RoomHostGuard, strict Room.hostId check — NOT
  // RoomHostOrCoHostGuard). A co-host promoting a rival co-host or
  // demoting the real host would be a real privilege-escalation bug, so
  // appointing/revoking co-host status stays with the true owner, same as
  // update/cancel/end above. Reuses assertActiveNonSelfParticipant — the
  // target must be a genuinely active participant of this room, and the
  // host can't target themselves (they're already the host).
  @UseGuards(RoomHostGuard)
  @Post(':id/participants/:userId/promote')
  @HttpCode(HttpStatus.OK)
  promoteToCoHost(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.rooms.promoteToCoHost(id, user.userId, userId);
  }

  @UseGuards(RoomHostGuard)
  @Post(':id/participants/:userId/demote')
  @HttpCode(HttpStatus.OK)
  demoteCoHost(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.rooms.demoteCoHost(id, user.userId, userId);
  }

  // Late-joiner path — fetched on mount by WhiteboardControl so a
  // participant who joins after drawing has already happened sees the
  // existing canvas instead of a blank one. Any active member may read
  // it (RoomMemberGuard), same access level as listParticipants above.
  @UseGuards(RoomMemberGuard)
  @Get(':id/whiteboard/strokes')
  listWhiteboardStrokes(@Param('id') id: string) {
    return this.rooms.listWhiteboardStrokes(id);
  }

  // Persists the stroke (for future late joiners); the client also
  // broadcasts it over the LiveKit data channel itself so already-
  // connected participants see it live without polling — see
  // WhiteboardControl.tsx. "Everyone can draw" (FEATURES.md's default
  // for a collaborative whiteboard), so this is RoomMemberGuard, not
  // RoomHostGuard.
  @UseGuards(RoomMemberGuard)
  @Post(':id/whiteboard/strokes')
  addWhiteboardStroke(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateWhiteboardStrokeDto,
  ) {
    return this.rooms.addWhiteboardStroke(id, user.userId, dto);
  }

  // Undoes the CALLER's own most recent stroke only — the target stroke
  // is looked up server-side by authorId, never accepted as a client-
  // supplied id, so this can't be used to undo someone else's drawing.
  @UseGuards(RoomMemberGuard)
  @Delete(':id/whiteboard/strokes/last')
  @HttpCode(HttpStatus.OK)
  undoLastWhiteboardStroke(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.rooms.undoLastWhiteboardStroke(id, user.userId);
  }

  // Host-only, unlike the two routes above — clears every participant's
  // strokes at once, a meaningfully more destructive action than undoing
  // your own last one. Same RoomHostGuard as lock/mute/remove.
  @UseGuards(RoomHostGuard)
  @Delete(':id/whiteboard')
  @HttpCode(HttpStatus.OK)
  clearWhiteboard(@Param('id') id: string) {
    return this.rooms.clearWhiteboard(id);
  }

  // Late-joiner path, same shape as listWhiteboardStrokes above. Any
  // admitted room member (including a plain viewer) can read the current
  // agenda — RoomMemberGuard, not RoomHostOrCoHostGuard.
  @UseGuards(RoomMemberGuard)
  @Get(':id/agenda')
  listAgenda(@Param('id') id: string) {
    return this.rooms.listAgendaItems(id);
  }

  // Host-or-co-host: co-host gets the same agenda-management rights as
  // host, consistent with its existing scope on mute/remove/lock/etc.
  @UseGuards(RoomHostOrCoHostGuard)
  @Post(':id/agenda')
  addAgendaItem(@Param('id') id: string, @Body() dto: AddAgendaItemDto) {
    return this.rooms.addAgendaItem(id, dto);
  }

  @UseGuards(RoomHostOrCoHostGuard)
  @Patch(':id/agenda/:itemId')
  toggleAgendaItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: ToggleAgendaItemDto,
  ) {
    return this.rooms.toggleAgendaItem(id, itemId, dto);
  }

  @UseGuards(RoomHostOrCoHostGuard)
  @Delete(':id/agenda/:itemId')
  @HttpCode(HttpStatus.OK)
  removeAgendaItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.rooms.removeAgendaItem(id, itemId);
  }
}
