import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'new.client' })
  @IsString()
  @MinLength(3)
  login!: string;

  @ApiProperty({ example: 'strong-password' })
  @IsString()
  @MinLength(4)
  password!: string;

  @ApiPropertyOptional({ example: 'new.client@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'new_client' })
  @IsOptional()
  @IsString()
  @Matches(/^@?[a-zA-Z0-9_]{5,32}$/)
  telegramUsername?: string;
}
