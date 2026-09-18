import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TemplatesService', () => {
  let service: TemplatesService;
  let prisma: {
    meetingTemplate: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
  };

  const makeTemplate = (overrides: Record<string, unknown> = {}) => ({
    id: 'template-1',
    name: 'Weekly sync',
    defaultE2eeEnabled: false,
    agendaItems: ['Review action items', 'Roadmap update'],
    createdAt: new Date(),
    hostId: 'host-1',
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      meetingTemplate: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TemplatesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(TemplatesService);
  });

  describe('create', () => {
    it('creates a template owned by the caller, defaulting e2ee and agendaItems', async () => {
      const created = makeTemplate();
      prisma.meetingTemplate.create.mockResolvedValue(created);

      const result = await service.create('host-1', { name: 'Weekly sync' });

      expect(prisma.meetingTemplate.create).toHaveBeenCalledWith({
        data: {
          hostId: 'host-1',
          name: 'Weekly sync',
          defaultE2eeEnabled: false,
          agendaItems: [],
        },
      });
      expect(result).toBe(created);
    });

    it('persists the provided e2ee default and agenda items in order', async () => {
      prisma.meetingTemplate.create.mockResolvedValue(makeTemplate());

      await service.create('host-1', {
        name: 'Weekly sync',
        e2eeEnabled: true,
        agendaItems: ['Item A', 'Item B'],
      });

      expect(prisma.meetingTemplate.create).toHaveBeenCalledWith({
        data: {
          hostId: 'host-1',
          name: 'Weekly sync',
          defaultE2eeEnabled: true,
          agendaItems: ['Item A', 'Item B'],
        },
      });
    });
  });

  describe('listMine', () => {
    it("scopes the query to the caller's own templates, most recent first", async () => {
      const templates = [makeTemplate()];
      prisma.meetingTemplate.findMany.mockResolvedValue(templates);

      const result = await service.listMine('host-1');

      expect(prisma.meetingTemplate.findMany).toHaveBeenCalledWith({
        where: { hostId: 'host-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toBe(templates);
    });
  });

  describe('remove', () => {
    it('404s when no template with that id exists at all', async () => {
      prisma.meetingTemplate.findUnique.mockResolvedValue(null);

      await expect(
        service.remove('host-1', 'template-x'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.meetingTemplate.delete).not.toHaveBeenCalled();
    });

    it('403s when the template exists but belongs to someone else', async () => {
      prisma.meetingTemplate.findUnique.mockResolvedValue(
        makeTemplate({ hostId: 'someone-else' }),
      );

      await expect(
        service.remove('host-1', 'template-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.meetingTemplate.delete).not.toHaveBeenCalled();
    });

    it('deletes the template when the caller is its owner', async () => {
      prisma.meetingTemplate.findUnique.mockResolvedValue(makeTemplate());

      await service.remove('host-1', 'template-1');

      expect(prisma.meetingTemplate.delete).toHaveBeenCalledWith({
        where: { id: 'template-1' },
      });
    });
  });
});
