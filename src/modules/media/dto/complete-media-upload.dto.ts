import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CompleteMediaUploadDto {
  @ApiPropertyOptional({ example: '4f1ce8f0f9f22f0f...' })
  @IsOptional()
  @IsString()
  checksumSha256?: string;

  @ApiPropertyOptional({ example: 1200 })
  @IsOptional()
  @IsInt()
  @Min(1)
  widthPx?: number;

  @ApiPropertyOptional({ example: 1200 })
  @IsOptional()
  @IsInt()
  @Min(1)
  heightPx?: number;
}
