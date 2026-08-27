import { createHash } from 'crypto';
import { join } from 'path';

export const Config = {
  uploadsDir: process.env.UPLOADS_DIR || join(process.cwd(), 'uploads'),

  documentServiceUrl:
    process.env.DOCUMENT_SERVICE_URL || 'http://localhost:5000',

  ragWorkerUrl: process.env.RAG_WORKER_URL || 'http://localhost:8081',

  rabbitmqUrl: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672/',

  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  databaseUrl:
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/app_db?sslmode=disable',

  port: Number(process.env.PORT) || 3000,

  httpTimeoutMs: Number(process.env.HTTP_TIMEOUT_MS) || 10_000,

  ragCacheTtlSeconds: Number(process.env.RAG_CACHE_TTL_SECONDS) || 600,

  defaultTopK: Number(process.env.RAG_TOP_K) || 5,

  documentEventsExchange: 'document.events',
  gatewayStatusQueue: 'gateway.document-status.queue',
} as const;

export function ragCacheKey(
  query: string,
  userId = 'anonymous',
  topK?: number,
): string {
  const normalized = `${query.trim().toLowerCase()}|topK=${topK ?? ''}`;
  const hash = createHash('sha256').update(normalized).digest('hex');
  return `rag:query:${hash}:${userId}`;
}
