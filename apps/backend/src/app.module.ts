import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { RoomsModule } from './rooms/rooms.module';
import { PollsModule } from './polls/polls.module';
import { BreakoutRoomsModule } from './breakout-rooms/breakout-rooms.module';
import { TemplatesModule } from './templates/templates.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Global default: 60 requests/minute per IP. Auth endpoints override
    // this with much stricter limits directly on their routes.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 60 }],
    }),
    PrismaModule,
    UsersModule,
    AuthModule,
    RoomsModule,
    PollsModule,
    BreakoutRoomsModule,
    TemplatesModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
