import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PollsService } from './polls.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PollsService', () => {
  let service: PollsService;
  let prisma: {
    poll: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    pollOption: {
      findFirst: jest.Mock;
    };
    pollVote: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
  };

  const makeOption = (overrides: Record<string, unknown> = {}) => ({
    id: 'opt-1',
    text: 'Yes',
    order: 0,
    pollId: 'poll-1',
    _count: { votes: 0 },
    ...overrides,
  });

  const makePoll = (overrides: Record<string, unknown> = {}) => ({
    id: 'poll-1',
    question: 'Ready to ship?',
    status: 'open',
    createdAt: new Date(),
    closedAt: null,
    roomId: 'room-1',
    createdById: 'host-1',
    options: [makeOption(), makeOption({ id: 'opt-2', text: 'No', order: 1 })],
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      poll: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      pollOption: {
        findFirst: jest.fn(),
      },
      pollVote: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [PollsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(PollsService);
  });

  describe('createPoll', () => {
    it('refuses to create a poll while this room already has an open one', async () => {
      prisma.poll.findFirst.mockResolvedValue({ id: 'poll-existing' });

      await expect(
        service.createPoll('room-1', 'host-1', {
          question: 'Another one?',
          options: ['Yes', 'No'],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.poll.create).not.toHaveBeenCalled();
    });

    it('creates the poll with ordered options and zero votes for everyone', async () => {
      prisma.poll.findFirst.mockResolvedValue(null); // no open poll yet
      prisma.poll.create.mockResolvedValue(makePoll());

      const result = await service.createPoll('room-1', 'host-1', {
        question: 'Ready to ship?',
        options: ['Yes', 'No'],
      });

      expect(prisma.poll.create).toHaveBeenCalledWith({
        data: {
          roomId: 'room-1',
          createdById: 'host-1',
          question: 'Ready to ship?',
          options: {
            create: [
              { text: 'Yes', order: 0 },
              { text: 'No', order: 1 },
            ],
          },
        },
        include: { options: expect.any(Object) },
      });
      expect(result).toEqual(
        expect.objectContaining({
          id: 'poll-1',
          status: 'open',
          totalVotes: 0,
          hasVoted: false,
          votedOptionId: null,
          options: [
            { id: 'opt-1', text: 'Yes', voteCount: 0 },
            { id: 'opt-2', text: 'No', voteCount: 0 },
          ],
        }),
      );
    });
  });

  describe('getCurrentPoll', () => {
    it('returns null when the room has never had a poll', async () => {
      prisma.poll.findFirst.mockResolvedValue(null);

      const result = await service.getCurrentPoll('room-1', 'user-2');

      expect(result).toBeNull();
    });

    it('returns the most recently created poll for the room, ordered by createdAt desc', async () => {
      prisma.poll.findFirst.mockResolvedValue(makePoll());
      prisma.pollVote.findUnique.mockResolvedValue(null);

      await service.getCurrentPoll('room-1', 'user-2');

      expect(prisma.poll.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { roomId: 'room-1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('is not scoped to open polls only — a late joiner sees final results for an already-closed poll too', async () => {
      prisma.poll.findFirst.mockResolvedValue(
        makePoll({ status: 'closed', closedAt: new Date() }),
      );
      prisma.pollVote.findUnique.mockResolvedValue(null);

      const result = await service.getCurrentPoll('room-1', 'user-2');

      expect(result).toEqual(expect.objectContaining({ status: 'closed' }));
    });

    it("reports hasVoted/votedOptionId scoped to the CALLER's own vote", async () => {
      prisma.poll.findFirst.mockResolvedValue(
        makePoll({
          options: [
            makeOption({ _count: { votes: 3 } }),
            makeOption({
              id: 'opt-2',
              text: 'No',
              order: 1,
              _count: { votes: 1 },
            }),
          ],
        }),
      );
      prisma.pollVote.findUnique.mockResolvedValue({ optionId: 'opt-2' });

      const result = await service.getCurrentPoll('room-1', 'user-2');

      expect(prisma.pollVote.findUnique).toHaveBeenCalledWith({
        where: { pollId_userId: { pollId: 'poll-1', userId: 'user-2' } },
        select: { optionId: true },
      });
      expect(result).toEqual(
        expect.objectContaining({
          hasVoted: true,
          votedOptionId: 'opt-2',
          totalVotes: 4,
        }),
      );
    });
  });

  describe('vote', () => {
    it('refuses to vote on a poll that does not exist in this room (BOLA: id+roomId both in the query)', async () => {
      prisma.poll.findFirst.mockResolvedValue(null);

      await expect(
        service.vote('room-1', 'poll-1', 'user-2', { optionId: 'opt-1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.poll.findFirst).toHaveBeenCalledWith({
        where: { id: 'poll-1', roomId: 'room-1' },
      });
      expect(prisma.pollVote.create).not.toHaveBeenCalled();
    });

    it('refuses to vote on a closed poll', async () => {
      prisma.poll.findFirst.mockResolvedValue(makePoll({ status: 'closed' }));

      await expect(
        service.vote('room-1', 'poll-1', 'user-2', { optionId: 'opt-1' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.pollVote.create).not.toHaveBeenCalled();
    });

    it('refuses an optionId that does not belong to this poll', async () => {
      prisma.poll.findFirst.mockResolvedValue(makePoll());
      prisma.pollOption.findFirst.mockResolvedValue(null);

      await expect(
        service.vote('room-1', 'poll-1', 'user-2', {
          optionId: 'opt-from-other-poll',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.pollOption.findFirst).toHaveBeenCalledWith({
        where: { id: 'opt-from-other-poll', pollId: 'poll-1' },
        select: { id: true },
      });
      expect(prisma.pollVote.create).not.toHaveBeenCalled();
    });

    it('refuses a second vote from the same user on the same poll', async () => {
      prisma.poll.findFirst.mockResolvedValue(makePoll());
      prisma.pollOption.findFirst.mockResolvedValue({ id: 'opt-1' });
      prisma.pollVote.findUnique.mockResolvedValue({ id: 'existing-vote' });

      await expect(
        service.vote('room-1', 'poll-1', 'user-2', { optionId: 'opt-1' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.pollVote.create).not.toHaveBeenCalled();
    });

    it('records the vote and returns fresh results including the new tally', async () => {
      prisma.poll.findFirst.mockResolvedValue(makePoll());
      prisma.pollOption.findFirst.mockResolvedValue({ id: 'opt-1' });
      prisma.pollVote.findUnique
        .mockResolvedValueOnce(null) // pre-check: no existing vote
        .mockResolvedValueOnce({ optionId: 'opt-1' }); // refetch for result shape
      prisma.pollVote.create.mockResolvedValue({ id: 'vote-1' });
      prisma.poll.findUnique.mockResolvedValue(
        makePoll({
          options: [
            makeOption({ _count: { votes: 1 } }),
            makeOption({ id: 'opt-2', text: 'No', order: 1 }),
          ],
        }),
      );

      const result = await service.vote('room-1', 'poll-1', 'user-2', {
        optionId: 'opt-1',
      });

      expect(prisma.pollVote.create).toHaveBeenCalledWith({
        data: { pollId: 'poll-1', optionId: 'opt-1', userId: 'user-2' },
      });
      expect(result).toEqual(
        expect.objectContaining({
          hasVoted: true,
          votedOptionId: 'opt-1',
          totalVotes: 1,
        }),
      );
    });

    it('treats a unique-constraint race (P2002) the same as the pre-check — a clean 409, not a 500', async () => {
      prisma.poll.findFirst.mockResolvedValue(makePoll());
      prisma.pollOption.findFirst.mockResolvedValue({ id: 'opt-1' });
      prisma.pollVote.findUnique.mockResolvedValue(null); // pre-check passes...
      // ...but another request won the race and inserted first.
      prisma.pollVote.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.vote('room-1', 'poll-1', 'user-2', { optionId: 'opt-1' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('closePoll', () => {
    it('refuses to close a poll that does not exist in this room', async () => {
      prisma.poll.findFirst.mockResolvedValue(null);

      await expect(
        service.closePoll('room-1', 'host-1', 'poll-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.poll.update).not.toHaveBeenCalled();
    });

    it('refuses to close an already-closed poll', async () => {
      prisma.poll.findFirst.mockResolvedValue(makePoll({ status: 'closed' }));

      await expect(
        service.closePoll('room-1', 'host-1', 'poll-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.poll.update).not.toHaveBeenCalled();
    });

    it('closes the poll (sets status + closedAt) and returns final results', async () => {
      prisma.poll.findFirst.mockResolvedValue(makePoll());
      prisma.poll.update.mockResolvedValue({});
      prisma.poll.findUnique.mockResolvedValue(
        makePoll({ status: 'closed', closedAt: new Date() }),
      );
      prisma.pollVote.findUnique.mockResolvedValue(null);

      const result = await service.closePoll('room-1', 'host-1', 'poll-1');

      expect(prisma.poll.update).toHaveBeenCalledWith({
        where: { id: 'poll-1' },
        data: { status: 'closed', closedAt: expect.any(Date) },
      });
      expect(result).toEqual(expect.objectContaining({ status: 'closed' }));
    });
  });
});
