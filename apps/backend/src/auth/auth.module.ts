import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UsersModule } from '../users/users.module';

// Kept as its own reference so it can be both imported here AND re-exported
// below — other feature modules (e.g. RoomsModule) import AuthModule to use
// JwtAuthGuard, and that guard's own JwtService dependency only resolves in
// their context if JwtModule itself is re-exported, not just the guard
// class (see https://docs.nestjs.com/modules#re-exporting-modules).
const jwtModule = JwtModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    secret: config.get<string>('JWT_ACCESS_SECRET'),
    // @nestjs/jwt's expiresIn type is a narrow ms()-style literal that a
    // dynamic env-sourced string can never satisfy at compile time; the
    // env schema (env.validation.ts) already guarantees this is a
    // syntactically valid duration string ("15m", "1h", ...) at runtime.
    signOptions: {
      expiresIn: config.get<string>('JWT_ACCESS_EXPIRES_IN'),
    } as JwtSignOptions,
  }),
});

@Module({
  imports: [UsersModule, jwtModule],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [JwtAuthGuard, jwtModule],
})
export class AuthModule {}
