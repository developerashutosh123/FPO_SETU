import type { FastifyInstance } from 'fastify';
import { createAdapters } from './adapters/index.js';
import { buildApp } from './app.js';
import { registerDocs } from './docs.js';
import { loadConfig, type Config } from './config.js';
import type { Ctx } from './context.js';
import { createDb, type DbHandle } from './db/client.js';
import { FabricLedger } from './fabric/client.js';
import type { Ledger } from './fabric/ledger.js';
import { EventBus } from './indexer/bus.js';
import { Indexer } from './indexer/indexer.js';
import { routeSets } from './routes/index.js';
import { drainMirrorQueue } from './services/chain.js';
import { loadRates, type Rates } from './services/rates.js';
import { ensureDevicesRegistered, ensureMsp } from './services/startup.js';

export interface Server {
  app: FastifyInstance; ctx: Ctx; indexer: Indexer; rates: Rates; dbh: DbHandle;
  stop(): Promise<void>;
}

export interface ServerOptions { cfg?: Config; ledger?: Ledger; dbh?: DbHandle; rates?: Rates; startIndexer?: boolean; startWorkers?: boolean; logger?: boolean | object; rateLimitMax?: number }

/** Wires the gateway: database, Fabric client, adapters, indexer, mirror worker and the HTTP app. */
export async function createServer(opts: ServerOptions = {}): Promise<Server> {
  const cfg = opts.cfg ?? loadConfig();
  const dbh = opts.dbh ?? createDb(cfg.DATABASE_URL, { max: cfg.DB_POOL_MAX });
  const ledger = opts.ledger ?? new FabricLedger(cfg);
  const bus = new EventBus();
  const rates = opts.rates ?? loadRates();
  const adapters = createAdapters(dbh.db, { dataGovInApiKey: cfg.DATAGOVIN_API_KEY });
  const ctx: Ctx = { cfg, db: dbh.db, ledger, adapters, bus, indexer: { settled: async () => undefined }, now: () => new Date() };
  const indexer = new Indexer(ctx, { info: () => undefined, warn: (...a) => app.log.warn(a[0] as object, String(a[1] ?? '')), error: (...a) => app.log.error(a[0] as object, String(a[1] ?? '')) });
  ctx.indexer = indexer;
  await ensureMsp(dbh.db);
  const app = await buildApp({
    ctx, logger: opts.logger, rateLimitMax: opts.rateLimitMax,
    extraHandlers: routeSets(rates),
  });
  await registerDocs(app);
  let timer: NodeJS.Timeout | undefined;
  if (opts.startIndexer) indexer.start();
  if (opts.startWorkers) timer = setInterval(() => { drainMirrorQueue(ctx, app.log).catch((e) => app.log.warn({ err: String(e) }, 'mirror worker')); }, 5000);
  let priceTimer: NodeJS.Timeout | undefined;
  if (opts.startWorkers && adapters.agmarknet.configured) {
    const snap = () => adapters.agmarknet.snapshot().then((r) => app.log.info(r, 'AGMARKNET snapshot')).catch((e) => app.log.warn({ err: String(e) }, 'AGMARKNET snapshot failed'));
    void snap(); priceTimer = setInterval(snap, 6 * 3600_000); // the API serves the current day only: history is what this job has collected
  }
  return { app, ctx, indexer, rates, dbh, async stop() { if (timer) clearInterval(timer); if (priceTimer) clearInterval(priceTimer); await indexer.stop(); await app.close(); ledger.close(); if (!opts.dbh) await dbh.close(); } };
}

export { ensureDevicesRegistered };
