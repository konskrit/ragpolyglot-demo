import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';
import { MetricsSnapshotDto } from '../core/openapi-schemas';

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @ApiOkResponse({ type: MetricsSnapshotDto })
  getMetrics() {
    return this.metrics.getSnapshot();
  }
}
