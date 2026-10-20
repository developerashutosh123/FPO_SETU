// One Fastify app per warm serverless instance, built on first use. It is the gateway's own app (src/gateway/app.ts) with an
// IndexLedger: same routes, same role filtering, same JSON, but every read comes from Postgres and every write is refused.
import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { createAdapters } from './gateway/adapters/index';
import { buildApp } from './gateway/app';
import { loadConfig, type Config } from './gateway/config';
import type { Ctx } from './gateway/context';
import { createDb, type DbHandle } from './gateway/db/client';
import { IndexLedger } from './gateway/fabric/index-ledger';
import { EventBus } from './gateway/indexer/bus';
import { routeSets } from './gateway/routes/index';
import type { Rates } from './gateway/services/rates';
import ratesJson from './gateway/rates.json';

export interface ReadApi { app: FastifyInstance; ctx: Ctx; cfg: Config; dbh: DbHandle }

/** The gateway's config wants two secrets that only writes use; derive them so the read-only API needs just DATABASE_URL and JWT_SECRET. */
export function readApiConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const jwt = env.JWT_SECRET ?? '';
  const derive = (label: string) => createHmac('sha256', jwt).update(`read-api:${label}`).digest('hex');
  return loadConfig({ DB_POOL_MAX: '3', LOG_LEVEL: 'silent', ...env, FARMER_TOKEN_SECRET: derive('farmer'), PRICE_SALT_SECRET: derive('price') } as NodeJS.ProcessEnv);
}

export async function createReadApi(env: NodeJS.ProcessEnv = process.env, dbh?: DbHandle): Promise<ReadApi> {
  const cfg = readApiConfig(env);
  const handle = dbh ?? createDb(cfg.DATABASE_URL, { max: cfg.DB_POOL_MAX });
  const ctx: Ctx = {
    cfg, db: handle.db, ledger: new IndexLedger(handle.db), adapters: createAdapters(handle.db, {}),
    bus: new EventBus(), indexer: { settled: async () => undefined }, now: () => new Date(),
  };
  const app = await buildApp({ ctx, logger: false, extraHandlers: routeSets(ratesJson as unknown as Rates) });
  await app.ready();
  return { app, ctx, cfg, dbh: handle };
}

let instance: Promise<ReadApi> | undefined;
export const getReadApi = () => (instance ??= createReadApi().catch((e) => { instance = undefined; throw e; }));
