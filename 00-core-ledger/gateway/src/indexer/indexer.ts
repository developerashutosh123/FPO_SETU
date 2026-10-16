// The indexer follows each channel's block events from a checkpoint and writes the index (blocks, transactions, VALID chaincode events,
// entity views). It feeds the SSE stream. Events of transactions that failed validation are stored as transactions but never as events.
import { EventEmitter } from 'node:events';
import { eq, sql } from 'drizzle-orm';
import type { Channel, LedgerEventName, StreamEvent } from '../contract/contract.js';
import { LEDGER_EVENTS } from '../contract/contract.js';
import type { Ctx, IndexerPort } from '../context.js';
import { blocksView, indexerCheckpoints, ledgerEvents, txView } from '../db/schema.js';
import type { DecodedBlock, DecodedTx } from '../fabric/decode.js';
import { CHANNELS } from '../fabric/topology.js';
import { INDEXER_USER, refreshDeposit, refreshLien, refreshLot, refreshOrder, refreshPatronage } from './refresh.js';
import { toStreamEvent } from '../routes/events.js';

interface EventPayload { eventType: string; eventTime: string; epcList: string[]; refs: Record<string, unknown>; alsoEmitted?: string[] }

export interface EventRow { channel: Channel; blockNumber: number; txId: string; seq: number; event: LedgerEventName; sscc: string | null; orderId: string | null; enwr: string | null; at: Date; payload: EventPayload }

/** Expands one chaincode event (which may list `alsoEmitted`) into one row per ledger event. Pure, so it is unit tested. */
export function expandEvents(channel: Channel, blockNumber: number, tx: DecodedTx): EventRow[] {
  const rows: EventRow[] = [];
  for (const ev of tx.events) {
    let p: EventPayload;
    try { p = JSON.parse(Buffer.from(ev.payload).toString('utf8')) as EventPayload; } catch { continue; }
    const names = [p.eventType, ...(p.alsoEmitted ?? [])].filter((n): n is LedgerEventName => (LEDGER_EVENTS as readonly string[]).includes(n));
    const refs = p.refs ?? {};
    const single = p.epcList?.length === 1 ? p.epcList[0]! : null;
    names.forEach((event) => rows.push({
      channel, blockNumber, txId: tx.txId, seq: rows.length, event, sscc: single, orderId: typeof refs.orderId === 'string' ? refs.orderId : null,
      enwr: typeof refs.enwr === 'string' ? refs.enwr : null, at: new Date(tx.timestamp), payload: p,
    }));
  }
  return rows;
}

export class Indexer implements IndexerPort {
  private abort = new AbortController();
  private processed = new Map<string, number>(); // channel -> last block processed
  private em = new EventEmitter();
  private loops: Promise<void>[] = [];
  lastIndexedAt: Date | undefined;

  constructor(private ctx: Ctx, private log: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void } = console) { this.em.setMaxListeners(0); }

  start() { for (const c of CHANNELS) this.loops.push(this.follow(c)); }
  async stop() { this.abort.abort(); await Promise.race([Promise.allSettled(this.loops), new Promise((r) => setTimeout(r, 3000))]); }

  async settled(channel: string, blockNumber: number, timeoutMs = 15000): Promise<void> {
    if ((this.processed.get(channel) ?? -1) >= blockNumber) return;
    await new Promise<void>((resolve) => {
      const t = setTimeout(done, timeoutMs);
      const on = (ch: string, n: number) => { if (ch === channel && n >= blockNumber) done(); };
      function done() { clearTimeout(t); em.off('processed', on); resolve(); }
      const em = this.em; em.on('processed', on);
    });
  }

  private async follow(channel: Channel) {
    let backoff = 1000;
    while (!this.abort.signal.aborted) {
      try {
        const cp = (await this.ctx.db.select().from(indexerCheckpoints).where(eq(indexerCheckpoints.channel, channel)))[0];
        const start = cp?.nextBlock ?? 0;
        if (start > 0) this.processed.set(channel, start - 1);
        for await (const block of this.ctx.ledger.blocks(channel, start, INDEXER_USER[channel], this.abort.signal)) {
          await this.processBlock(channel, block);
          backoff = 1000;
        }
      } catch (e) {
        if (this.abort.signal.aborted) return;
        this.log.warn({ channel, err: String(e) }, 'indexer lost the block stream; retrying');
      }
      await new Promise((r) => setTimeout(r, backoff)); backoff = Math.min(backoff * 2, 15000);
    }
  }

  async processBlock(channel: Channel, b: DecodedBlock) {
    const inserted: { id: number; row: EventRow }[] = [];
    await this.ctx.db.transaction(async (tx) => {
      await tx.insert(blocksView).values({ channel, number: b.number, dataHash: b.dataHash, previousHash: b.previousHash, blockHash: b.blockHash, txCount: b.txs.length, time: new Date(b.time) })
        .onConflictDoUpdate({ target: [blocksView.channel, blocksView.number], set: { dataHash: b.dataHash } });
      for (const [i, t] of b.txs.entries()) {
        if (t.type !== 3) continue;
        const row = { txId: t.txId, channel, blockNumber: b.number, txIndex: i, chaincode: t.chaincode, fn: t.fn, validationCode: t.validationCode, timestamp: new Date(t.timestamp), creatorMsp: t.creatorMsp, endorsers: [...new Set(t.endorsers)], reads: [...new Set(t.reads)].map(printable), writes: [...new Set(t.writes)].map(printable) };
        await tx.insert(txView).values(row).onConflictDoUpdate({ target: txView.txId, set: row });
        if (t.validationCode !== 'VALID') continue; // an invalid transaction changed nothing: no event, no refresh
        for (const r of expandEvents(channel, b.number, t)) {
          const ins = await tx.insert(ledgerEvents).values({ ...r, payload: r.payload }).onConflictDoNothing().returning({ id: ledgerEvents.id });
          if (ins[0]) inserted.push({ id: ins[0].id, row: r });
        }
      }
      await tx.insert(indexerCheckpoints).values({ channel, nextBlock: b.number + 1 }).onConflictDoUpdate({ target: indexerCheckpoints.channel, set: { nextBlock: b.number + 1, updatedAt: sql`now()` } });
    });
    // entity views are refreshed from chaincode state after the block is stored
    const lots = new Set<string>(), deposits = new Set<string>(), liens = new Map<string, string>(), orders = new Set<string>(), runs = new Set<string>();
    for (const { row } of inserted) {
      for (const s of row.payload.epcList ?? []) if (/^\d{18}$/.test(s)) lots.add(s);
      const r = row.payload.refs;
      if (typeof r.depositId === 'string') deposits.add(r.depositId);
      if (typeof r.enwr === 'string' && ['LienMarked', 'LoanDisbursed', 'LoanRepaid', 'LienReleased'].includes(row.event)) liens.set(r.enwr, typeof r.loanId === 'string' ? r.loanId : '');
      if (typeof r.orderId === 'string') orders.add(r.orderId);
      if (typeof r.runId === 'string') runs.add(r.runId);
    }
    const guard = async (what: string, p: Promise<unknown>) => { try { await p; } catch (e) { this.log.warn({ what, err: String(e) }, 'index refresh failed'); } };
    await Promise.all([
      ...[...lots].map((s) => guard(`lot ${s}`, refreshLot(this.ctx, s))), ...[...deposits].map((d) => guard(`deposit ${d}`, refreshDeposit(this.ctx, d))),
      ...[...liens].map(([e, l]) => guard(`lien ${e}`, refreshLien(this.ctx, e, l))), ...[...orders].map((o) => guard(`order ${o}`, refreshOrder(this.ctx, o))),
      ...[...runs].map((r) => guard(`run ${r}`, refreshPatronage(this.ctx, r))),
    ]);
    this.processed.set(channel, b.number); this.lastIndexedAt = new Date();
    for (const { id, row } of inserted) this.ctx.bus.publish(id, toStreamEvent({ ...row }) satisfies StreamEvent);
    this.em.emit('processed', channel, b.number);
  }
}
const printable = (k: string) => k.replace(/\u0000/g, '~').replace(/^~+|~+$/g, '');
