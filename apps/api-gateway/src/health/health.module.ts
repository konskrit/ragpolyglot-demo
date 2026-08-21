import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { CoreModule } from '../core/core.module';

@Module({
  imports: [CoreModule],
  controllers: [HealthController],
})
export class HealthModule {}
