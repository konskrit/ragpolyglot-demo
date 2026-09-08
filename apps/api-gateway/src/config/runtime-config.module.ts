import { Module } from '@nestjs/common';
import { RuntimeConfigController } from './runtime-config.controller';
import { RuntimeConfigService } from './runtime-config.service';

@Module({
  controllers: [RuntimeConfigController],
  providers: [RuntimeConfigService],
})
export class RuntimeConfigModule {}
