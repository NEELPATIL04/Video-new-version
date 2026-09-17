import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

// Coordinates are normalized to 0-1 (fraction of the canvas's own
// width/height) rather than raw pixels, the same reasoning
// FEATURES.md's Research notes already flagged for this feature: a
// stroke drawn on one participant's canvas must line up the same way on
// every other participant's canvas regardless of their own window/canvas
// size.
class WhiteboardPointDto {
  @IsNumber()
  @Min(0)
  @Max(1)
  x!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  y!: number;
}

export class CreateWhiteboardStrokeDto {
  // A freehand gesture with only one sampled point isn't a stroke (it's
  // a dot with no line to draw); capped well above anything a real
  // pointermove-sampled gesture would produce, just to bound row size.
  @ValidateNested({ each: true })
  @Type(() => WhiteboardPointDto)
  @ArrayMinSize(2)
  @ArrayMaxSize(5000)
  points!: WhiteboardPointDto[];

  // #rrggbb only — keeps this a plain string the canvas can hand straight
  // to CanvasRenderingContext2D.strokeStyle with no further parsing, and
  // rejects anything that isn't actually a color (e.g. CSS injection via
  // an arbitrary string).
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  width?: number;
}
