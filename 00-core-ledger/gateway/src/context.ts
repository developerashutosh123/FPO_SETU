import type { Adapters } from './adapters/index.js';
import type { Config } from './config.js';
import type { Db } from './db/client.js';
import type { Ledger } from './fabric/ledger.js';
import type { EventBus } from './indexer/bus.js';
import type { SessionUser } from './contract/contract.js';

/** Settles when the indexer has processed the block that holds `txId`, so a read right after a write sees it. No-op without an indexer. */
export interface IndexerPort { settled(channel: string, blockNumber: number, timeoutMs?: number): Promise<void> }

export interface Ctx {
  cfg: Config;
  db: Db;
  ledger: Ledger;
  adapters: Adapters;
  bus: EventBus;
  indexer: IndexerPort;
  now: () => Date;
}

declare module 'fastify' {
  interface FastifyRequest { user?: SessionUser; startedAt: number }
  interface FastifyInstance { ctx: Ctx }
}
