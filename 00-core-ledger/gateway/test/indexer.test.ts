import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { blocksView, ledgerEvents, lotsView, mirrorQueue, txView } from '../src/db/schema.js';
import { decodeBlock } from '../src/fabric/decode.js';
import { HttpError } from '../src/errors.js';
import { drainMirrorQueue, mirror, withLock } from '../src/services/chain.js';
import type { StreamEvent } from '../src/contract/contract.js';
import { testServer } from './helpers/app.js';

const block = (n: string) => decodeBlock(readFileSync(join(__dirname, 'fixtures/blocks', `${n}.pb`)));
let t: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => { t = await testServer(); });
afterAll(async () => { await t.close(); });

const lotJson = (sscc: string) => JSON.stringify({ sscc, humanRef: 'WB-PSM-KGP2-POT-FPO07-2026-R-00451', commodity: 'POTATO', variety: 'Kufri Jyoti', village: 'CHANGUAL', farmerToken: 'FT-9c2e41a07b55d3f1', plotId: 'PL-7Q2M9X4K1A', bagCount: 40, estWeightKg: 2000, harvestOrUnloadDate: '2026-11-02', status: 'COMMISSIONED', originStatus: 'VERIFIED', grade: '', netKg: 0, orderId: '', custody: [], digests: [], lastTxId: 'x' });

describe('indexer processBlock on real blocks', () => {
  it('stores the block, the transaction, the event and refreshes the lot from chaincode; publishes to the bus', async () => {
    const b = block('commission-lot');
    const tx = b.txs.find((x) => x.fn === 'CommissionLot')!;
    const sscc = tx.writes.find((k) => /^\d{18}$/.test(k))!;
    t.ledger.answers['lot-lifecycle.GetLot'] = lotJson(sscc);
    const seen: StreamEvent[] = [];
    t.server.ctx.bus.subscribe((m) => seen.push(m.ev));
    await t.server.indexer.processBlock('trace-channel', b);
    const db = t.server.ctx.db;
    expect((await db.select().from(blocksView).where(eq(blocksView.number, b.number)))[0]).toMatchObject({ channel: 'trace-channel', blockHash: b.blockHash, dataHash: b.dataHash });
    expect((await db.select().from(txView).where(eq(txView.txId, tx.txId)))[0]).toMatchObject({ fn: 'CommissionLot', validationCode: 'VALID', creatorMsp: 'FpoOrgMSP' });
    expect((await db.select().from(ledgerEvents).where(eq(ledgerEvents.txId, tx.txId)))[0]).toMatchObject({ event: 'LotCommissioned', sscc });
    expect((await db.select().from(lotsView).where(eq(lotsView.sscc, sscc)))[0]).toMatchObject({ status: 'COMMISSIONED', commodity: 'POTATO' });
    expect(seen.map((e) => e.event)).toEqual(['LotCommissioned']);
    expect(JSON.stringify(seen)).not.toMatch(/price|amount|Anima/i);
  });
  it('is idempotent: processing the same block again adds no event and publishes nothing', async () => {
    const b = block('commission-lot');
    const before = (await t.server.ctx.db.select().from(ledgerEvents)).length;
    let n = 0; t.server.ctx.bus.subscribe(() => n++);
    await t.server.indexer.processBlock('trace-channel', b);
    expect((await t.server.ctx.db.select().from(ledgerEvents)).length).toBe(before);
    expect(n).toBe(0);
  });
  it('records an invalid transaction but never its event, and refreshes nothing', async () => {
    const b = block('invalid-endorsement-policy');
    const calls = t.ledger.calls.length;
    await t.server.indexer.processBlock('trace-channel', b);
    const tx = b.txs[0]!;
    expect((await t.server.ctx.db.select().from(txView).where(eq(txView.txId, tx.txId)))[0]!.validationCode).toBe('ENDORSEMENT_POLICY_FAILURE');
    expect(await t.server.ctx.db.select().from(ledgerEvents).where(eq(ledgerEvents.txId, tx.txId))).toEqual([]);
    expect(t.ledger.calls.length).toBe(calls);
  });
  it('settled() resolves once the block was processed', async () => {
    await expect(t.server.indexer.settled('trace-channel', block('commission-lot').number, 200)).resolves.toBeUndefined();
  });
});

describe('SSE stream', () => {
  it('replays missed events from Last-Event-ID and then streams new ones', async () => {
    await t.server.app.listen({ port: 0, host: '127.0.0.1' });
    const port = (t.server.app.server.address() as { port: number }).port;
    const first = (await t.server.ctx.db.select().from(ledgerEvents))[0]!;
    const ctrl = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/events/stream`, { headers: { 'last-event-id': String(first.id - 1) }, signal: ctrl.signal });
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    const reader = res.body!.getReader(); let text = ''; const t0 = Date.now();
    while (!text.includes('LotCommissioned') && Date.now() - t0 < 3000) text += Buffer.from((await reader.read()).value ?? []).toString();
    expect(text).toContain(`id: ${first.id}`);
    t.server.ctx.bus.publish(first.id + 1000, { event: 'LotGraded', sscc: '089012340000004517', txId: 'f'.repeat(64), blockNumber: 99, channel: 'trace-channel', at: '2026-11-14T12:32:00Z' });
    while (!text.includes('LotGraded') && Date.now() - t0 < 6000) text += Buffer.from((await reader.read()).value ?? []).toString();
    expect(text).toContain('LotGraded');
    ctrl.abort();
  });
});

describe('status mirror queue', () => {
  it('a failed follow-up call is queued, retried and completed; nothing is dropped', async () => {
    let attempts = 0;
    t.ledger.submitImpl = async (fn) => {
      if (++attempts === 1) throw new HttpError('ERR_LEDGER_UNAVAILABLE', 'peer down');
      return { receipt: { txId: 'a'.repeat(64), channel: 'trace-channel', chaincode: 'lot-lifecycle', fn, blockNumber: 7, validationCode: 'VALID', endorsers: ['FpoOrgMSP'], committedAt: '2026-11-14T12:32:00Z' }, result: '' };
    };
    const m = await mirror(t.server.ctx, 'SetInStorage', '089012340000004517', ['089012340000004517', 'COLD_STORAGE', 'DEP-2026-00201'], 'c'.repeat(64));
    expect(m.pending).toBe(true);
    const q = await t.server.ctx.db.select().from(mirrorQueue);
    expect(q).toHaveLength(1); expect(q[0]).toMatchObject({ kind: 'SetInStorage', done: false, attempts: 1 });
    expect(q[0]!.lastError).toMatch(/ERR_LEDGER_UNAVAILABLE/);
    expect(await drainMirrorQueue(t.server.ctx, { warn: () => undefined })).toBe(1);
    expect((await t.server.ctx.db.select().from(mirrorQueue))[0]).toMatchObject({ done: true, doneTxId: 'a'.repeat(64) });
    const ok = await mirror(t.server.ctx, 'SetListed', '089012340000004517', ['089012340000004517', 'ORD-2026-00087'], 'c'.repeat(64));
    expect(ok.pending).toBe(false);
    t.ledger.submitImpl = undefined;
  });
});

describe('per-key lock', () => {
  it('serialises writes to the same key and lets different keys run together', async () => {
    const order: string[] = [];
    const slow = (name: string, ms: number) => async () => { order.push(`${name}:start`); await new Promise((r) => setTimeout(r, ms)); order.push(`${name}:end`); };
    await Promise.all([withLock('lot-1', slow('a', 40)), withLock('lot-1', slow('b', 5)), withLock('lot-2', slow('c', 5))]);
    expect(order.indexOf('a:end')).toBeLessThan(order.indexOf('b:start'));
    expect(order.indexOf('c:start')).toBeLessThan(order.indexOf('a:end'));
  });
});
