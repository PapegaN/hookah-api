import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AppUser } from '../platform/platform.models';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { DemoAuthService } from './demo-auth.service';
import { DemoAuthGuard } from './guards/demo-auth.guard';

@ApiTags('Auth')
@Controller({
  path: 'auth',
  version: '1',
})
export class AuthController {
  constructor(private readonly demoAuthService: DemoAuthService) {}

  @Post('login')
  @ApiOperation({
    summary: 'Войти в административную панель или клиентский кабинет',
  })
  async login(@Body() body: LoginDto) {
    return this.demoAuthService.login(body.login, body.password);
  }

  @Post('register')
  @ApiOperation({ summary: 'Зарегистрировать нового клиента' })
  async register(@Body() body: RegisterDto) {
    return this.demoAuthService.register(body);
  }

  @Get('me')
  @UseGuards(DemoAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получить профиль текущего пользователя' })
  getProfile(@CurrentUser() user: AppUser) {
    return user;
  }

  @Get('demo-accounts')
  @ApiOperation({
    summary: 'Получить тестовые аккаунты для локальной разработки',
  })
  getDemoAccounts() {
    return {
      defaultAdmin: this.demoAuthService.getAdminCredentialsHint(),
      accounts: this.demoAuthService.getDemoAccounts(),
    };
  }
}
