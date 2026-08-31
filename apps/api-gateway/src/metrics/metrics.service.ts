import { Injectable } from '@nestjs/common';
import { MetricsSnapshot } from '@ragpolyglot-shared';
import { RedisService } from '../core/redis.service';
import { PostgresService } from '../core/postgres.service';
import { loadSql } from '../core/load-sql';

@Injectable()
export class MetricsService {
  constructor(
    private readonly redis: RedisService,
    private readonly postgres: PostgresService,
  ) {}

  async getSnapshot(): Promise<MetricsSnapshot> {
    const [
      hits,
      misses,
      querySummary,
      series,
      ingest,
      failures,
      docs,
      jobs,
      redisStats,
    ] = await Promise.all([
      this.readCounter('metrics:rag:cache_hits'),
      this.readCounter('metrics:rag:cache_misses'),
      this.postgres.query<{ count: string; avg_ms: string | null }>(
        loadSql('query-summary.sql'),
      ),
      this.postgres.query<{
        hour: Date;
        count: string;
        avg_ms: string;
      }>(loadSql('query-series.sql')),
      this.postgres.query<{
        processed: string;
        avg_chunking: string | null;
        avg_embedding: string | null;
      }>(loadSql('ingest-summary.sql')),
      this.postgres.query<{ count: string }>(loadSql('ingest-failures.sql')),
      this.postgres.query<{ status: string; count: string }>(
        loadSql('document-counts.sql'),
      ),
      this.postgres.query<{ completed: string; failed: string }>(
        loadSql('jobs-summary.sql'),
      ),
      this.postgres.query<{ used_memory: string | null }>(
        loadSql('redis-stats-latest.sql'),
      ),
    ]);

    const total = hits + misses;
    const q = querySummary[0];
    const ing = ingest[0];
    const j = jobs[0];
    const memRaw = redisStats[0]?.used_memory;
    const mem = memRaw == null || memRaw === '' ? NaN : Number(memRaw);

    const documents = {
      uploading: 0,
      processing: 0,
      ready: 0,
      failed: 0,
    };
    for (const row of docs) {
      if (row.status in documents) {
        documents[row.status as keyof typeof documents] =
          Number(row.count) || 0;
      }
    }

    return {
      cache: {
        hits,
        misses,
        hitRate: total === 0 ? null : Math.round((hits / total) * 1000) / 10,
      },
      queries: {
        last24h: Number(q?.count) || 0,
        avgLatencyMs: q?.avg_ms == null ? null : Number(q.avg_ms),
        series: series.map((row) => ({
          hour: new Date(row.hour).toISOString(),
          count: Number(row.count) || 0,
          avgMs: Number(row.avg_ms) || 0,
        })),
      },
      ingest: {
        processed24h: Number(ing?.processed) || 0,
        failed24h: Number(failures[0]?.count) || 0,
        avgChunkingMs:
          ing?.avg_chunking == null ? null : Number(ing.avg_chunking),
        avgEmbeddingMs:
          ing?.avg_embedding == null ? null : Number(ing.avg_embedding),
      },
      documents,
      jobs: {
        completed24h: Number(j?.completed) || 0,
        failed24h: Number(j?.failed) || 0,
      },
      redis: {
        usedMemoryBytes: Number.isFinite(mem) ? mem : null,
      },
    };
  }

  private async readCounter(key: string): Promise<number> {
    const raw = await this.redis.get(key);
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
}
