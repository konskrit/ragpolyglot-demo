import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { Config } from './config';
import { loadSql } from './load-sql';

@Injectable()
export class PostgresService implements OnModuleDestroy {
  private readonly logger = new Logger(PostgresService.name);
  private readonly pool: Pool;
  private ready = false;

  constructor() {
    this.pool = new Pool({
      connectionString: Config.databaseUrl,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 3_000,
    });
    this.pool.on('error', (err) => {
      this.ready = false;
      this.logger.warn(`Postgres pool error: ${err.message}`);
    });
  }

  async connect(): Promise<void> {
    try {
      await this.pool.query('SELECT 1');
      await this.pool.query(loadSql('conversations-schema.sql'));
      this.ready = true;
      this.logger.log('Connected to PostgreSQL');
    } catch (err) {
      this.ready = false;
      this.logger.warn(`Postgres unavailable: ${(err as Error).message}`);
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  async query<T extends Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]> {
    if (!this.ready) return [];
    try {
      const res = await this.pool.query(text, params);
      return res.rows as T[];
    } catch (err) {
      this.logger.warn(`Postgres query failed: ${(err as Error).message}`);
      return [];
    }
  }

  async exec<T extends Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]> {
    if (!this.ready) {
      throw new Error('Postgres is unavailable');
    }
    const res = await this.pool.query(text, params);
    return res.rows as T[];
  }

  async runInTransaction(
    statements: Array<{ text: string; params?: unknown[] }>,
  ): Promise<void> {
    if (!this.ready) {
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
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end().catch(() => undefined);
  }
}
