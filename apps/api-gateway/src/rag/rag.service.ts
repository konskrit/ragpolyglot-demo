import {
  Injectable,
  BadRequestException,
  Logger,
  HttpException,
  BadGatewayException,
} from '@nestjs/common';
import { Config, ragCacheKey } from '../core/config';
import { RedisService } from '../core/redis.service';
import { RAGQueryDto, RAGResult, RagSearchHit } from '@ragpolyglot-shared';
import { clampTopK, toSources } from './rag.helpers';

const RAG_CHAT_TIMEOUT_MS = 120_000;

type StreamEvent =
  | { type: 'token'; token: string }
  | { type: 'done'; answer: string; sources?: RagSearchHit[] }
  | { type: 'error'; error: string };

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(private readonly redis: RedisService) {}

  search(queryDto: RAGQueryDto, signal?: AbortSignal): Promise<RAGResult> {
    return this.streamSearch(queryDto, () => undefined, signal);
  }

  async streamSearch(
    queryDto: RAGQueryDto,
    onToken: (token: string) => void,
    signal?: AbortSignal,
  ): Promise<RAGResult> {
    if (!queryDto?.query?.trim()) {
      throw new BadRequestException('Query is required');
    }

    const query = queryDto.query.trim();
    const topK = clampTopK(queryDto.topK ?? Config.defaultTopK);
    const cacheKey = ragCacheKey(query, queryDto.userId || 'anonymous', topK);

    const cached = await this.readCache(cacheKey);
    if (cached) {
      if (cached.answer) onToken(cached.answer);
      return cached;
    }

    await this.redis.incr('metrics:rag:cache_misses');

    try {
      const res = await fetch(`${Config.ragWorkerUrl}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/x-ndjson',
        },
        body: JSON.stringify({ query, topK }),
        signal: this.withTimeout(signal, RAG_CHAT_TIMEOUT_MS),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => undefined)) as
          | { error?: string }
          | undefined;
        throw this.fromUpstreamMessage(
          body?.error ?? 'Chat service unavailable',
        );
      }

      if (!res.body) {
        throw new BadGatewayException('Chat service unavailable');
      }

      const result = await this.readChatStream(res.body, onToken);
      await this.writeCache(cacheKey, result);
      this.logger.log(
        `RAG chat complete queryLen=${query.length} sources=${result.sources.length}`,
      );
      return result;
    } catch (err) {
      if (signal?.aborted) throw err;
      throw this.toUpstreamError(err);
    }
  }

  private async readChatStream(
    body: ReadableStream<Uint8Array>,
    onToken: (token: string) => void,
  ): Promise<RAGResult> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let answer = '';
    let sources: RagSearchHit[] = [];
    let sawDone = false;

    const onLine = (line: string) => {
      const event = this.parseStreamEvent(line);
      if (!event) {
        this.logger.warn('Ignoring malformed NDJSON chat stream line');
        return;
      }

      if (event.type === 'token') {
        if (event.token) onToken(event.token);
        return;
      }
      if (event.type === 'done') {
        sawDone = true;
        answer = event.answer ?? '';
        sources = event.sources ?? [];
        return;
      }
      if (event.type === 'error') {
        throw this.fromUpstreamMessage(event.error);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        this.consumeNdjson(decoder.decode(), buffer, onLine, true);
        break;
      }
      buffer = this.consumeNdjson(
        decoder.decode(value, { stream: true }),
        buffer,
        onLine,
        false,
      );
    }

    if (!sawDone || !answer.trim()) {
      throw new BadGatewayException('Chat service unavailable');
    }

    return {
      answer,
      sources: toSources(sources),
      cacheHit: false,
    };
  }

  private parseStreamEvent(line: string): StreamEvent | undefined {
    try {
      return JSON.parse(line) as StreamEvent;
    } catch {
      return undefined;
    }
  }

  private consumeNdjson(
    chunk: string,
    buffer: string,
    onLine: (line: string) => void,
    end: boolean,
  ): string {
    let next = buffer + chunk;
    const parts = next.split('\n');
    next = end ? '' : (parts.pop() ?? '');
    for (const part of parts) {
      const line = part.trim();
      if (line) onLine(line);
    }
    return next;
  }

  private withTimeout(
    signal: AbortSignal | undefined,
    ms: number,
  ): AbortSignal {
    const timeout = AbortSignal.timeout(ms);
    return signal ? AbortSignal.any([signal, timeout]) : timeout;
  }

  private toUpstreamError(err: unknown): HttpException {
    if (err instanceof HttpException) return err;
    if (err instanceof Error && err.name === 'AbortError') {
      return new BadGatewayException('Chat request timed out');
    }
    this.logger.error(`RAG chat failed: ${String(err)}`);
    return new BadGatewayException('Chat service unavailable');
  }

  private async readCache(cacheKey: string): Promise<RAGResult | null> {
    const cached = await this.redis.get(cacheKey);
    if (!cached) return null;

    try {
      const parsed = JSON.parse(cached) as RAGResult;
      await this.redis.incr('metrics:rag:cache_hits');
      return { ...parsed, cacheHit: true };
    } catch {
      this.logger.warn(`Corrupt RAG cache entry for key=${cacheKey}, ignoring`);
      return null;
    }
  }

  private async writeCache(cacheKey: string, result: RAGResult): Promise<void> {
    await this.redis.setex(
      cacheKey,
      Config.ragCacheTtlSeconds,
      JSON.stringify(result),
    );
  }

  private fromUpstreamMessage(message: string): HttpException {
    if (message === 'llm unavailable') {
      return new BadGatewayException(
        'The language model is unavailable. Start your LLM service and try again.',
      );
    }
    if (message === 'embedding failed') {
      return new BadGatewayException(
        'The embedding service is unavailable. Check your embedding model and try again.',
      );
    }
    return new BadGatewayException(message || 'Chat service unavailable');
  }
}
