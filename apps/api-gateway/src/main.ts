import './core/load-env';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync, existsSync } from 'fs';
import { AppModule } from './app.module';
import { RedisService } from './core/redis.service';
import { PostgresService } from './core/postgres.service';
import { Config } from './core/config';
import { AllExceptionsFilter } from './core/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({
    origin: true,
    credentials: true,
  });

  if (!existsSync(Config.uploadsDir)) {
    mkdirSync(Config.uploadsDir, { recursive: true });
  }

  const redis = app.get(RedisService);
  await redis.connect();

  const postgres = app.get(PostgresService);
  await postgres.connect();

  await app.listen(Config.port);

  Logger.log(
    `API Gateway running on http://localhost:${Config.port}/api`,
    'Bootstrap',
  );
}

bootstrap().catch((err) => {
  Logger.error(`Bootstrap failed: ${err}`, 'Bootstrap');
  process.exit(1);
});
