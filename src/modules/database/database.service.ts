import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type PoolClient, type QueryResult } from 'pg';

export type DatabaseRow = Record<string, unknown>;

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool | null;

  constructor(private readonly configService: ConfigService) {
    const connectionString = this.configService.get<string>('DATABASE_URL');

    this.pool = connectionString
      ? new Pool({
          connectionString,
        })
      : null;

    if (this.pool) {
      this.logger.log('PostgreSQL mode enabled');
    } else {
      this.logger.warn(
        'DATABASE_URL is not set, falling back to in-memory mode',
      );
    }
  }

  isEnabled(): boolean {
    return this.pool !== null;
  }

  async query(
    text: string,
    values: ReadonlyArray<unknown> = [],
  ): Promise<QueryResult<DatabaseRow>> {
    if (!this.pool) {
      throw new Error('Database is not configured');
    }

    return this.pool.query<DatabaseRow>(text, [...values]);
  }

  async withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (!this.pool) {
      throw new Error('Database is not configured');
    }

    const client = await this.pool.connect();

    try {
      await client.query('begin');
      const result = await callback(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async healthcheck(): Promise<boolean> {
    if (!this.pool) {
      return false;
    }

    try {
      await this.pool.query('select 1');
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }
}
