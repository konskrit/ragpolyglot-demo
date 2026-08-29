import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import amqp, { ChannelModel, Channel, ConsumeMessage } from 'amqplib';
import { ConsumerRegistration } from '@ragpolyglot-shared';
import { Config } from './config';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private channelModel: ChannelModel | null = null;
  private channel: Channel | null = null;
  private loopRunning = false;
  private shuttingDown = false;
  private readonly consumers: ConsumerRegistration<ConsumeMessage>[] = [];

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
      let waiting = false;

      while (!this.shuttingDown) {
        try {
          await this.connect();
          this.logger.log('Connected to RabbitMQ');
          await this.bindAllConsumers();
          return;
        } catch (error) {
          if (!waiting) {
            waiting = true;
            this.logger.warn(
              `Waiting for RabbitMQ (${(error as Error).message})`,
            );
          }
          await new Promise((r) => setTimeout(r, 2000));
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
      await channel.bindQueue(
        Config.gatewayStatusQueue,
        Config.documentEventsExchange,
        'document.progress',
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

  private async bindAllConsumers(): Promise<void> {
    for (const { queueName, handler } of this.consumers) {
      await this.consume(queueName, handler);
      this.logger.log(`Consuming from queue "${queueName}"`);
    }
  }

  consumeWhenReady(
    queueName: string,
    handler: (msg: ConsumeMessage | null) => void | Promise<void>,
  ): void {
    this.consumers.push({ queueName, handler });

    // Already connected (e.g. late registration): bind once. Otherwise
    // connectLoop → bindAllConsumers handles first bind and reconnects.
    if (!this.channel) return;

    void this.consume(queueName, handler)
      .then(() => this.logger.log(`Consuming from queue "${queueName}"`))
      .catch((error: Error) => {
        this.logger.warn(
          `Could not consume from "${queueName}" (${error.message})`,
        );
      });
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
