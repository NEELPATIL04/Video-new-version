import { Module } from '@nestjs/common';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { AuthModule } from '../auth/auth.module';

// Deliberately does NOT import RoomsModule — a template has no relation to
// any Room row, so there's nothing here to reuse from it (no guard, no
// service method). AuthModule alone provides what JwtAuthGuard needs.
@Module({
  imports: [AuthModule],
  controllers: [TemplatesController],
  providers: [TemplatesService],
})
export class TemplatesModule {}
