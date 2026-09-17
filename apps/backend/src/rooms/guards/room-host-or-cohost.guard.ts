import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { RoomsService } from '../rooms.service';
import { AuthenticatedRequest } from '../../auth/guards/jwt-auth.guard';

// Must run AFTER JwtAuthGuard (needs req.user). Same DB-level-verification
// shape as RoomHostGuard, but backed by isHostOrCoHost instead of isHost —
// used only for call-control/queue-management actions (mute, remove,
// admit, deny, lock, unlock, lower-hand) where a co-host is meant to have
// the same privileges as the real host. Room-lifecycle actions
// (update/cancel/end) and appointing/revoking co-hosts themselves stay on
// RoomHostGuard, checked strictly against Room.hostId — a co-host must
// never be able to promote a rival co-host, demote the real host, or
// rename/end the meeting outright. See FEATURES.md's Research notes for
// the full reasoning behind keeping these two guards separate.
@Injectable()
export class RoomHostOrCoHostGuard implements CanActivate {
  constructor(private readonly rooms: RoomsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const roomId = request.params.id as string;

    const allowed = await this.rooms.isHostOrCoHost(
      roomId,
      request.user.userId,
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Only the host or a co-host can perform this action',
      );
    }
    return true;
  }
}
