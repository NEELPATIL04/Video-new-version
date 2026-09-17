import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Poll, PollOption, PollStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePollDto } from './dto/create-poll.dto';
import { VotePollDto } from './dto/vote-poll.dto';

type PollWithCountedOptions = Poll & {
  options: (PollOption & { _count: { votes: number } })[];
};

export interface PollOptionResult {
  id: string;
  text: string;
  voteCount: number;
}

// Everything a client needs to render a poll and its results in one
// shape, whether it's a host who just created it, a participant about to
// vote, or a late joiner seeing it for the first time after it's already
// closed. hasVoted/votedOptionId are always scoped to the CALLER, never
// derived from anything the client sends — see getPollResult below.
export interface PollResult {
  id: string;
  roomId: string;
  question: string;
  status: PollStatus;
  createdAt: Date;
  closedAt: Date | null;
  options: PollOptionResult[];
  totalVotes: number;
  hasVoted: boolean;
  votedOptionId: string | null;
}

const OPTIONS_WITH_COUNTS = {
  orderBy: { order: 'asc' as const },
  include: { _count: { select: { votes: true } } },
};

@Injectable()
export class PollsService {
  constructor(private readonly prisma: PrismaService) {}

  // Host-only (guarded by RoomHostGuard at the controller level, same
  // shape as RoomsService.lockRoom — no separate hostId re-check needed
  // here since the guard already verified ownership at the DB level).
  // Single-question, multiple-choice, and deliberately only one OPEN poll
  // per room at a time: a second concurrent poll would split attention
  // and make "the current poll" an ambiguous concept for both the
  // frontend's late-joiner fetch (see PollsController/CallRoom) and for
  // anyone glancing at results. A host who wants to ask something else
  // closes the current poll first, same as the rest of this app prefers
  // one clear piece of state over ambiguity.
  async createPoll(roomId: string, hostId: string, dto: CreatePollDto) {
    const openPoll = await this.prisma.poll.findFirst({
      where: { roomId, status: PollStatus.open },
      select: { id: true },
    });
    if (openPoll) {
      throw new ConflictException(
        'This room already has an open poll — close it before starting a new one',
      );
    }

    const poll = await this.prisma.poll.create({
      data: {
        roomId,
        createdById: hostId,
        question: dto.question,
        options: {
          create: dto.options.map((text, index) => ({ text, order: index })),
        },
      },
      include: { options: OPTIONS_WITH_COUNTS },
    });

    // A poll always starts at zero votes for everyone — no need for a
    // second query to know that.
    return this.toResult(poll, null);
  }

  // The single most-recently-created poll for this room, open OR closed,
  // or null if the room has never had one. Deliberately NOT scoped to
  // "open" only — this is what covers BOTH halves of the late-joiner
  // problem documented in FEATURES.md's Research notes: a participant who
  // joins mid-vote sees the live in-progress poll, and one who joins (or
  // refreshes) after it's already closed still sees the final results
  // rather than nothing. Any active room member may call this (does not
  // require having voted, or being the host).
  async getCurrentPoll(
    roomId: string,
    userId: string,
  ): Promise<PollResult | null> {
    const poll = await this.prisma.poll.findFirst({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      include: { options: OPTIONS_WITH_COUNTS },
    });
    if (!poll) return null;
    return this.getPollResult(poll, userId);
  }

  // Any active room member (RoomMemberGuard) may vote, not just the
  // host. `id: pollId, roomId` are both in the WHERE clause of the same
  // query — the BOLA-safe pattern this codebase uses throughout (see
  // CLAUDE.md/DEV_STANDARDS.md §6): a pollId for a DIFFERENT room can
  // never be voted on through this route, verified at the database query
  // itself rather than fetched-then-checked in application code.
  async vote(
    roomId: string,
    pollId: string,
    userId: string,
    dto: VotePollDto,
  ): Promise<PollResult> {
    const poll = await this.prisma.poll.findFirst({
      where: { id: pollId, roomId },
    });
    if (!poll) {
      throw new NotFoundException('No poll with that id exists in this room');
    }
    if (poll.status === PollStatus.closed) {
      throw new ConflictException('This poll is closed');
    }

    // Same DB-level ownership pattern as above, scoped one level deeper:
    // the option must belong to THIS poll, not just exist somewhere in
    // the database (otherwise a client could vote using an optionId that
    // belongs to an entirely different poll).
    const option = await this.prisma.pollOption.findFirst({
      where: { id: dto.optionId, pollId },
      select: { id: true },
    });
    if (!option) {
      throw new NotFoundException('This option does not belong to this poll');
    }

    // Checked explicitly (not just left to the unique constraint below)
    // so a repeat vote gets a clean, expected 409 instead of surfacing a
    // raw Prisma unique-violation error. The @@unique([pollId, userId])
    // constraint in schema.prisma is still what actually makes this safe
    // under a race (e.g. two tabs voting at once) — this check alone
    // would have a TOCTOU gap.
    const existingVote = await this.prisma.pollVote.findUnique({
      where: { pollId_userId: { pollId, userId } },
    });
    if (existingVote) {
      throw new ConflictException('You have already voted in this poll');
    }

    try {
      await this.prisma.pollVote.create({
        data: { pollId, optionId: dto.optionId, userId },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Lost the race described above — someone's other tab/request got
        // there first between the check and this insert.
        throw new ConflictException('You have already voted in this poll');
      }
      throw error;
    }

    return this.getPollResultById(pollId, userId);
  }

  // Host-only (RoomHostGuard). Locks further voting; does not delete the
  // poll or its votes — results need to stay visible and auditable after
  // the fact (see schema.prisma's comment on Poll), the same reasoning
  // RoomsService.endRoom preserves participant history instead of
  // deleting rows. Same BOLA-safe `id + roomId` query as vote() above.
  async closePoll(
    roomId: string,
    hostId: string,
    pollId: string,
  ): Promise<PollResult> {
    const poll = await this.prisma.poll.findFirst({
      where: { id: pollId, roomId },
    });
    if (!poll) {
      throw new NotFoundException('No poll with that id exists in this room');
    }
    if (poll.status === PollStatus.closed) {
      throw new ConflictException('This poll is already closed');
    }

    await this.prisma.poll.update({
      where: { id: pollId },
      data: { status: PollStatus.closed, closedAt: new Date() },
    });

    return this.getPollResultById(pollId, hostId);
  }

  private async getPollResultById(
    pollId: string,
    userId: string,
  ): Promise<PollResult> {
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: { options: OPTIONS_WITH_COUNTS },
    });
    // Not reachable in normal operation — the callers above only ever
    // call this with a pollId they just verified/updated in the same
    // request. Guards against a poll being deleted from under a request
    // rather than assuming the impossible.
    if (!poll) {
      throw new NotFoundException('Poll no longer exists');
    }
    return this.getPollResult(poll, userId);
  }

  private async getPollResult(
    poll: PollWithCountedOptions,
    userId: string,
  ): Promise<PollResult> {
    const myVote = await this.prisma.pollVote.findUnique({
      where: { pollId_userId: { pollId: poll.id, userId } },
      select: { optionId: true },
    });
    return this.toResult(poll, myVote?.optionId ?? null);
  }

  private toResult(
    poll: PollWithCountedOptions,
    votedOptionId: string | null,
  ): PollResult {
    const options = poll.options.map((option) => ({
      id: option.id,
      text: option.text,
      voteCount: option._count.votes,
    }));
    return {
      id: poll.id,
      roomId: poll.roomId,
      question: poll.question,
      status: poll.status,
      createdAt: poll.createdAt,
      closedAt: poll.closedAt,
      options,
      totalVotes: options.reduce((sum, o) => sum + o.voteCount, 0),
      hasVoted: votedOptionId !== null,
      votedOptionId,
    };
  }
}
