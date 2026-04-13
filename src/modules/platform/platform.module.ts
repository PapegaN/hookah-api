import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MemoryPlatformStore } from './memory-platform.store';
import { PlatformDataService } from './platform-data.service';
import { PostgresPlatformStore } from './postgres-platform.store';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [MemoryPlatformStore, PostgresPlatformStore, PlatformDataService],
  exports: [PlatformDataService],
})
export class PlatformModule {}
