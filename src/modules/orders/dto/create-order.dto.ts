import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  HeatingSystemType,
  PackingStyle,
} from '../../platform/platform.models';

class BlendComponentDto {
  @ApiProperty({ example: 'uuid-tobacco-1' })
  @IsString()
  tobaccoId!: string;

  @ApiProperty({ example: 60 })
  @IsNumber()
  @Min(1)
  @Max(100)
  percentage!: number;
}

class RequestedSetupDto {
  @ApiProperty({ enum: HeatingSystemType, example: HeatingSystemType.Coal })
  @IsEnum(HeatingSystemType)
  heatingSystemType!: HeatingSystemType;

  @ApiProperty({ enum: PackingStyle, required: false })
  @IsOptional()
  @IsEnum(PackingStyle)
  packingStyle?: PackingStyle;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  customPackingStyle?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  hookahId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  bowlId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  kalaudId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  charcoalId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  electricHeadId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  charcoalCount?: number;

  @ApiProperty({ required: false, enum: ['with_cap', 'without_cap'] })
  @IsOptional()
  @IsString()
  warmupMode?: 'with_cap' | 'without_cap';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  warmupDurationMinutes?: number;
}

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
    type: [BlendComponentDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BlendComponentDto)
  requestedBlend!: BlendComponentDto[];

  @ApiProperty({
    type: RequestedSetupDto,
  })
  @ValidateNested()
  @Type(() => RequestedSetupDto)
  requestedSetup!: RequestedSetupDto;
}
