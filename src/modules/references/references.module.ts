import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReferencesController } from './references.controller';

@Module({
  imports: [AuthModule],
  controllers: [ReferencesController],
})
export class ReferencesModule {}
