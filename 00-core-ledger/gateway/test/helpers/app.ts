// An in-process gateway over a throwaway database and a ledger stub that must never be reached by read endpoints.
import { randomBytes } from 'node:crypto';
import type { Server } from '../../src/server.js';
import { createServer } from '../../src/server.js';
import { loadConfig } from '../../src/config.js';
import { loadRates } from '../../src/services/rates.js';
import { signSession } from '../../src/auth/jwt.js';
import { PERSONAS, sessionUserOf } from '../../src/auth/personas.js';
import type { Ledger } from '../../src/fabric/ledger.js';
import { createTestDb } from './db.js';

export class StubLedger implements Ledger {
  readonly mode = 'live' as const;
  calls: string[] = [];
  answers: Record<string, string> = {};
  private no(what: string): never { this.calls.push(what); throw new Error(`stub ledger: ${what} was called`); }
  submitImpl?: (fn: string, args: string[]) => Promise<{ receipt: import('../../src/contract/contract.js').LedgerReceipt; result: string }>;
  async submit(_u: unknown, ch: string, cc: string, fn: string, args: string[]): Promise<{ receipt: import('../../src/contract/contract.js').LedgerReceipt; result: string }> { if (this.submitImpl) { this.calls.push(`submit ${ch}/${cc}.${fn}`); return this.submitImpl(fn, args); } return this.no(`submit ${ch}/${cc}.${fn}`); }
  async evaluate(_u: unknown, ch: string, cc: string, fn: string, args: string[]): Promise<string> { const k = `${cc}.${fn}`; if (k in this.answers) return this.answers[k]!; return this.no(`evaluate ${ch}/${k}(${args.join(',')})`); }
  async chainHeight(): Promise<number> { return 10; }
  async getBlock(): Promise<never> { return this.no('getBlock'); }
  async getTransaction(): Promise<never> { return this.no('getTransaction'); }
  async getBlockByTxId(): Promise<never> { return this.no('getBlockByTxId'); }
  async *blocks(): AsyncIterable<never> { /* none */ }
  async peerStatus() { return [] as { org: 'FpoOrgMSP'; name: string; up: boolean }[]; }
  close() { /* nothing */ }
}

export async function testServer(opts: { ratesFile?: string; ledger?: Ledger } = {}) {
  const tdb = await createTestDb();
  const hex = () => randomBytes(32).toString('hex');
  const cfg = loadConfig({ DATABASE_URL: tdb.url, JWT_SECRET: hex(), FARMER_TOKEN_SECRET: hex(), PRICE_SALT_SECRET: hex(), LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);
  const ledger = (opts.ledger ?? new StubLedger()) as StubLedger;
  const server: Server = await createServer({ cfg, dbh: tdb, ledger, rates: loadRates(opts.ratesFile ?? 'test/e2e-rates.json'), logger: false, rateLimitMax: 1_000_000 });
  const token = async (username: string) => { const p = PERSONAS.find((x) => x.username === username)!; return signSession(cfg.JWT_SECRET, sessionUserOf(p, p.portals[0]!)); };
  return { server, tdb, ledger, cfg, token, async close() { await server.stop(); await tdb.drop(); } };
}
