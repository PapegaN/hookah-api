import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { DemoAuthGuard } from '../auth/guards/demo-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlatformDataService } from '../platform/platform-data.service';
import { UserRole } from '../platform/platform.models';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('Users')
@ApiBearerAuth()
@Controller({
  path: 'users',
  version: '1',
})
@UseGuards(DemoAuthGuard, RolesGuard)
@Roles(UserRole.Admin)
export class UsersController {
  constructor(private readonly platformDataService: PlatformDataService) {}

  @Get()
  @ApiOperation({
    summary: 'Получить список пользователей для администраторской панели',
  })
  listUsers() {
    return this.platformDataService.listUsers();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить пользователя и его роль' })
  updateUser(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.platformDataService.updateUser(id, body);
  }
}
