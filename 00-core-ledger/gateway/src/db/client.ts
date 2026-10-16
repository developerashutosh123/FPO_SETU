import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export type Db = PostgresJsDatabase<typeof schema>;
export interface DbHandle { db: Db; sql: postgres.Sql; close(): Promise<void> }

/**
 * Supabase serves DATABASE_URL through a transaction pooler (pgbouncer), which does not support prepared statements: prepare:false.
 * Works unchanged against a plain Postgres.
 */
export function createDb(url: string, opts: { max?: number } = {}): DbHandle {
  const sql = postgres(url, { max: opts.max ?? 10, prepare: false, idle_timeout: 20, connect_timeout: 15, onnotice: () => {} });
  return { db: drizzle(sql, { schema }), sql, close: () => sql.end({ timeout: 5 }) };
}
export { schema };
