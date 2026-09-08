import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type SafeUser = Omit<User, 'passwordHash'>;

// Brute-force lockout tuning: 5 failed attempts locks the account for 15
// minutes. Applied per-account, not per-IP — throttler (main.ts) covers the
// per-IP angle on the same endpoints.
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  createUser(data: { email: string; name: string; passwordHash: string }) {
    return this.prisma.user.create({ data });
  }

  async recordFailedLogin(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) return;

    const attempts = user.failedLoginAttempts + 1;
    const lockedUntil =
      attempts >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
        : user.lockedUntil;

    await this.prisma.user.update({
      where: { id },
      data: { failedLoginAttempts: attempts, lockedUntil },
    });
  }

  resetFailedLogins(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  }

  toSafeUser(user: User): SafeUser {
    const safe: Partial<User> = { ...user };
    delete safe.passwordHash;
    return safe as SafeUser;
  }
}
