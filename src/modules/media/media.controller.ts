import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DemoAuthGuard } from '../auth/guards/demo-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AppUser } from '../platform/platform.models';
import { CompleteMediaUploadDto } from './dto/complete-media-upload.dto';
import { CreateMediaUploadDto } from './dto/create-media-upload.dto';
import { MediaService } from './media.service';

@ApiTags('Media')
@ApiBearerAuth()
@Controller({
  path: 'media',
  version: '1',
})
@UseGuards(DemoAuthGuard, RolesGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('uploads/presign')
  @ApiOperation({
    summary: 'Создать draft asset и получить presigned URL для загрузки',
  })
  async createUploadIntent(
    @CurrentUser() actor: AppUser,
    @Body() body: CreateMediaUploadDto,
  ) {
    return this.mediaService.createUploadIntent(actor, body);
  }

  @Post('assets/:id/complete')
  @ApiOperation({
    summary: 'Подтвердить завершение загрузки asset в object storage',
  })
  async completeUpload(
    @CurrentUser() actor: AppUser,
    @Param('id') id: string,
    @Body() body: CompleteMediaUploadDto,
  ) {
    return this.mediaService.completeUpload(actor, id, body);
  }

  @Get('assets')
  @ApiOperation({ summary: 'Получить список последних media assets' })
  async listAssets(@Query('limit') limit?: string) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.mediaService.listAssets(
      Number.isInteger(parsedLimit) && parsedLimit! > 0 ? parsedLimit : 20,
    );
  }
}
