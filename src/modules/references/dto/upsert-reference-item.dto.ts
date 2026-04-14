import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpsertReferenceItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  line?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  flavorName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  markingCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  markingGtin?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  lineStrengthLevel?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  estimatedStrengthLevel?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  brightnessLevel?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  flavorDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  manufacturer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  innerDiameterMm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasDiffuser?: boolean;

  @ApiPropertyOptional({ enum: ['phunnel', 'killer', 'turka', 'elian'] })
  @IsOptional()
  @IsIn(['phunnel', 'killer', 'turka', 'elian'])
  bowlType?: 'phunnel' | 'killer' | 'turka' | 'elian';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  material?: string;

  @ApiPropertyOptional({
    enum: ['bucket', 'large', 'medium', 'small', 'very_small'],
  })
  @IsOptional()
  @IsIn(['bucket', 'large', 'medium', 'small', 'very_small'])
  capacityBucket?: 'bucket' | 'large' | 'medium' | 'small' | 'very_small';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sizeLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
