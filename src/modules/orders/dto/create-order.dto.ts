import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({
    example: 'Table 3',
  })
  @IsString()
  @MinLength(3)
  tableLabel!: string;

  @ApiProperty({
    example:
      'Хочу мягкий ягодно-свежий кальян без сильной десертности, можно с легким холодком.',
  })
  @IsString()
  @MinLength(10)
  description!: string;

  @ApiProperty({
    type: [String],
    example: ['uuid-tobacco-1', 'uuid-tobacco-2'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  requestedTobaccoIds!: string[];
}
