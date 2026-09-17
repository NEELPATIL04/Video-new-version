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
  // Exported so BreakoutRoomsModule can reuse RoomsService (getRoomById)
  // and RoomHostGuard as-is, rather than duplicating room-ownership logic
  // for a feature that's really an extension of an existing room.
  exports: [RoomsService, RoomHostGuard, RoomMemberGuard],
})
export class RoomsModule {}
