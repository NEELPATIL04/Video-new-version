import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateRoomDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  // Absent = instant meeting. Present = scheduled for later. Recurrence
  // (FEATURES.md #5) is deliberately out of scope here — needs a separate
  // recurrence-rule design, not a field bolted onto this DTO.
  @IsOptional()
  @IsDateString()
  scheduledFor?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(1000)
  maxParticipants?: number;

  // Fixed for the room's lifetime once set — see Room.e2eeEnabled in
  // schema.prisma for why this never changes mid-call. The actual
  // encryption key is never sent to this endpoint (or anywhere else on
  // the backend); it's generated client-side after creation succeeds.
  @IsOptional()
  @IsBoolean()
  e2eeEnabled?: boolean;
}
