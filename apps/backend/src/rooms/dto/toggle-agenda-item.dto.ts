import { IsBoolean } from 'class-validator';

export class ToggleAgendaItemDto {
  @IsBoolean()
  completed!: boolean;
}
