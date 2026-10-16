// Fetches today's published mandi prices for the tracked markets and appends them to price_series. Safe to run any number of times a day.
import { createDb } from '../src/db/client.js';
import { createAdapters } from '../src/adapters/index.js';
import { loadConfig } from '../src/config.js';
import { sql } from 'drizzle-orm';

const cfg = loadConfig();
const dbh = createDb(cfg.DATABASE_URL, { max: 2 });
const a = createAdapters(dbh.db, { dataGovInApiKey: cfg.DATAGOVIN_API_KEY });
const r = await a.agmarknet.snapshot();
console.log(`data.gov.in returned ${r.fetched} records for West Bengal; ${r.stored} rows for tracked markets and commodities were offered to price_series (existing days are kept)`);
const rows = await dbh.db.execute(sql`select date::text as date, market, commodity, min_price, max_price, modal_price from price_series order by date desc, market, commodity`);
console.table(rows as unknown as object[]);
await dbh.close();
