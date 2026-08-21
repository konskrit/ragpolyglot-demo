import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Config, ragCacheKey } from '../core/config';
import { RedisService } from '../core/redis.service';
import { RAGQueryDto, RAGResult, RagSearchHit } from '@ragpolyglot-shared';
import { buildAnswer, clampTopK, toSources } from './rag.helpers';

interface RagWorkerSearchResponse {
  query: string;
  topK: number;
  results: RagSearchHit[];
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly redis: RedisService,
  ) {}

  async search(queryDto: RAGQueryDto): Promise<RAGResult> {
    if (!queryDto?.query?.trim()) {
      throw new BadRequestException('Query is required');
    }

    const query = queryDto.query.trim();
    const topK = clampTopK(queryDto.topK ?? Config.defaultTopK);
    const userId = queryDto.userId || 'anonymous';
    const cacheKey = ragCacheKey(query, userId, topK);

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as RAGResult;
        await this.redis.incr('metrics:rag:cache_hits');
        return { ...parsed, cacheHit: true };
      } catch {
        this.logger.warn(`Corrupt RAG cache entry for key=${cacheKey}, ignoring`);
      }
    }

    await this.redis.incr('metrics:rag:cache_misses');

    const res = await firstValueFrom(
      this.httpService.post<RagWorkerSearchResponse>(
        `${Config.ragWorkerUrl}/api/search`,
        { query, topK },
      ),
    );

    const hits = res.data.results ?? [];
    const result: RAGResult = {
      answer: buildAnswer(hits),
      sources: toSources(hits),
      cacheHit: false,
    };

    await this.redis.setex(
      cacheKey,
      Config.ragCacheTtlSeconds,
      JSON.stringify(result),
    );

    this.logger.log(
      `RAG search complete queryLen=${query.length} hits=${hits.length}`,
    );

    return result;
  }
}
