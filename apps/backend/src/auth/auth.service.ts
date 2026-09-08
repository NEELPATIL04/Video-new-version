import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { generateRefreshToken, hashRefreshToken } from './refresh-token.util';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.users.createUser({
      email: dto.email,
      name: dto.name,
      passwordHash,
    });

    const tokens = await this.issueTokenPair(user.id);
    return { user: this.users.toSafeUser(user), ...tokens };
  }

  async login(dto: LoginDto) {
    const user = await this.users.findByEmail(dto.email);

    // Generic message regardless of "no such email" vs "wrong password" —
    // distinguishing them lets an attacker enumerate registered emails.
    const invalidCredentials = () =>
      new UnauthorizedException('Invalid email or password');

    if (!user) throw invalidCredentials();

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        'Account temporarily locked due to repeated failed login attempts. Try again later.',
      );
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      await this.users.recordFailedLogin(user.id);
      throw invalidCredentials();
    }

    await this.users.resetFailedLogins(user.id);
    const tokens = await this.issueTokenPair(user.id);
    return { user: this.users.toSafeUser(user), ...tokens };
  }

  async refresh(rawRefreshToken: string) {
    const tokenHash = hashRefreshToken(rawRefreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    if (stored.revoked) {
      // This token was already rotated out (or explicitly revoked) and is
      // being presented again — that's a replay/theft signal. Nuke every
      // session for this user, forcing a fresh login everywhere.
      await this.revokeAllUserTokens(stored.userId);
      throw new UnauthorizedException(
        'Refresh token reuse detected — all sessions revoked',
      );
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const tokens = await this.issueTokenPair(stored.userId, stored.id);
    return tokens;
  }

  async logout(rawRefreshToken: string) {
    const tokenHash = hashRefreshToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revoked: false },
      data: { revoked: true },
    });
  }

  private async revokeAllUserTokens(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
  }

  private async issueTokenPair(
    userId: string,
    rotatingFromTokenId?: string,
  ): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync({ sub: userId });

    const refreshToken = generateRefreshToken();
    const tokenHash = hashRefreshToken(refreshToken);
    const refreshDays = this.config.get<number>(
      'JWT_REFRESH_EXPIRES_IN_DAYS',
      7,
    );
    const refreshTokenExpiresAt = new Date(
      Date.now() + refreshDays * 24 * 60 * 60 * 1000,
    );

    const created = await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt: refreshTokenExpiresAt },
    });

    if (rotatingFromTokenId) {
      await this.prisma.refreshToken.update({
        where: { id: rotatingFromTokenId },
        data: { revoked: true, replacedByTokenId: created.id },
      });
    }

    return { accessToken, refreshToken, refreshTokenExpiresAt };
  }
}
