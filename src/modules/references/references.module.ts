import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PublicForumController } from './public-forum.controller';
import { ReferencesController } from './references.controller';

@Module({
  imports: [AuthModule],
  controllers: [ReferencesController, PublicForumController],
})
export class ReferencesModule {}
