// GET /ledger/tx/:id searches the channels in turn. Regression for C4: the peer's "no such transaction ID" was not recognised as
// not-found, so a finance or trade transaction failed on the first channel it asked (trace-channel) instead of being found on its own.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeBlock } from '../src/fabric/decode.js';
import { FabricLedger } from '../src/fabric/client.js';
import type { Channel } from '../src/contract/contract.js';
import { testServer } from './helpers/app.js';

const block = (n: string) => readFileSync(join(__dirname, 'fixtures', 'blocks', `${n}.pb`));
const FINANCE = block('mark-lien-private-data'), TRADE = block('agree-price-private-data'), TRACE = block('commission-lot');
const txOf = (raw: Buffer, fn: string) => decodeBlock(raw).txs.find((t) => t.fn === fn)!;
const LIEN = txOf(FINANCE, 'MarkLien'), PRICE = txOf(TRADE, 'AgreePrice'), COMMISSION = txOf(TRACE, 'CommissionLot');
const UNKNOWN = 'ab'.repeat(32);

/** A peer that holds one block per channel and answers like the real query system chaincode, including its error wording. */
class FakePeer extends FabricLedger {
  down = new Set<Channel>();
  constructor(private held: Partial<Record<Channel, { raw: Buffer; txIds: string[] }>>) { super({ networkDir: '/nowhere', walletDir: '/nowhere' }); }
  protected override qscc(_u: unknown, channel: Channel) {
    return {
      evaluateTransaction: async (fn: string, _ch: string, txId: string): Promise<Uint8Array> => {
        if (this.down.has(channel)) throw Object.assign(new Error('14 UNAVAILABLE: No connection established'), { code: 14 });
        const h = this.held[channel];
        if (fn === 'GetBlockByTxID' && h?.txIds.includes(txId)) return h.raw;
        throw Object.assign(new Error(`2 UNKNOWN: evaluate call to endorser returned error: chaincode response 500, Failed to get block for txID ${txId}, error no such transaction ID [${txId}] in index`), { code: 2 });
      },
    } as never;
  }
}

describe('GET /ledger/tx/:txId across channels', () => {
  const peer = new FakePeer({
    'trace-channel': { raw: TRACE, txIds: [COMMISSION.txId] },
    'finance-channel': { raw: FINANCE, txIds: [LIEN.txId] },
    'trade-channel': { raw: TRADE, txIds: [PRICE.txId] },
  });
  let t: Awaited<ReturnType<typeof testServer>>;
  beforeAll(async () => { t = await testServer({ ledger: peer }); });
  afterAll(async () => { await t.close(); });
  const get = (id: string) => t.server.app.inject({ method: 'GET', url: `/ledger/tx/${id}` });

  it('finds a finance transaction after trace-channel says it has no such transaction, with its real endorsers', async () => {
    const r = await get(LIEN.txId);
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body).toMatchObject({ txId: LIEN.txId, channel: 'finance-channel', chaincode: 'pledge-lien', fn: 'MarkLien' });
    expect(new Set(body.endorsers)).toEqual(new Set(LIEN.endorsers));
    expect(new Set(body.endorsers).size).toBeGreaterThan(1); // multi-org
  });

  it('finds a trade transaction after two channels say they have no such transaction', async () => {
    const r = await get(PRICE.txId);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ txId: PRICE.txId, channel: 'trade-channel', chaincode: 'order-settlement', fn: 'AgreePrice' });
    expect(new Set(r.json().endorsers).size).toBeGreaterThan(1);
  });

  it('still finds a trace transaction on the first channel', async () => {
    const r = await get(COMMISSION.txId);
    expect(r.statusCode).toBe(200);
    expect(r.json().channel).toBe('trace-channel');
  });

  it('answers 404, not 500, for an ID that is on no channel', async () => {
    const r = await get(UNKNOWN);
    expect(r.statusCode).toBe(404);
    expect(r.json().error.code).toBe('ERR_NOT_FOUND');
  });

  it('does not hide a real outage as not-found', async () => {
    peer.down.add('trace-channel');
    try { expect((await get(LIEN.txId)).statusCode).toBe(503); } finally { peer.down.clear(); }
  });

  it('search by transaction ID uses the same lookup', async () => {
    const r = await t.server.app.inject({ method: 'GET', url: `/ledger/search?q=${LIEN.txId}` });
    expect(r.json()).toMatchObject([{ kind: 'tx', id: LIEN.txId, channel: 'finance-channel' }]);
  });
});
