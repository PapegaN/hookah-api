import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { DemoAuthGuard } from '../auth/guards/demo-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlatformDataService } from '../platform/platform-data.service';
import { ReferenceEntityType, UserRole } from '../platform/platform.models';
import { UpsertReferenceItemDto } from './dto/upsert-reference-item.dto';

@ApiTags('References')
@ApiBearerAuth()
@Controller({
  path: 'references',
  version: '1',
})
@UseGuards(DemoAuthGuard, RolesGuard)
export class ReferencesController {
  constructor(private readonly platformDataService: PlatformDataService) {}

  @Get()
  @ApiOperation({
    summary:
      'Получить все справочники для административной панели и конструктора заказа',
  })
  getReferences() {
    return this.platformDataService.getReferencesSnapshot();
  }

  @Post(':entityType')
  @Roles(UserRole.Admin)
  @ApiOperation({ summary: 'Создать элемент справочника' })
  createReference(
    @Param('entityType') entityType: ReferenceEntityType,
    @Body() body: UpsertReferenceItemDto,
  ) {
    return this.platformDataService.createReference(entityType, body);
  }

  @Patch(':entityType/:id')
  @Roles(UserRole.Admin)
  @ApiOperation({ summary: 'Обновить элемент справочника' })
  updateReference(
    @Param('entityType') entityType: ReferenceEntityType,
    @Param('id') id: string,
    @Body() body: UpsertReferenceItemDto,
  ) {
    return this.platformDataService.updateReference(entityType, id, body);
  }
}
