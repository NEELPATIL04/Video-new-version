import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

// Deliberately excludes `status` — lifecycle transitions go through the
// dedicated /end and /cancel actions (RoomsService), which apply the
// business rules (e.g. clearing participants on end). Letting a host set
// status directly here would bypass those rules.
export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsDateString()
  scheduledFor?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(1000)
  maxParticipants?: number;
}
