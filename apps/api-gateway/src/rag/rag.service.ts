import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Config, ragCacheKey } from '../core/config';
import { RedisService } from '../core/redis.service';
import { RAGQueryDto, RAGResult, RagSearchHit } from '@ragpolyglot-shared';
import { clampTopK, toSources } from './rag.helpers';

/** LLM + embed + search can exceed the default HttpModule timeout. */
const RAG_CHAT_TIMEOUT_MS = 120_000;

interface RagWorkerChatResponse {
  query: string;
  topK: number;
  answer: string;
  sources: RagSearchHit[];
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
        this.logger.warn(
          `Corrupt RAG cache entry for key=${cacheKey}, ignoring`,
        );
      }
    }

    await this.redis.incr('metrics:rag:cache_misses');

    const res = await firstValueFrom(
      this.httpService.post<RagWorkerChatResponse>(
        `${Config.ragWorkerUrl}/api/chat`,
        { query, topK },
        { timeout: RAG_CHAT_TIMEOUT_MS },
      ),
    );

    const hits = res.data.sources ?? [];
    const result: RAGResult = {
      answer: res.data.answer,
      sources: toSources(hits),
      cacheHit: false,
    };

    await this.redis.setex(
      cacheKey,
      Config.ragCacheTtlSeconds,
      JSON.stringify(result),
    );

    this.logger.log(
      `RAG chat complete queryLen=${query.length} sources=${hits.length}`,
    );

    return result;
  }
}
