import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// Top-level /templates, NOT nested under /rooms — a template is a
// reusable, user-owned preset with no relation to any Room row (unlike
// Polls/Whiteboard, which are genuinely room-scoped). JwtAuthGuard alone
// is enough here: every route is scoped to the caller's own templates by
// TemplatesService itself (create/list by hostId, delete via an
// ownership check), so there's no per-resource "does this caller belong
// to X" guard to add on top.
@UseGuards(JwtAuthGuard)
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Post()
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateTemplateDto,
  ) {
    return this.templates.create(user.userId, dto);
  }

  @Get()
  listMine(@CurrentUser() user: { userId: string }) {
    return this.templates.listMine(user.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.templates.remove(user.userId, id);
  }
}
