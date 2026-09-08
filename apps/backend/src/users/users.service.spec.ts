import { Test } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };

  const makeUser = (overrides: Record<string, unknown> = {}) => ({
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    passwordHash: 'super-secret-hash',
    emailVerified: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  describe('toSafeUser', () => {
    it('strips passwordHash from the returned object', () => {
      const safe = service.toSafeUser(makeUser());

      expect(safe).not.toHaveProperty('passwordHash');
      expect(safe.email).toBe('test@example.com');
    });
  });

  describe('recordFailedLogin', () => {
    it('increments the counter without locking below the threshold', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ failedLoginAttempts: 1 }),
      );

      await service.recordFailedLogin('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { failedLoginAttempts: 2, lockedUntil: null },
      });
    });

    it('locks the account once the 5th failed attempt is reached', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ failedLoginAttempts: 4 }),
      );

      await service.recordFailedLogin('user-1');

      const [[updateArgs]] = prisma.user.update.mock.calls;
      expect(updateArgs.data.failedLoginAttempts).toBe(5);
      expect(updateArgs.data.lockedUntil).toBeInstanceOf(Date);
      expect(updateArgs.data.lockedUntil.getTime()).toBeGreaterThan(Date.now());
    });

    it('does nothing if the user no longer exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await service.recordFailedLogin('ghost-user');

      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
