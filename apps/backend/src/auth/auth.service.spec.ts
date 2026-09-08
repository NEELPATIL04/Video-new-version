import { Test } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';

// Real argon2 is used throughout (not mocked) — a broken hash/verify call
// site is exactly the kind of bug a mock would hide.

describe('AuthService', () => {
  let auth: AuthService;
  let prisma: {
    refreshToken: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let users: {
    findByEmail: jest.Mock;
    createUser: jest.Mock;
    recordFailedLogin: jest.Mock;
    resetFailedLogins: jest.Mock;
    toSafeUser: jest.Mock;
  };

  const makeUser = (overrides: Record<string, unknown> = {}) => ({
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    passwordHash: '',
    emailVerified: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      refreshToken: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'rt-new' }),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    users = {
      findByEmail: jest.fn(),
      createUser: jest.fn(),
      recordFailedLogin: jest.fn(),
      resetFailedLogins: jest.fn(),
      toSafeUser: jest.fn((u) => {
        const safe = { ...u };
        delete safe.passwordHash;
        return safe;
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: users },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((_key: string, fallback?: unknown) => fallback ?? 7),
          },
        },
      ],
    }).compile();

    auth = moduleRef.get(AuthService);
  });

  describe('register', () => {
    it('hashes the password before storing — never persists plaintext', async () => {
      users.findByEmail.mockResolvedValue(null);
      users.createUser.mockImplementation((data) =>
        Promise.resolve(makeUser(data)),
      );

      await auth.register({
        email: 'a@b.com',
        name: 'A',
        password: 'Sup3rSecret!',
      });

      const [[createArgs]] = users.createUser.mock.calls;
      expect(createArgs.passwordHash).not.toBe('Sup3rSecret!');
      expect(await argon2.verify(createArgs.passwordHash, 'Sup3rSecret!')).toBe(
        true,
      );
    });

    it('never returns passwordHash to the caller', async () => {
      users.findByEmail.mockResolvedValue(null);
      users.createUser.mockImplementation((data) =>
        Promise.resolve(makeUser(data)),
      );

      const result = await auth.register({
        email: 'a@b.com',
        name: 'A',
        password: 'Sup3rSecret!',
      });

      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('rejects a duplicate email with ConflictException', async () => {
      users.findByEmail.mockResolvedValue(makeUser());

      await expect(
        auth.register({
          email: 'test@example.com',
          name: 'A',
          password: 'Sup3rSecret!',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('succeeds and resets failed-attempt counter on correct password', async () => {
      const passwordHash = await argon2.hash('Correct1!');
      users.findByEmail.mockResolvedValue(makeUser({ passwordHash }));

      const result = await auth.login({
        email: 'test@example.com',
        password: 'Correct1!',
      });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(users.resetFailedLogins).toHaveBeenCalledWith('user-1');
    });

    it('gives an IDENTICAL generic message for unknown email vs wrong password (no enumeration leak)', async () => {
      users.findByEmail.mockResolvedValueOnce(null);
      const unknownEmailError = await auth
        .login({ email: 'nope@example.com', password: 'whatever' })
        .catch((e) => e);

      const passwordHash = await argon2.hash('Correct1!');
      users.findByEmail.mockResolvedValueOnce(makeUser({ passwordHash }));
      const wrongPasswordError = await auth
        .login({ email: 'test@example.com', password: 'WrongOne!' })
        .catch((e) => e);

      expect(unknownEmailError).toBeInstanceOf(UnauthorizedException);
      expect(wrongPasswordError).toBeInstanceOf(UnauthorizedException);
      expect(unknownEmailError.message).toBe(wrongPasswordError.message);
    });

    it('records a failed attempt on wrong password', async () => {
      const passwordHash = await argon2.hash('Correct1!');
      users.findByEmail.mockResolvedValue(makeUser({ passwordHash }));

      await auth
        .login({ email: 'test@example.com', password: 'WrongOne!' })
        .catch(() => undefined);

      expect(users.recordFailedLogin).toHaveBeenCalledWith('user-1');
    });

    it('rejects login while the account is locked, even with the correct password', async () => {
      const passwordHash = await argon2.hash('Correct1!');
      const lockedUntil = new Date(Date.now() + 60_000);
      users.findByEmail.mockResolvedValue(
        makeUser({ passwordHash, lockedUntil }),
      );

      await expect(
        auth.login({ email: 'test@example.com', password: 'Correct1!' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('rotates the token: marks the old one revoked and links it to the new one', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-old',
        userId: 'user-1',
        revoked: false,
        expiresAt: new Date(Date.now() + 60_000),
      });

      await auth.refresh('raw-token-value');

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-old' },
        data: { revoked: true, replacedByTokenId: 'rt-new' },
      });
    });

    it('rejects an unknown token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(auth.refresh('bogus')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an expired token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-old',
        userId: 'user-1',
        revoked: false,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(auth.refresh('expired')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('detects reuse of an already-rotated token and revokes ALL sessions for that user', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-old',
        userId: 'user-1',
        revoked: true,
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(auth.refresh('stolen-old-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revoked: false },
        data: { revoked: true },
      });
    });
  });

  describe('logout', () => {
    it('revokes only the presented token', async () => {
      await auth.logout('raw-token-value');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: expect.any(String), revoked: false },
        data: { revoked: true },
      });
    });
  });
});
