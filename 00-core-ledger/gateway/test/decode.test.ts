import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeBlock } from '../src/fabric/decode.js';

const load = (n: string) => decodeBlock(readFileSync(join(__dirname, 'fixtures', 'blocks', `${n}.pb`)));

describe('decoding real blocks captured from the network', () => {
  it('reads a CommissionLot transaction: chaincode, function, creator, endorsers, keys, event', () => {
    const b = load('commission-lot');
    const tx = b.txs.find((t) => t.fn === 'CommissionLot')!;
    expect(b.number).toBe(13);
    expect(tx.chaincode).toBe('lot-lifecycle');
    expect(tx.channel).toBe('trace-channel');
    expect(tx.txId).toMatch(/^[0-9a-f]{64}$/);
    expect(tx.validationCode).toBe('VALID');
    expect(tx.creatorMsp).toBe('FpoOrgMSP');
    expect(new Set(tx.endorsers).size).toBe(3); // 3 of 4 orgs endorsed
    expect(tx.endorsers).toContain('FpoOrgMSP');
    expect(tx.writes.some((k) => /^\d{18}$/.test(k))).toBe(true); // the lot is stored under its SSCC
    expect(tx.events.map((e) => e.name)).toEqual(['LotCommissioned']);
    const payload = JSON.parse(Buffer.from(tx.events[0]!.payload).toString('utf8'));
    expect(payload.eventType).toBe('LotCommissioned');
    expect(payload.epcList[0]).toBe(tx.writes.find((k) => /^\d{18}$/.test(k)));
    expect(tx.args.length).toBe(11); // the arguments after the function name
  });

  it('computes the block hash the way the peer does (the next block points back at it)', () => {
    const a = load('commission-lot');
    const next = load('commission-lot-next');
    expect(next.number).toBe(a.number + 1);
    expect(next.previousHash).toBe(a.blockHash);
    expect(a.dataHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keeps the invalid transaction visible with its failure code and its event, so the indexer can skip it', () => {
    const tx = load('invalid-endorsement-policy').txs[0]!;
    expect(tx.fn).toBe('AcceptTransfer');
    expect(tx.validationCode).toBe('ENDORSEMENT_POLICY_FAILURE');
    expect(tx.events.length).toBe(1); // present in the block although the transaction is invalid
  });

  it('shows private data only as a hashed-collection marker, never keys or values', () => {
    for (const [name, collection] of [['mark-lien-private-data', 'loanTermsPDC'], ['agree-price-private-data', 'tradePricePDC']] as const) {
      const tx = load(name).txs[0]!;
      expect(tx.writes).toContain(`$$h$${collection}`);
      const json = JSON.stringify(tx, (_k, v) => (v instanceof Uint8Array ? Buffer.from(v).toString('utf8') : v));
      expect(json).not.toMatch(/\"amount\"|tenureDays|ratePct|pricePerQtl/);
    }
  });

  it('decodes a config block without failing', () => {
    const b = load('config-genesis');
    expect(b.number).toBe(0);
    expect(b.txs[0]!.type).toBe(1);
    expect(b.txs[0]!.chaincode).toBe('');
  });
});
