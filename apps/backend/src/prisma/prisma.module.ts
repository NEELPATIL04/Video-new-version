import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Global: every feature module needs DB access, and re-importing this in
// every module would be pure boilerplate with zero benefit.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
