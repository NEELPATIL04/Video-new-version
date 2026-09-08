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
})
export class RoomsModule {}
