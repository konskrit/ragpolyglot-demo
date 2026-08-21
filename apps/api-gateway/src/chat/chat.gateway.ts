import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Config } from '../core/config';
import { RabbitMQService } from '../core/rabbitmq.service';
import { RagService } from '../rag/rag.service';

@Injectable()
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/ws',
})
export class ChatGateway implements OnModuleInit {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ChatGateway.name);
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
    const { query, conversationId = 'default', userId } = data;
    if (!query?.trim()) return;

    this.interrupted.delete(conversationId);

    try {
      const ragResult = await this.ragService.search({ query, userId });
      const answer = ragResult.answer;
      const words = answer.split(/(?<=\s)/);

      for (const token of words) {
        if (this.interrupted.has(conversationId)) {
          client.emit('chat:complete', {
            conversationId,
            sources: ragResult.sources,
            interrupted: true,
          });
          this.interrupted.delete(conversationId);
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
        'Sorry, I encountered an error processing your request.';
      for (const token of errorMessage.split(/(?<=\s)/)) {
        if (this.interrupted.has(conversationId)) break;
        client.emit('chat:token', { token, conversationId });
        await new Promise((r) => setTimeout(r, Config.chatTokenIntervalMs));
      }

      client.emit('chat:complete', {
        conversationId,
        sources: [],
        error: true,
        interrupted: this.interrupted.has(conversationId),
      });
      this.interrupted.delete(conversationId);
    }
  }

  @SubscribeMessage('chat:interrupt')
  handleInterrupt(
    @MessageBody() data: { conversationId?: string },
  ): void {
    const conversationId = data.conversationId || 'default';
    this.interrupted.add(conversationId);
    this.logger.log(`Chat interrupted conversationId=${conversationId}`);
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
    this.server.emit('document:status-update', payload);
    this.logger.log(`Broadcasted status "${status}" for doc:${documentId}`);
  }
}
