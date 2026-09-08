import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { RoomsService } from '../rooms.service';
import { AuthenticatedRequest } from '../../auth/guards/jwt-auth.guard';

// Must run AFTER JwtAuthGuard (needs req.user). Verifies the caller is the
// room's actual host at the database level — this is the concrete
// implementation of "verify ownership at the DB query level, not just via
// a route guard" from CLAUDE.md / DEV_STANDARDS.md §6 (Broken Object Level
// Authorization is the single most common real API vulnerability).
@Injectable()
export class RoomHostGuard implements CanActivate {
  constructor(private readonly rooms: RoomsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // Express types route params as string | string[] in general; our
    // routes only ever declare a single `:id` segment.
    const roomId = request.params.id as string;

    const isHost = await this.rooms.isHost(roomId, request.user.userId);
    if (!isHost) {
      throw new ForbiddenException('Only the host can perform this action');
    }
    return true;
  }
}
