import { Controller, Get, Res } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { RabbitMQService } from '../core/rabbitmq.service';
import { RedisService } from '../core/redis.service';
import { Config } from '../core/config';

@Controller('health')
export class HealthController {
  constructor(
    private readonly httpService: HttpService,
    private readonly rabbitMQ: RabbitMQService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async health(@Res({ passthrough: true }) res: Response) {
    const checks = {
      service: 'api-gateway',
      timestamp: new Date().toISOString(),
      document_service: await this.probe(`${Config.documentServiceUrl}/health`),
      rag_worker: await this.probe(`${Config.ragWorkerUrl}/health`),
      event_processor: await this.probe(`${Config.eventProcessorUrl}/health`),
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
