import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTemplateDto } from './dto/create-template.dto';

// A meeting template is NOT room-scoped (no relation to any Room row —
// see schema.prisma's own comment on MeetingTemplate) and has nothing in
// common with RoomHostGuard/RoomMemberGuard/RoomHostOrCoHostGuard, which
// all answer "is this caller allowed to act on THIS room". Ownership here
// is a plain hostId comparison written directly in this service — the
// same proportionate amount of code RoomsService itself uses for its own
// hostId checks (e.g. getMeetingAnalytics), not a new guard class for a
// single call site.
@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  create(hostId: string, dto: CreateTemplateDto) {
    return this.prisma.meetingTemplate.create({
      data: {
        hostId,
        name: dto.name,
        defaultE2eeEnabled: dto.e2eeEnabled ?? false,
        agendaItems: dto.agendaItems ?? [],
      },
    });
  }

  // Only the caller's own templates — never another user's, and never a
  // query param a client could use to ask for someone else's.
  listMine(hostId: string) {
    return this.prisma.meetingTemplate.findMany({
      where: { hostId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 404 if it doesn't exist at all, 403 if it exists but belongs to
  // someone else — deliberately NOT folded into one "not found" response
  // for the non-owner case, mirroring how RoomsService.getMeetingAnalytics
  // distinguishes "no such room" from "not your room".
  async remove(hostId: string, id: string): Promise<void> {
    const template = await this.prisma.meetingTemplate.findUnique({
      where: { id },
    });
    if (!template) {
      throw new NotFoundException('No template found with that id');
    }
    if (template.hostId !== hostId) {
      throw new ForbiddenException('This template does not belong to you');
    }
    await this.prisma.meetingTemplate.delete({ where: { id } });
  }
}
