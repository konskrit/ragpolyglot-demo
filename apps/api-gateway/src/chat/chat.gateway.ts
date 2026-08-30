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
import { Config } from '../core/config';
import { RabbitMQService } from '../core/rabbitmq.service';
import { RagService } from '../rag/rag.service';
import { ConversationService } from './conversation.service';
import {
  isDocumentProgressStage,
  type DocumentProgressEvent,
  type DocumentStatus,
  type DocumentStatusUpdate,
  type Source,
} from '@ragpolyglot-shared';
import { randomUUID } from 'crypto';

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
    { conversationId: string; query: string }
  >();

  constructor(
    private readonly rabbitMQ: RabbitMQService,
    private readonly ragService: RagService,
    private readonly conversations: ConversationService,
  ) {}

  onModuleInit(): void {
    this.rabbitMQ.consumeWhenReady(Config.gatewayStatusQueue, (msg) => {
      if (!msg?.content) return;

      try {
        const event = JSON.parse(msg.content.toString()) as {
          type?: string;
          documentId?: string;
        } & Partial<Pick<DocumentProgressEvent, 'stage' | 'done' | 'total'>>;

        if (!event.documentId) return;

        if (event.type === 'document.processed') {
          this.emitDocumentStatusUpdate(event.documentId, 'ready');
        } else if (event.type === 'document.failed') {
          this.emitDocumentStatusUpdate(event.documentId, 'failed');
        } else if (event.type === 'document.paused') {
          this.emitDocumentStatusUpdate(event.documentId, 'paused');
        } else if (event.type === 'document.progress') {
          if (!isDocumentProgressStage(event.stage)) return;
          this.emitDocumentStatusUpdate(event.documentId, 'processing', {
            progressStage: event.stage,
            progressDone: event.done ?? 0,
            progressTotal: event.total ?? 0,
          });
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
    data: { query: string; conversationId?: string; userId?: string },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const query = data.query?.trim();
    if (!query) return;

    const conversationId = data.conversationId?.trim() || randomUUID();
    const interruptKey = `${client.id}:${conversationId}`;

    const abortController = new AbortController();
    this.abortControllers.set(interruptKey, abortController);
    this.inflightQueries.set(interruptKey, { conversationId, query });

    try {
      const ragResult = await this.ragService.streamSearch(
        { query, userId: data.userId },
        (token) => {
          if (abortController.signal.aborted) return;
          client.emit('chat:token', { token, conversationId });
        },
        abortController.signal,
      );

      if (abortController.signal.aborted) {
        return;
      }

      this.inflightQueries.delete(interruptKey);
      await this.persistTurn(
        conversationId,
        query,
        ragResult.answer,
        ragResult.sources,
      );

      client.emit('chat:complete', {
        conversationId,
        sources: ragResult.sources,
        cacheHit: ragResult.cacheHit ?? false,
      });
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }

      this.logger.error(`Chat query failed: ${(error as Error).message}`);

      const errorMessage =
        error instanceof HttpException
          ? error.message
          : 'Sorry, I encountered an error processing your request.';

      this.inflightQueries.delete(interruptKey);
      await this.persistTurn(conversationId, query, errorMessage, []);

      client.emit('chat:token', { token: errorMessage, conversationId });
      client.emit('chat:complete', {
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

    const interruptKey = `${client.id}:${conversationId}`;
    this.abortControllers.get(interruptKey)?.abort();

    const inflight = this.inflightQueries.get(interruptKey);
    if (!inflight) return;
    this.inflightQueries.delete(interruptKey);

    await this.persistTurn(
      inflight.conversationId,
      inflight.query,
      '(interrupted)',
      [],
    );

    client.emit('chat:complete', {
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
    this.logger.log(`Client subscribed to doc:${documentId}`);
  }

  emitDocumentStatusUpdate(
    documentId: string,
    status: DocumentStatus,
    progress?: Pick<
      DocumentStatusUpdate,
      'progressStage' | 'progressDone' | 'progressTotal'
    >,
  ): void {
    const payload: DocumentStatusUpdate = {
      documentId,
      status,
      timestamp: new Date().toISOString(),
      ...progress,
    };

    this.server.to(`doc:${documentId}`).emit('document:status-update', payload);
    if (status !== 'processing') {
      this.logger.log(`Emitted status "${status}" for doc:${documentId}`);
    }
  }

  private async persistTurn(
    conversationId: string,
    query: string,
    answer: string,
    sources: Source[],
  ): Promise<void> {
    try {
      await this.conversations.persistTurn(
        conversationId,
        query,
        answer,
        sources,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to persist chat turn: ${(err as Error).message}`,
      );
    }
  }
}
