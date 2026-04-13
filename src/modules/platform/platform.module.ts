import { Global, Module } from '@nestjs/common';
import { PlatformDataService } from './platform-data.service';

@Global()
@Module({
  providers: [PlatformDataService],
  exports: [PlatformDataService],
})
export class PlatformModule {}
