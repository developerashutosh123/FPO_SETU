// The ledger port backed by the Postgres index instead of Fabric peers. Used by the read-only fallback API (read-api/) while the
// Fabric host sleeps: every read the explorer needs comes from blocks_view / tx_view, and every write is refused.
import { and, eq, max } from 'drizzle-orm';
import type { Channel, OrgMsp } from '../contract/contract.js';
import type { Db } from '../db/client.js';
import { blocksView, indexerCheckpoints, tradePrices, txView } from '../db/schema.js';
import { HttpError } from '../errors.js';
import type { DecodedBlock, DecodedTx } from './decode.js';
import type { Ledger, SubmitResult } from './ledger.js';
import { peerOf } from './topology.js';

const ASLEEP = 'The ledger node is asleep. You are seeing the last indexed state. Actions that write to the ledger are paused.';
/** Same format as fabric/decode.ts: whole seconds, so the explorer reads the same from the index as from a peer. */
const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

type TxRow = typeof txView.$inferSelect;
const toTx = (r: TxRow): DecodedTx => ({
  txId: r.txId, channel: r.channel, type: 3, timestamp: iso(r.timestamp), creatorMsp: r.creatorMsp, chaincode: r.chaincode, fn: r.fn,
  args: [], endorsers: r.endorsers, reads: r.reads, writes: r.writes, events: [], validationCode: r.validationCode,
});

export class IndexLedger implements Ledger {
  readonly mode = 'index-only' as const;
  constructor(private db: Db) {}

  async submit(): Promise<SubmitResult> { throw new HttpError('ERR_LEDGER_UNAVAILABLE', ASLEEP); }

  /** The only chaincode read that is not already an index table is the private price, which the gateway keeps off-chain too. */
  async evaluate(_u: unknown, _channel: Channel, chaincode: string, fn: string, args: string[]): Promise<string> {
    if (chaincode === 'order-settlement' && fn === 'GetOrderPrice') {
      const r = (await this.db.select().from(tradePrices).where(and(eq(tradePrices.orderId, args[0] ?? ''), eq(tradePrices.agreed, true))))[0];
      if (!r) throw new HttpError('ERR_NOT_FOUND', `No agreed price for ${args[0]}.`);
      return JSON.stringify({ pricePerQtl: r.pricePerQtl, salt: r.salt });
    }
    throw new HttpError('ERR_LEDGER_UNAVAILABLE', ASLEEP);
  }

  async chainHeight(channel: Channel): Promise<number> {
    const r = (await this.db.select({ n: max(blocksView.number) }).from(blocksView).where(eq(blocksView.channel, channel)))[0];
    return r?.n === null || r?.n === undefined ? 0 : Number(r.n) + 1;
  }

  async getBlock(channel: Channel, number: number): Promise<DecodedBlock> {
    const b = (await this.db.select().from(blocksView).where(and(eq(blocksView.channel, channel), eq(blocksView.number, number))))[0];
    if (!b) throw new HttpError('ERR_NOT_FOUND', `Block ${number} does not exist on ${channel}.`);
    const rows = await this.db.select().from(txView).where(and(eq(txView.channel, channel), eq(txView.blockNumber, number)));
    // chaincode invocations come from tx_view, channel configuration from the block row; put them back in block order
    const txs = [
      ...b.configTxs.map((c): [number, DecodedTx] => [c.index, { ...toTx({ ...c, channel, blockNumber: number, txIndex: c.index, timestamp: new Date(c.timestamp), endorsers: [], reads: [], writes: [] }), type: 1 }]),
      ...rows.map((r): [number, DecodedTx] => [r.txIndex, toTx(r)]),
    ].sort((x, y) => x[0] - y[0]).map(([, t]) => t);
    return { number: b.number, dataHash: b.dataHash, previousHash: b.previousHash, blockHash: b.blockHash, time: iso(b.time), txs };
  }

  async getBlockByTxId(channel: Channel, txId: string): Promise<DecodedBlock> {
    const t = (await this.db.select({ n: txView.blockNumber }).from(txView).where(and(eq(txView.channel, channel), eq(txView.txId, txId))))[0];
    if (!t) throw new HttpError('ERR_NOT_FOUND', `Transaction ${txId} was not found on ${channel}.`);
    return this.getBlock(channel, t.n);
  }

  async getTransaction(channel: Channel, txId: string): Promise<DecodedTx> {
    const t = (await this.db.select().from(txView).where(and(eq(txView.channel, channel), eq(txView.txId, txId))))[0];
    if (!t) throw new HttpError('ERR_NOT_FOUND', `Transaction ${txId} was not found on ${channel}.`);
    return toTx(t);
  }

  // eslint-disable-next-line require-yield
  async *blocks(): AsyncIterable<DecodedBlock> { /* the read-only API never follows the chain */ }

  /** No peer is asked: every peer is reported as not reachable from here. */
  async peerStatus(): Promise<{ org: OrgMsp; name: string; up: boolean }[]> {
    return (['FpoOrgMSP', 'BankOrgMSP', 'BuyerOrgMSP', 'RegulatorOrgMSP'] as OrgMsp[]).map((org) => ({ org, name: peerOf('', org).host, up: false }));
  }

  async lastIndexedAt(): Promise<string | undefined> {
    const r = (await this.db.select({ at: max(indexerCheckpoints.updatedAt) }).from(indexerCheckpoints))[0];
    return r?.at ? iso(new Date(r.at)) : undefined;
  }

  close(): void { /* the database handle belongs to the caller */ }
}
