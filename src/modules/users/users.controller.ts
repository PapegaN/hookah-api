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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { DemoAuthService } from '../auth/demo-auth.service';
import { DemoAuthGuard } from '../auth/guards/demo-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlatformDataService } from '../platform/platform-data.service';
import type { AppUser } from '../platform/platform.models';
import { UserRole } from '../platform/platform.models';
import { CreateUserDto } from './dto/create-user.dto';
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
  constructor(
    private readonly platformDataService: PlatformDataService,
    private readonly demoAuthService: DemoAuthService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Получить список пользователей для административной панели',
  })
  async listUsers() {
    return this.platformDataService.listUsers();
  }

  @Post()
  @ApiOperation({
    summary: 'Создать нового пользователя из административной панели',
  })
  async createUser(@CurrentUser() user: AppUser, @Body() body: CreateUserDto) {
    return this.demoAuthService.createUserByAdmin(user.id, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить пользователя, роль и статус доступа' })
  async updateUser(
    @Param('id') id: string,
    @CurrentUser() user: AppUser,
    @Body() body: UpdateUserDto,
  ) {
    return this.platformDataService.updateUser(user.id, id, body);
  }
}
