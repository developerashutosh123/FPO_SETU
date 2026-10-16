// Helpers every write route uses: submit and wait for the index, per-key locks, and the follow-up ("mirror") calls of DECISIONS D5.
import { and, asc, eq, lt } from 'drizzle-orm';
import type { Channel, OrgMsp } from '../contract/contract.js';
import type { Ctx } from '../context.js';
import { mirrorQueue } from '../db/schema.js';
import { HttpError } from '../errors.js';
import type { FabricUser } from '../fabric/identities.js';
import type { SubmitResult } from '../fabric/ledger.js';
import { ENDORSE, type ChaincodeName } from '../fabric/topology.js';
import { SERVICE_IDENTITY, personaByUsername } from '../auth/personas.js';

export async function submit(ctx: Ctx, who: FabricUser, channel: Channel, chaincode: ChaincodeName, fn: string, args: string[], endorse: OrgMsp[][], transient?: Record<string, string>): Promise<SubmitResult> {
  const r = await ctx.ledger.submit(who, channel, chaincode, fn, args, { endorse, transient });
  await ctx.indexer.settled(channel, r.receipt.blockNumber);
  return r;
}

// ---------------------------------------------------------------- per-key mutex: two writes to the same lot or order must not overlap (MVCC conflicts)
const tails = new Map<string, Promise<unknown>>();
export async function withLock<T>(keys: string | string[], fn: () => Promise<T>): Promise<T> {
  const list = [...new Set(Array.isArray(keys) ? keys : [keys])].sort();
  const prev = list.map((k) => tails.get(k) ?? Promise.resolve());
  let release!: () => void;
  const mine = new Promise<void>((r) => { release = r; });
  list.forEach((k) => tails.set(k, mine));
  try { await Promise.allSettled(prev); return await fn(); } finally { release(); for (const k of list) if (tails.get(k) === mine) tails.delete(k); }
}

// ---------------------------------------------------------------- status mirrors
export type MirrorKind = 'SetInStorage' | 'SetPledged' | 'SetListed' | 'SetSold' | 'SetSettled' | 'RecordQualityOutcome';
const WHO: Record<MirrorKind, string> = { SetInStorage: SERVICE_IDENTITY.warehouse, SetPledged: SERVICE_IDENTITY.warehouse, SetListed: SERVICE_IDENTITY.ceo, SetSold: SERVICE_IDENTITY.ceo, SetSettled: SERVICE_IDENTITY.ceo, RecordQualityOutcome: 'rahul.buyer' };
const SET: Record<MirrorKind, 'trace' | 'traceWithBuyer'> = { SetInStorage: 'trace', SetPledged: 'trace', SetListed: 'trace', SetSold: 'trace', SetSettled: 'trace', RecordQualityOutcome: 'traceWithBuyer' };

export const mirrorUser = (kind: MirrorKind): FabricUser => ({ username: WHO[kind], msp: personaByUsername(WHO[kind])!.org });

async function runMirror(ctx: Ctx, kind: MirrorKind, args: string[]): Promise<SubmitResult> {
  return submit(ctx, mirrorUser(kind), 'trace-channel', 'lot-lifecycle', kind, args, ENDORSE[SET[kind]]);
}

/**
 * Submits the follow-up lot-lifecycle call. If it fails it is queued for retry and counted in the returned `pending`, never dropped:
 * the primary transaction has already committed, so the caller still answers with its receipt and adds the X-Mirror-Pending header.
 */
export async function mirror(ctx: Ctx, kind: MirrorKind, sscc: string, args: string[], cause: string): Promise<{ pending: boolean; result?: SubmitResult }> {
  try { return { pending: false, result: await runMirror(ctx, kind, args) }; }
  catch (e) {
    const msg = e instanceof HttpError ? `${e.code}: ${e.message}` : String(e);
    await ctx.db.insert(mirrorQueue).values({ kind, sscc, args, identity: WHO[kind], endorseSet: SET[kind], cause, attempts: 1, lastError: msg });
    return { pending: true };
  }
}

/** Retries queued mirrors, oldest first. Called every few seconds by the gateway process. */
export async function drainMirrorQueue(ctx: Ctx, log: { warn: (...a: unknown[]) => void }): Promise<number> {
  const rows = await ctx.db.select().from(mirrorQueue).where(and(eq(mirrorQueue.done, false), lt(mirrorQueue.attempts, 20))).orderBy(asc(mirrorQueue.id)).limit(20);
  let done = 0;
  for (const r of rows) {
    try {
      const res = await withLock(r.sscc, () => runMirror(ctx, r.kind as MirrorKind, r.args));
      await ctx.db.update(mirrorQueue).set({ done: true, doneTxId: res.receipt.txId, attempts: r.attempts + 1 }).where(eq(mirrorQueue.id, r.id));
      done++;
    } catch (e) {
      const msg = e instanceof HttpError ? `${e.code}: ${e.message}` : String(e);
      log.warn({ id: r.id, kind: r.kind, sscc: r.sscc, err: msg }, 'mirror retry failed');
      await ctx.db.update(mirrorQueue).set({ attempts: r.attempts + 1, lastError: msg }).where(eq(mirrorQueue.id, r.id));
    }
  }
  return done;
}
