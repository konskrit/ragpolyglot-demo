import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { HttpService } from '@nestjs/axios';
import { Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { RabbitMQService } from '../core/rabbitmq.service';
import { RedisService } from '../core/redis.service';
import { Config } from '../core/config';
import { HealthResponseDto } from '../core/openapi-schemas';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly httpService: HttpService,
    private readonly rabbitMQ: RabbitMQService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @ApiOkResponse({ type: HealthResponseDto, description: '503 when degraded' })
  async health(@Res({ passthrough: true }) res: Response) {
    const [document_service, rag_worker, event_processor] = await Promise.all([
      this.probe(`${Config.documentServiceUrl}/health`),
      this.probe(`${Config.ragWorkerUrl}/health`),
      this.probe(`${Config.eventProcessorUrl}/health`),
    ]);

    const checks = {
      service: 'api-gateway',
      timestamp: new Date().toISOString(),
      document_service,
      rag_worker,
      event_processor,
      redis: this.redis.isReady() ? 'ok' : 'error',
      rabbitmq: this.rabbitMQ.isConnected() ? 'ok' : 'error',
    };

    const healthy =
      checks.document_service === 'ok' &&
      checks.rag_worker === 'ok' &&
      checks.event_processor === 'ok' &&
      checks.redis === 'ok' &&
      checks.rabbitmq === 'ok';

    if (!healthy) {
      res.status(503);
    }

    return {
      ...checks,
      status: healthy ? 'ok' : 'degraded',
      uptime: process.uptime(),
    };
  }

  private async probe(url: string): Promise<'ok' | 'error'> {
    try {
      await firstValueFrom(this.httpService.get(url));
      return 'ok';
    } catch {
      return 'error';
    }
  }
}
