import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { RoomsService } from '../rooms.service';
import { AuthenticatedRequest } from '../../auth/guards/jwt-auth.guard';

// Same BOLA mitigation as RoomHostGuard, but for actions any current
// member (host or active participant) may take — not just the host.
@Injectable()
export class RoomMemberGuard implements CanActivate {
  constructor(private readonly rooms: RoomsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // Express types route params as string | string[] in general; our
    // routes only ever declare a single `:id` segment.
    const roomId = request.params.id as string;

    const isMember = await this.rooms.isMember(roomId, request.user.userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this room');
    }
    return true;
  }
}
