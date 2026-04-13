import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../platform/platform.models';

export class CreateUserDto {
  @ApiProperty({ example: 'new.client' })
  @IsString()
  @MinLength(3)
  login!: string;

  @ApiProperty({ example: 'strong-password' })
  @IsString()
  @MinLength(4)
  password!: string;

  @ApiProperty({ enum: UserRole, example: UserRole.Client })
  @IsEnum(UserRole)
  role!: UserRole;

  @ApiPropertyOptional({ example: 'new.client@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'new_client' })
  @IsOptional()
  @IsString()
  @Matches(/^@?[a-zA-Z0-9_]{5,32}$/)
  telegramUsername?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isApproved?: boolean;
}
