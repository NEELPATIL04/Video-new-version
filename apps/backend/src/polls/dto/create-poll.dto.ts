import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePollDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  question!: string;

  // 2 options minimum (a "poll" with one option isn't a choice);
  // capped at 10 — this is a lightweight in-call poll, not a survey
  // builder, and a long option list stops being usable as vote buttons
  // in a small floating panel.
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(100, { each: true })
  options!: string[];
}
