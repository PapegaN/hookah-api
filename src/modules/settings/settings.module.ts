import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformModule } from '../platform/platform.module';
import { SettingsController } from './settings.controller';

@Module({
  imports: [AuthModule, PlatformModule],
  controllers: [SettingsController],
})
export class SettingsModule {}
