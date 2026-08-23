import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Module({
  imports: [CoreModule],
  controllers: [MetricsController],
  providers: [MetricsService],
})
export class MetricsModule {}
