import { IsBoolean, IsOptional } from 'class-validator';

// Set true only after the client has already shown the caller an
// "already connected elsewhere" prompt and they chose to continue here
// anyway — see RoomsService.joinRoom.
export class JoinRoomDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
