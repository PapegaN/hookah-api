import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  HeatingSystemType,
  PackingStyle,
} from '../../platform/platform.models';
import { BlendComponentDto, IsBlendPercentageSumValid } from './shared.dto';

class ActualSetupDto {
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

export class FulfillOrderDto {
  @ApiProperty({
    type: [BlendComponentDto],
    description: 'Компоненты фактического бленда (сумма процентов = 100)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BlendComponentDto)
  @IsBlendPercentageSumValid({
    message: 'Сумма процентов фактического бленда должна равняться 100',
  })
  actualBlend!: BlendComponentDto[];

  @ApiProperty({
    type: ActualSetupDto,
  })
  @ValidateNested()
  @Type(() => ActualSetupDto)
  actualSetup!: ActualSetupDto;

  @ApiPropertyOptional({
    example:
      'Сделал микс мягче запроса, добавил больше свежести и немного снизил общую крепость.',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  packingComment?: string;
}
