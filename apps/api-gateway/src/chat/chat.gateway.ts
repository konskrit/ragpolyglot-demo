import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  Injectable,
  Logger,
  OnModuleInit,
  HttpException,
} from '@nestjs/common';
import { Config, RAG_DOCUMENTS_VERSION_KEY } from '../core/config';
import { RabbitMQService } from '../core/rabbitmq.service';
import { RedisService } from '../core/redis.service';
import { RagService } from '../rag/rag.service';
import { ConversationService } from './conversation.service';
import { type DocumentStatusUpdate, type Source } from '@ragpolyglot-shared';
import { randomUUID } from 'crypto';
import { parseDocumentStatusEvent } from './chat.status';
import { clearDeepJob, setDeepJob } from './chat-deep-job';
import { normalizeDocumentIds } from '../rag/rag.helpers';

@Injectable()
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/ws',
})
export class ChatGateway implements OnModuleInit {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ChatGateway.name);
  private readonly abortControllers = new Map<string, AbortController>();
  private readonly inflightQueries = new Map<
    string,
    {
      conversationId: string;
      query: string;
      mode: 'fast' | 'deep';
      documentIds?: string[];
    }
  >();

  constructor(
    private readonly rabbitMQ: RabbitMQService,
    private readonly ragService: RagService,
    private readonly conversations: ConversationService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit(): void {
    this.rabbitMQ.consumeWhenReady(Config.gatewayStatusQueue, (msg) => {
      if (!msg?.content) return;

      try {
        const event = JSON.parse(msg.content.toString()) as {
          type?: string;
        };
        const parsed = parseDocumentStatusEvent(event);
        if (!parsed) return;
        this.emitDocumentStatusUpdate({
          documentId: parsed.documentId,
          status: parsed.status,
          ...parsed.progress,
          ...parsed.summarize,
        });
        if (
          parsed.status === 'ready' ||
          event.type === 'document.summarize.completed'
        ) {
          void this.redis.incr(RAG_DOCUMENTS_VERSION_KEY);
        }
      } catch (err) {
        this.logger.error(`Failed to parse RabbitMQ message: ${err}`);
      }
    });

    this.logger.log('Listening for document status events');
  }

  @SubscribeMessage('chat:query')
  async handleChatQuery(
    @MessageBody()
    data: {
      query: string;
      conversationId?: string;
      userId?: string;
      documentIds?: string[];
      mode?: 'fast' | 'deep';
    },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const query = data.query?.trim();
    if (!query) return;

    const conversationId = data.conversationId?.trim() || randomUUID();
    const mode = data.mode === 'deep' ? 'deep' : 'fast';
    const documentIds = normalizeDocumentIds(data.documentIds);
    const interruptKey = chatInterruptKey(mode, client.id, conversationId);
    const room = chatRoom(conversationId);

    client.join(room);

    if (mode === 'deep' && this.abortControllers.has(interruptKey)) {
      client.emit('chat:token', {
        token:
          'A deep search is already running for this conversation. Wait for it to finish, or press Stop.',
        conversationId,
      });
      client.emit('chat:complete', {
        conversationId,
        sources: [],
        error: true,
        interrupted: false,
      });
      return;
    }

    const abortController = new AbortController();
    this.abortControllers.set(interruptKey, abortController);
    this.inflightQueries.set(interruptKey, {
      conversationId,
      query,
      mode,
      documentIds,
    });

    let deepStarted = false;

    try {
      if (mode === 'deep') {
        await this.conversations.beginTurn(conversationId, query, documentIds);
        deepStarted = true;
        await setDeepJob(this.redis, conversationId, {
          query,
          done: 0,
          total: 0,
        });
        this.emitToChat(conversationId, 'chat:started', {
          conversationId,
          mode,
          query,
        });
      }

      const ragResult = await this.ragService.streamSearch(
        {
          query,
          userId: data.userId,
          documentIds,
          mode,
        },
        (token) => {
          if (abortController.signal.aborted) return;
          this.emitToChat(conversationId, 'chat:token', {
            token,
            conversationId,
          });
        },
        abortController.signal,
        (done, total) => {
          if (abortController.signal.aborted) return;
          void (async () => {
            await setDeepJob(this.redis, conversationId, {
              query,
              done,
              total,
            });
            if (abortController.signal.aborted) {
              await clearDeepJob(this.redis, conversationId);
            }
          })();
          this.emitToChat(conversationId, 'chat:progress', {
            conversationId,
            done,
            total,
          });
        },
      );

      if (abortController.signal.aborted) {
        if (deepStarted) {
          await clearDeepJob(this.redis, conversationId);
        }
        return;
      }

      this.inflightQueries.delete(interruptKey);
      if (mode === 'deep') {
        await this.completeDeepAssistant(
          conversationId,
          ragResult.answer,
          ragResult.sources,
        );
        await clearDeepJob(this.redis, conversationId);
      } else {
        await this.persistTurn(
          conversationId,
          query,
          ragResult.answer,
          ragResult.sources,
          documentIds,
        );
        this.emitToChat(conversationId, 'chat:started', {
          conversationId,
          mode,
          query,
        });
      }

      this.emitToChat(conversationId, 'chat:complete', {
        conversationId,
        sources: ragResult.sources,
        cacheHit: ragResult.cacheHit ?? false,
      });
    } catch (error) {
      if (abortController.signal.aborted) {
        if (deepStarted) {
          await clearDeepJob(this.redis, conversationId);
        }
        return;
      }

      this.logger.error(`Chat query failed: ${(error as Error).message}`);

      const errorMessage =
        error instanceof HttpException
          ? error.message
          : 'Sorry, I encountered an error processing your request.';

      this.inflightQueries.delete(interruptKey);
      if (mode === 'deep' && deepStarted) {
        await this.completeDeepAssistant(conversationId, errorMessage, []);
        await clearDeepJob(this.redis, conversationId);
      } else if (mode === 'fast') {
        await this.persistTurn(
          conversationId,
          query,
          errorMessage,
          [],
          documentIds,
        );
        this.emitToChat(conversationId, 'chat:started', {
          conversationId,
          mode,
          query,
        });
      }

      this.emitToChat(conversationId, 'chat:token', {
        token: errorMessage,
        conversationId,
      });
      this.emitToChat(conversationId, 'chat:complete', {
        conversationId,
        sources: [],
        error: true,
        interrupted: false,
      });
    } finally {
      this.abortControllers.delete(interruptKey);
      this.inflightQueries.delete(interruptKey);
    }
  }

  @SubscribeMessage('chat:interrupt')
  async handleInterrupt(
    @MessageBody() data: { conversationId?: string },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const conversationId = data.conversationId?.trim();
    if (!conversationId) return;

    const deepKey = chatInterruptKey('deep', client.id, conversationId);
    const fastKey = chatInterruptKey('fast', client.id, conversationId);
    this.abortControllers.get(deepKey)?.abort();
    this.abortControllers.get(fastKey)?.abort();

    const inflight =
      this.inflightQueries.get(deepKey) ?? this.inflightQueries.get(fastKey);
    if (!inflight) return;
    this.inflightQueries.delete(deepKey);
    this.inflightQueries.delete(fastKey);
    this.abortControllers.delete(deepKey);
    this.abortControllers.delete(fastKey);

    if (inflight.mode === 'deep') {
      await this.completeDeepAssistant(
        inflight.conversationId,
        '(interrupted)',
        [],
      );
      await clearDeepJob(this.redis, conversationId);
    } else {
      await this.persistTurn(
        inflight.conversationId,
        inflight.query,
        '(interrupted)',
        [],
        inflight.documentIds,
      );
    }

    this.emitToChat(conversationId, 'chat:complete', {
      conversationId,
      sources: [],
      interrupted: true,
    });

    this.logger.log(
      `Chat interrupted socket=${client.id} conversationId=${conversationId}`,
    );
  }

  @SubscribeMessage('subscribe:document')
  handleSubscribeDocument(
    @MessageBody() data: { documentId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const { documentId } = data;
    if (!documentId) return;

    client.join(`doc:${documentId}`);
  }

  @SubscribeMessage('subscribe:conversation')
  handleSubscribeConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const conversationId = data.conversationId?.trim();
    if (!conversationId) return;
    client.join(chatRoom(conversationId));
  }

  private emitToChat(conversationId: string, event: string, payload: unknown) {
    this.server.to(chatRoom(conversationId)).emit(event, payload);
  }

  private emitDocumentStatusUpdate(
    update: Omit<DocumentStatusUpdate, 'timestamp'>,
  ): void {
    const payload: DocumentStatusUpdate = {
      ...update,
      timestamp: new Date().toISOString(),
    };

    this.server
      .to(`doc:${update.documentId}`)
      .emit('document:status-update', payload);
    if (update.status && update.status !== 'processing') {
      this.logger.log(
        `Emitted status "${update.status}" for doc:${update.documentId}`,
      );
    } else if (update.summarizeStatus !== undefined) {
      this.logger.log(
        `Emitted summarize "${String(update.summarizeStatus)}" for doc:${update.documentId}`,
      );
    }
  }

  private async persistTurn(
    conversationId: string,
    query: string,
    answer: string,
    sources: Source[],
    documentIds?: string[],
  ): Promise<void> {
    try {
      await this.conversations.persistTurn(
        conversationId,
        query,
        answer,
        sources,
        documentIds,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to persist chat turn: ${(err as Error).message}`,
      );
    }
  }

  private async completeDeepAssistant(
    conversationId: string,
    answer: string,
    sources: Source[],
  ): Promise<void> {
    try {
      await this.conversations.completeAssistant(
        conversationId,
        answer,
        sources,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to persist deep assistant: ${(err as Error).message}`,
      );
    }
  }
}

function chatRoom(conversationId: string): string {
  return `chat:${conversationId}`;
}

function chatInterruptKey(
  mode: 'fast' | 'deep',
  clientId: string,
  conversationId: string,
): string {
  return mode === 'deep'
    ? `deep:${conversationId}`
    : `${clientId}:${conversationId}`;
}
