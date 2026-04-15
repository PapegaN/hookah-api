import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ForumService } from './forum.service';
import { PublicForumController } from './public-forum.controller';
import { ReferencesController } from './references.controller';

@Module({
  imports: [AuthModule],
  controllers: [ReferencesController, PublicForumController],
  providers: [ForumService],
})
export class ReferencesModule {}
