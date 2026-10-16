// Applies the SQL migrations in ./drizzle to DIRECT_URL (falls back to DATABASE_URL). Run once per database: pnpm db:migrate
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) { console.error('Set DIRECT_URL (preferred) or DATABASE_URL in .env'); process.exit(1); }
const host = new URL(url).host;
console.log(`applying migrations to ${host}`);
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
await migrate(drizzle(sql), { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });
await sql.end();
console.log('migrations applied');
