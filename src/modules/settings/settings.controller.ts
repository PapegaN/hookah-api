import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { DemoAuthGuard } from '../auth/guards/demo-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlatformDataService } from '../platform/platform-data.service';
import { ReferenceEntityType, UserRole } from '../platform/platform.models';

type SettingsResource = 'users' | 'orders' | 'backup' | ReferenceEntityType;

@ApiTags('Settings')
@ApiBearerAuth()
@Controller({
  path: 'settings',
  version: '1',
})
@UseGuards(DemoAuthGuard, RolesGuard)
@Roles(UserRole.Admin)
export class SettingsController {
  constructor(private readonly platformDataService: PlatformDataService) {}

  @Get('export/:resource')
  @ApiOperation({ summary: 'Экспортировать справочник или сущности в JSON' })
  async exportResource(@Param('resource') resource: SettingsResource) {
    return {
      resource,
      exportedAt: new Date().toISOString(),
      data: await this.platformDataService.exportResource(resource),
    };
  }

  @Get('backup')
  @ApiOperation({ summary: 'Сделать полный backup данных панели' })
  async exportBackup() {
    return {
      resource: 'backup',
      exportedAt: new Date().toISOString(),
      data: await this.platformDataService.exportBackup(),
    };
  }

  @Post('import/:resource')
  @ApiOperation({ summary: 'Импортировать JSON в выбранную сущность' })
  async importResource(
    @Param('resource') resource: SettingsResource,
    @Body() body: { data: unknown },
  ) {
    const summary = await this.platformDataService.importResource(
      resource,
      body.data,
    );

    return {
      resource,
      importedAt: new Date().toISOString(),
      ...summary,
    };
  }

  @Post('backup/import')
  @ApiOperation({ summary: 'Импортировать полный backup проекта' })
  async importBackup(@Body() body: { data: unknown }) {
    const summary = await this.platformDataService.importResource(
      'backup',
      body.data,
    );

    return {
      resource: 'backup',
      importedAt: new Date().toISOString(),
      ...summary,
    };
  }
}
