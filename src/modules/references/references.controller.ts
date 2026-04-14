import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DemoAuthGuard } from '../auth/guards/demo-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlatformDataService } from '../platform/platform-data.service';
import type { AppUser } from '../platform/platform.models';
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
  async getReferences() {
    return this.platformDataService.getReferencesSnapshot();
  }

  @Post(':entityType')
  @ApiOperation({ summary: 'Создать элемент справочника' })
  async createReference(
    @CurrentUser() user: AppUser,
    @Param('entityType') entityType: ReferenceEntityType,
    @Body() body: UpsertReferenceItemDto,
  ) {
    this.assertCanMutateReference(user, entityType);
    return this.platformDataService.createReference(entityType, body);
  }

  @Patch(':entityType/:id')
  @ApiOperation({ summary: 'Обновить элемент справочника' })
  async updateReference(
    @CurrentUser() user: AppUser,
    @Param('entityType') entityType: ReferenceEntityType,
    @Param('id') id: string,
    @Body() body: UpsertReferenceItemDto,
  ) {
    this.assertCanMutateReference(user, entityType);
    return this.platformDataService.updateReference(entityType, id, body);
  }

  private assertCanMutateReference(
    user: AppUser,
    entityType: ReferenceEntityType,
  ): void {
    if (user.role === UserRole.Admin) {
      return;
    }

    if (
      user.role === UserRole.HookahMaster &&
      entityType === ReferenceEntityType.Tobaccos
    ) {
      return;
    }

    throw new ForbiddenException('Insufficient permissions');
  }
}
