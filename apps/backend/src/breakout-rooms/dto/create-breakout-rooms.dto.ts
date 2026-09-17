import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

// One sub-room of the split: a host-chosen display label plus the list of
// currently-in-the-main-room participants (by userId, never trusted role —
// role is always re-derived server-side from their existing Participant
// row) to move into it. participantUserIds may be empty — a host can stand
// up an empty room to move people into one at a time if they'd rather not
// batch-assign everyone up front.
class BreakoutRoomDefinitionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  label!: string;

  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  participantUserIds!: string[];
}

// v1 is manual assignment only (see FEATURES.md's Research notes) — the
// host designs the whole split client-side (who goes where) and submits it
// as one request, created in a single DB transaction so participants never
// observe a partially-split meeting (some rooms created, others not).
export class CreateBreakoutRoomsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BreakoutRoomDefinitionDto)
  rooms!: BreakoutRoomDefinitionDto[];
}
