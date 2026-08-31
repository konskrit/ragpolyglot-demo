import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { Config } from './config';
import { loadSql } from './load-sql';

const CONNECT_ATTEMPTS = 10;
const CONNECT_RETRY_MS = 1000;

@Injectable()
export class PostgresService implements OnModuleDestroy {
  private readonly logger = new Logger(PostgresService.name);
  private readonly pool: Pool;
  private ready = false;
  private connecting: Promise<boolean> | null = null;

  constructor() {
    this.pool = new Pool({
      connectionString: Config.databaseUrl,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 3_000,
    });
    this.pool.on('error', (err) => {
      this.logger.warn(`Postgres pool error: ${err.message}`);
    });
  }

  async connect(): Promise<void> {
    for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt++) {
      if (await this.tryConnect()) return;
      if (attempt < CONNECT_ATTEMPTS) {
        this.logger.warn(
          `Postgres connect attempt ${attempt}/${CONNECT_ATTEMPTS} failed; retrying`,
        );
        await sleep(CONNECT_RETRY_MS * attempt);
      }
    }
    this.logger.warn(
      'Postgres unavailable after retries; chat history will stay off until reconnect',
    );
  }

  async ensureReady(): Promise<boolean> {
    if (this.ready) return true;
    if (!this.connecting) {
      this.connecting = this.tryConnect().finally(() => {
        this.connecting = null;
      });
    }
    return this.connecting;
  }

  isReady(): boolean {
    return this.ready;
  }

  async query<T extends Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]> {
    if (!(await this.ensureReady())) return [];
    try {
      const res = await this.pool.query(text, params);
      return res.rows as T[];
    } catch (err) {
      this.ready = false;
      this.logger.warn(`Postgres query failed: ${(err as Error).message}`);
      return [];
    }
  }

  async exec<T extends Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]> {
    if (!(await this.ensureReady())) {
      throw new Error('Postgres is unavailable');
    }
    try {
      const res = await this.pool.query(text, params);
      return res.rows as T[];
    } catch (err) {
      this.ready = false;
      throw err;
    }
  }

  async runInTransaction(
    statements: Array<{ text: string; params?: unknown[] }>,
  ): Promise<void> {
    if (!(await this.ensureReady())) {
      throw new Error('Postgres is unavailable');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const statement of statements) {
        await client.query(statement.text, statement.params);
      }
      await client.query('COMMIT');
    } catch (err) {
      this.ready = false;
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end().catch(() => undefined);
  }

  private async tryConnect(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      await this.pool.query(loadSql('conversations-schema.sql'));
      this.ready = true;
      this.logger.log('Connected to PostgreSQL');
      return true;
    } catch (err) {
      this.ready = false;
      this.logger.warn(`Postgres unavailable: ${(err as Error).message}`);
      return false;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
