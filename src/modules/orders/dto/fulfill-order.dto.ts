import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class FulfillOrderDto {
  @ApiProperty({
    type: [String],
    example: ['uuid-tobacco-1', 'uuid-tobacco-3'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  actualTobaccoIds!: string[];

  @ApiPropertyOptional({
    example:
      'Сделал микс мягче запроса, добавил больше свежести и немного снизил общую крепость.',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  packingComment?: string;
}
