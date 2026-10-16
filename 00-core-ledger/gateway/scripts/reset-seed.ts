// Clears ONLY what the seed creates (members, lots, orders, index, telemetry, counters) so the seed can run again on a fresh ledger.
// Keeps price_series, msp_entries and the migration history. Refuses without --yes. Run `make rebuild` first so the ledger is fresh too.
import { createDb } from '../src/db/client.js';
import { loadConfig } from '../src/config.js';
import { sql } from 'drizzle-orm';

if (!process.argv.includes('--yes')) { console.error('This deletes all seeded members, lots, orders and the index from the database in DATABASE_URL. Re-run with --yes.'); process.exit(1); }
const cfg = loadConfig();
const dbh = createDb(cfg.DATABASE_URL, { max: 1 });
const keep = new Set(['price_series', 'msp_entries']);
const tables = ((await dbh.db.execute(sql`select tablename from pg_tables where schemaname = 'public'`)) as unknown as { tablename: string }[]).map((t) => t.tablename).filter((t) => !keep.has(t));
await dbh.db.execute(sql.raw(`truncate table ${tables.map((t) => `"${t}"`).join(', ')} restart identity cascade`));
console.log(`cleared ${tables.length} tables (kept ${[...keep].join(', ')}):`, tables.join(', '));
await dbh.close();
