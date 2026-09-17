import { Module } from '@nestjs/common';
import { BreakoutRoomsController } from './breakout-rooms.controller';
import { BreakoutRoomsService } from './breakout-rooms.service';
import { RoomsModule } from '../rooms/rooms.module';
import { LiveKitModule } from '../livekit/livekit.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  // RoomsModule exports RoomsService (used for getRoomById/status checks)
  // and RoomHostGuard (reused as-is, per CLAUDE.md's rule against
  // inventing new authorization logic when an existing guard already does
  // the job). AuthModule is needed directly too — JwtAuthGuard (used on
  // this controller, same as RoomsController) depends on JwtService,
  // which RoomsModule imports for itself but doesn't re-export.
  imports: [RoomsModule, LiveKitModule, AuthModule],
  controllers: [BreakoutRoomsController],
  providers: [BreakoutRoomsService],
})
export class BreakoutRoomsModule {}
