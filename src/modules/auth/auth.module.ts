import { Module } from '@nestjs/common';
import { PlatformModule } from '../platform/platform.module';
import { AuthController } from './auth.controller';
import { DemoAuthService } from './demo-auth.service';
import { DemoAuthGuard } from './guards/demo-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [PlatformModule],
  controllers: [AuthController],
  providers: [DemoAuthService, DemoAuthGuard, RolesGuard],
  exports: [DemoAuthService, DemoAuthGuard, RolesGuard],
})
export class AuthModule {}
