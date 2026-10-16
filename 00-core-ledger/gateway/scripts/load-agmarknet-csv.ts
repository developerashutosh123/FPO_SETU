// Loads AGMARKNET history CSVs into price_series. Usage: pnpm load:csv data/agmarknet/potato.csv [more.csv] [--commodity Potato]
// Prices are stored exactly as published. Nothing is filled in or smoothed.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createDb } from '../src/db/client.js';
import { parsePriceCsv } from '../src/adapters/agmarknet-csv.js';
import { createAdapters } from '../src/adapters/index.js';

const args = process.argv.slice(2);
const ci = args.indexOf('--commodity');
const commodity = ci >= 0 ? args.splice(ci, 2)[1] : undefined;
const files = args.filter((a) => !a.startsWith('--'));
const url = process.env.DATABASE_URL;
if (!url || files.length === 0) { console.error('Usage: pnpm load:csv <file.csv> [...] [--commodity Potato]   (needs DATABASE_URL in .env)'); process.exit(1); }
const dbh = createDb(url, { max: 2 });
const adapters = createAdapters(dbh.db);
let total = 0;
for (const f of files) {
  const r = parsePriceCsv(readFileSync(f, 'utf8'), basename(f), { commodity });
  if (r.missingColumns.length) { console.error(`${f}: missing columns ${r.missingColumns.join(', ')}. Found a different layout; nothing loaded from this file.`); continue; }
  const stored = await adapters.agmarknet.store(r.rows);
  total += stored;
  console.log(`${f}: ${r.read} rows read, ${stored} stored, dropped ${JSON.stringify(r.dropped)}`);
}
console.log(`done: ${total} price rows stored`);
await dbh.close();
