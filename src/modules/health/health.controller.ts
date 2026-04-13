import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthResponseDto } from './dto/health-response.dto';

@ApiTags('Health')
@Controller({
  path: 'health',
  version: '1',
})
export class HealthController {
  @Get()
  @ApiOperation({
    summary:
      'Проверить, что API поднят и готов к дальнейшей инициализации модулей',
  })
  @ApiOkResponse({
    type: HealthResponseDto,
  })
  getHealth(): HealthResponseDto {
    return {
      status: 'ok',
      service: 'hookah-api',
      version: process.env.npm_package_version ?? '0.1.0',
      timestamp: new Date().toISOString(),
      boundedContexts: ['auth', 'catalog', 'equipment', 'orders', 'recipes'],
    };
  }
}
