import type { FastifyInstance } from 'fastify';
import { createAdapters } from './adapters/index.js';
import { buildApp } from './app.js';
import { loadConfig, type Config } from './config.js';
import type { Ctx } from './context.js';
import { createDb, type DbHandle } from './db/client.js';
import { FabricLedger } from './fabric/client.js';
import type { Ledger } from './fabric/ledger.js';
import { EventBus } from './indexer/bus.js';
import { Indexer } from './indexer/indexer.js';
import { analyticsRoutes } from './routes/analytics.js';
import { farmersRoutes } from './routes/farmers.js';
import { financeRoutes } from './routes/finance.js';
import { lotsRoutes } from './routes/lots.js';
import { patronageRoutes } from './routes/patronage.js';
import { publicRoutes } from './routes/public.js';
import { tradeRoutes } from './routes/trade.js';
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
  const dbh = opts.dbh ?? createDb(cfg.DATABASE_URL);
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
    extraHandlers: (c) => [farmersRoutes(c), lotsRoutes(c), financeRoutes(c, rates), tradeRoutes(c), patronageRoutes(c, rates), analyticsRoutes(c), publicRoutes(c)] as never,
  });
  let timer: NodeJS.Timeout | undefined;
  if (opts.startIndexer) indexer.start();
  if (opts.startWorkers) timer = setInterval(() => { drainMirrorQueue(ctx, app.log).catch((e) => app.log.warn({ err: String(e) }, 'mirror worker')); }, 5000);
  return { app, ctx, indexer, rates, dbh, async stop() { if (timer) clearInterval(timer); await indexer.stop(); await app.close(); ledger.close(); if (!opts.dbh) await dbh.close(); } };
}

export { ensureDevicesRegistered };
