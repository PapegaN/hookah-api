import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, Max, Min } from 'class-validator';

export class CreateMediaUploadDto {
  @ApiProperty({ example: 'darkside-supernova.jpg' })
  @IsString()
  fileName!: string;

  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  mimeType!: string;

  @ApiProperty({ example: 245120 })
  @IsInt()
  @Min(1)
  @Max(15 * 1024 * 1024)
  byteSize!: number;

  @ApiProperty({
    enum: ['tobacco_gallery', 'forum_post', 'forum_comment'],
    example: 'tobacco_gallery',
  })
  @IsIn(['tobacco_gallery', 'forum_post', 'forum_comment'])
  usageType!: 'tobacco_gallery' | 'forum_post' | 'forum_comment';
}
