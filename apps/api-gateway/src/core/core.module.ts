import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { RabbitMQService } from './rabbitmq.service';
import { RedisService } from './redis.service';
import { Config } from './config';

@Module({
  imports: [HttpModule.register({ timeout: Config.httpTimeoutMs })],
  providers: [RabbitMQService, RedisService],
  exports: [HttpModule, RabbitMQService, RedisService],
})
export class CoreModule {}
