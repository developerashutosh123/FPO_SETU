// Per-test-file throwaway database on the local test Postgres (make test-db). Never touches Supabase.
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { randomBytes } from 'node:crypto';
import { createDb, type DbHandle } from '../../src/db/client.js';

const ADMIN_URL = process.env.TEST_PG_ADMIN_URL ?? 'postgres://test:test@127.0.0.1:54329/postgres';

export async function createTestDb(): Promise<DbHandle & { url: string; drop(): Promise<void> }> {
  const name = `t_${randomBytes(5).toString('hex')}`;
  const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const url = ADMIN_URL.replace(/\/postgres$/, `/${name}`);
  const mig = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(drizzle(mig), { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname });
  await mig.end();
  const h = createDb(url, { max: 4 });
  return { ...h, url, async drop() { await h.close(); await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); await admin.end(); } };
}
