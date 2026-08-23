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
import { randomUUID } from 'crypto';

@Injectable()
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/ws',
})
export class ChatGateway implements OnModuleInit {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ChatGateway.name);
  /** Keyed by `${socketId}:${conversationId}` so clients cannot interrupt each other. */
  private readonly interrupted = new Set<string>();

  constructor(
    private readonly rabbitMQ: RabbitMQService,
    private readonly ragService: RagService,
  ) {}

  onModuleInit(): void {
    this.rabbitMQ.consumeWhenReady(Config.gatewayStatusQueue, (msg) => {
      if (!msg?.content) return;

      try {
        const event = JSON.parse(msg.content.toString()) as {
          type?: string;
          documentId?: string;
        };

        if (!event.documentId) return;

        if (event.type === 'document.processed') {
          this.emitDocumentStatusUpdate(event.documentId, 'ready');
        } else if (event.type === 'document.failed') {
          this.emitDocumentStatusUpdate(event.documentId, 'failed');
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
    this.interrupted.delete(interruptKey);

    try {
      const ragResult = await this.ragService.search({
        query,
        userId: data.userId,
      });
      const answer = ragResult.answer;
      const words = answer.split(/(?<=\s)/);

      for (const token of words) {
        if (this.interrupted.has(interruptKey)) {
          client.emit('chat:complete', {
            conversationId,
            sources: ragResult.sources,
            interrupted: true,
          });
          this.interrupted.delete(interruptKey);
          return;
        }

        client.emit('chat:token', { token, conversationId });
        await new Promise((r) => setTimeout(r, Config.chatTokenIntervalMs));
      }

      client.emit('chat:complete', {
        conversationId,
        sources: ragResult.sources,
        cacheHit: ragResult.cacheHit ?? false,
      });
    } catch (error) {
      this.logger.error(`Chat query failed: ${(error as Error).message}`);

      const errorMessage =
        error instanceof HttpException
          ? String(error.message)
          : 'Sorry, I encountered an error processing your request.';
      for (const token of errorMessage.split(/(?<=\s)/)) {
        if (this.interrupted.has(interruptKey)) break;
        client.emit('chat:token', { token, conversationId });
        await new Promise((r) => setTimeout(r, Config.chatTokenIntervalMs));
      }

      client.emit('chat:complete', {
        conversationId,
        sources: [],
        error: true,
        interrupted: this.interrupted.has(interruptKey),
      });
      this.interrupted.delete(interruptKey);
    }
  }

  @SubscribeMessage('chat:interrupt')
  handleInterrupt(
    @MessageBody() data: { conversationId?: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const conversationId = data.conversationId?.trim();
    if (!conversationId) return;
    this.interrupted.add(`${client.id}:${conversationId}`);
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

  emitDocumentStatusUpdate(documentId: string, status: string): void {
    const payload = {
      documentId,
      status,
      timestamp: new Date().toISOString(),
    };

    this.server.to(`doc:${documentId}`).emit('document:status-update', payload);
    this.logger.log(`Emitted status "${status}" for doc:${documentId}`);
  }
}
