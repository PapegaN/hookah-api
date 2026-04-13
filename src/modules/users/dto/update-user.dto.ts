import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../platform/platform.models';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'updated.client' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  login?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ example: 'updated@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'updated_telegram' })
  @IsOptional()
  @IsString()
  @Matches(/^@?[a-zA-Z0-9_]{5,32}$/)
  telegramUsername?: string;
}
