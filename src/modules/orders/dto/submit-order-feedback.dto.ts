import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class SubmitOrderFeedbackDto {
  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  ratingScore!: number;

  @ApiPropertyOptional({
    example: 'Очень комфортная крепость, вкус раскрывался ровно и без горечи.',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  ratingReview?: string;
}
