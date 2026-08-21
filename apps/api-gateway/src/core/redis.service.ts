import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { Config } from './config';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  private ready = false;

  constructor() {
    this.client = new Redis(normalizeRedisUrl(Config.redisUrl), {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
      retryStrategy: () => null,
    });

    this.client.on('ready', () => {
      this.ready = true;
      this.logger.log('Connected to Redis');
    });

    this.client.on('error', (err) => {
      this.ready = false;
      this.logger.warn(`Redis error: ${err.message}`);
    });

    this.client.on('end', () => {
      this.ready = false;
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
    } catch (err) {
      this.logger.warn(
        `Redis unavailable, continuing without cache: ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  async get(key: string): Promise<string | null> {
    if (!this.ready) return null;
    try {
      return await this.client.get(key);
    } catch (err) {
      this.logger.warn(`Redis GET failed: ${(err as Error).message}`);
      return null;
    }
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    if (!this.ready) return;
    try {
      await this.client.setex(key, ttlSeconds, value);
    } catch (err) {
      this.logger.warn(`Redis SETEX failed: ${(err as Error).message}`);
    }
  }

  async incr(key: string): Promise<void> {
    if (!this.ready) return;
    try {
      await this.client.incr(key);
    } catch (err) {
      this.logger.warn(`Redis INCR failed: ${(err as Error).message}`);
    }
  }
}

function normalizeRedisUrl(url: string): string {
  if (url.startsWith('redis://') || url.startsWith('rediss://')) {
    return url;
  }
  return `redis://${url}`;
}
