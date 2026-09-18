import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsBoolean()
  e2eeEnabled?: boolean;

  // 0-30 starter agenda item titles, applied in array order when this
  // template is used to create a room (see RoomsService.createRoom) — a
  // template with no agenda items at all is a valid, common case (a host
  // who only wants to reuse a name/E2EE default).
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(200, { each: true })
  agendaItems?: string[];
}
