import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import amqp, { ChannelModel, Channel, ConsumeMessage } from 'amqplib';
import { Config } from './config';

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private channelModel: ChannelModel | null = null;
  private channel: Channel | null = null;
  private loopRunning = false;
  private shuttingDown = false;
  private readyWaiters: Array<() => void> = [];

  onModuleInit(): void {
    this.start();
  }

  start(): void {
    this.connectLoop();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  private async disconnect(): Promise<void> {
    this.shuttingDown = true;
    if (this.channel) {
      await this.channel.close().catch(() => undefined);
      this.channel = null;
    }
    if (this.channelModel) {
      await this.channelModel.close().catch(() => undefined);
      this.channelModel = null;
    }
  }

  private connectLoop(): void {
    if (this.loopRunning || this.shuttingDown) return;
    this.loopRunning = true;

    const attempt = async (): Promise<void> => {
      let backoff = INITIAL_BACKOFF_MS;

      while (!this.shuttingDown) {
        try {
          await this.connect();
          this.logger.log('Connected to RabbitMQ');
          this.resolveReadyWaiters();
          return;
        } catch (error) {
          this.logger.warn(
            `RabbitMQ connection failed (${(error as Error).message}). Retrying in ${backoff}ms...`,
          );
          await new Promise((r) => setTimeout(r, backoff));
          backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
        }
      }

      this.loopRunning = false;
    };

    void attempt();
  }

  private async connect(): Promise<void> {
    const model = await amqp.connect(Config.rabbitmqUrl);

    try {
      const channel = await model.createChannel();

      await channel.assertExchange(Config.documentEventsExchange, 'topic', {
        durable: true,
      });

      await channel.assertQueue(Config.gatewayStatusQueue, { durable: true });
      await channel.bindQueue(
        Config.gatewayStatusQueue,
        Config.documentEventsExchange,
        'document.processed',
      );
      await channel.bindQueue(
        Config.gatewayStatusQueue,
        Config.documentEventsExchange,
        'document.failed',
      );

      this.channelModel = model;
      this.channel = channel;

      model.on('close', () => {
        if (this.shuttingDown) return;
        this.logger.warn(
          'RabbitMQ connection closed. Attempting to reconnect...',
        );
        this.channelModel = null;
        this.channel = null;
        this.loopRunning = false;
        this.connectLoop();
      });

      model.on('error', (err) => {
        this.logger.warn(`RabbitMQ connection error: ${err.message}`);
      });
    } catch (err) {
      await model.close().catch((closeErr: Error) => {
        this.logger.warn(`Failed to close RabbitMQ model: ${closeErr.message}`);
      });
      throw err;
    }
  }

  private resolveReadyWaiters(): void {
    const waiters = this.readyWaiters;
    this.readyWaiters = [];
    for (const resolve of waiters) {
      resolve();
    }
  }

  private waitUntilReady(timeoutMs = 60_000): Promise<void> {
    if (this.channel) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.readyWaiters = this.readyWaiters.filter((w) => w !== onReady);
        reject(new Error('Timed out waiting for RabbitMQ'));
      }, timeoutMs);

      const onReady = () => {
        clearTimeout(timer);
        resolve();
      };
      this.readyWaiters.push(onReady);
    });
  }

  consumeWhenReady(
    queueName: string,
    handler: (msg: ConsumeMessage | null) => void | Promise<void>,
  ): void {
    const attemptConsume = async (attempt: number): Promise<void> => {
      try {
        await this.waitUntilReady();
        await this.consume(queueName, handler);
        this.logger.log(`Consuming from queue "${queueName}"`);
      } catch (error) {
        if (this.shuttingDown) return;
        const backoff = Math.min(
          INITIAL_BACKOFF_MS * 2 ** attempt,
          MAX_BACKOFF_MS,
        );
        this.logger.warn(
          `Could not consume from "${queueName}" (${(error as Error).message}). Retrying in ${backoff}ms...`,
        );
        setTimeout(() => void attemptConsume(attempt + 1), backoff);
      }
    };

    void attemptConsume(0);
  }

  async consume(
    queueName: string,
    handler: (msg: ConsumeMessage | null) => void | Promise<void>,
  ): Promise<void> {
    const channel = this.ensureConnected();
    await channel.consume(
      queueName,
      (msg) => {
        void Promise.resolve(handler(msg)).catch((err) => {
          this.logger.error(
            `Consumer handler failed: ${(err as Error).message}`,
          );
        });
      },
      { noAck: true },
    );
  }

  private ensureConnected(): Channel {
    if (this.channel && this.channelModel) {
      return this.channel;
    }
    throw new Error('RabbitMQ connection unavailable');
  }

  isConnected(): boolean {
    return this.channel !== null && this.channelModel !== null;
  }
}
