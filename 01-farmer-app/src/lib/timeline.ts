import type { LotPassport, Proof, StatementLine, TxDetail } from '../contract/contract';

export type StepKey = 'commissioned' | 'graded' | 'stored' | 'pledged' | 'released' | 'sold' | 'dispatched' | 'delivered' | 'paid';
export interface TimelineStep { key: StepKey; at?: string; place?: string; proof?: Proof }

/** Which chaincode function marks each step. `last` = the later of several (price agreement is submitted by both sides). */
const FN: Record<StepKey, { fn: string; last?: boolean }> = {
  commissioned: { fn: 'commissionLot' }, graded: { fn: 'attestQuality' }, stored: { fn: 'recordDeposit' }, pledged: { fn: 'markLien' },
  released: { fn: 'releaseLien' }, sold: { fn: 'agreePrice', last: true }, dispatched: { fn: 'proposeTransfer' }, delivered: { fn: 'acceptTransfer' },
  paid: { fn: 'distributePatronage' },
};

/**
 * The steps this lot has actually been through, from the passport fields. Proof chips and times come from the committed transactions
 * (matched by chaincode function) when they have loaded; nothing is invented when they have not.
 */
export function buildTimeline(lot: LotPassport, txs: Map<string, TxDetail>, statement: StatementLine | undefined, villageName: string | undefined): TimelineStep[] {
  const byFn = (step: StepKey): { proof: Proof; at: string } | undefined => {
    const { fn, last } = FN[step];
    const hits = lot.proofs.map((p) => ({ p, tx: txs.get(p.txId) })).filter((h) => h.tx?.fn === fn);
    const h = last ? hits[hits.length - 1] : hits[0];
    return h?.tx ? { proof: h.p, at: h.tx.timestamp } : undefined;
  };
  const steps: TimelineStep[] = [];
  const add = (key: StepKey, own: { at?: string; place?: string; proof?: Proof }) => {
    const m = byFn(key);
    steps.push({ key, at: own.at ?? m?.at, place: own.place, proof: own.proof ?? m?.proof });
  };

  if (lot.status !== 'PENDING_FARMER_SIGNATURE') add('commissioned', { place: villageName, proof: txs.size === 0 ? lot.proofs[0] : undefined });
  if (lot.quality || lot.grade) add('graded', { at: lot.quality?.reading.at, place: villageName });
  if (lot.storage) add('stored', { at: lot.storage.depositedAt, place: lot.storage.facilityName });
  if (lot.lien && lot.lien.status !== 'NONE') {
    add('pledged', { proof: lot.lien.status === 'ACTIVE' ? lot.lien.proof : undefined });
    if (lot.lien.status === 'RELEASED') add('released', { proof: lot.lien.proof });
  }
  if (lot.order) add('sold', {});
  const hop = lot.custody[0];
  if (hop) {
    add('dispatched', { at: hop.proposedAt, place: hop.place, proof: hop.proof && !hop.acceptedAt ? hop.proof : undefined });
    if (hop.acceptedAt) add('delivered', { at: hop.acceptedAt, place: hop.place, proof: hop.proof });
  }
  if (statement?.paidOn) add('paid', { at: statement.paidOn });
  return steps;
}
