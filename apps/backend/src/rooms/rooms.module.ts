import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { RoomHostGuard } from './guards/room-host.guard';
import { RoomMemberGuard } from './guards/room-member.guard';
import { AuthModule } from '../auth/auth.module';
import { LiveKitModule } from '../livekit/livekit.module';

@Module({
  imports: [AuthModule, LiveKitModule],
  controllers: [RoomsController],
  providers: [RoomsService, RoomHostGuard, RoomMemberGuard],
  // RoomsService + the two BOLA-mitigation guards are the correct
  // "does this caller own/belong to this room" checks for any other
  // per-room feature module too (PollsModule, BreakoutRoomsModule) —
  // exported so they can be reused as-is rather than reimplemented per
  // module, for a feature that's really an extension of an existing room.
  exports: [RoomsService, RoomHostGuard, RoomMemberGuard],
})
export class RoomsModule {}
