import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../database/database.service';
import { HealthResponseDto } from './dto/health-response.dto';

@ApiTags('Health')
@Controller({
  path: 'health',
  version: '1',
})
export class HealthController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Get()
  @ApiOperation({
    summary:
      'Проверить, что API поднят и готов к дальнейшей инициализации модулей',
  })
  @ApiOkResponse({
    type: HealthResponseDto,
  })
  async getHealth(): Promise<HealthResponseDto & { database: string }> {
    return {
      status: 'ok',
      service: 'hookah-api',
      version: process.env.npm_package_version ?? '0.1.0',
      timestamp: new Date().toISOString(),
      boundedContexts: ['auth', 'catalog', 'equipment', 'orders', 'recipes'],
      database: this.databaseService.isEnabled()
        ? (await this.databaseService.healthcheck())
          ? 'connected'
          : 'unhealthy'
        : 'disabled',
    };
  }
}
