import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { RoomHostGuard } from './guards/room-host.guard';
import { RoomMemberGuard } from './guards/room-member.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [RoomsController],
  providers: [RoomsService, RoomHostGuard, RoomMemberGuard],
})
export class RoomsModule {}
