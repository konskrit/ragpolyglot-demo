import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { RabbitMQService } from './rabbitmq.service';
import { RedisService } from './redis.service';
import { PostgresService } from './postgres.service';
import { Config } from './config';

@Module({
  imports: [HttpModule.register({ timeout: Config.httpTimeoutMs })],
  providers: [RabbitMQService, RedisService, PostgresService],
  exports: [HttpModule, RabbitMQService, RedisService, PostgresService],
})
export class CoreModule {}
