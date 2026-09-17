import { Module } from '@nestjs/common';
import { PollsController } from './polls.controller';
import { PollsService } from './polls.service';
import { AuthModule } from '../auth/auth.module';
import { RoomsModule } from '../rooms/rooms.module';

@Module({
  // RoomsModule exports RoomsService + RoomHostGuard/RoomMemberGuard —
  // imported (not reimplemented) so every route here uses the exact same
  // BOLA-mitigation guards as RoomsController.
  imports: [AuthModule, RoomsModule],
  controllers: [PollsController],
  providers: [PollsService],
})
export class PollsModule {}
