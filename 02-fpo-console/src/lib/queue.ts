import type { LotListItem, LotPassport, LotStatus, AuditSample } from '@/contract/contract';
import { shortOrg } from './format';

/** Order the queue the way a lot moves through the centre. */
export const STATUS_ORDER: LotStatus[] = [
  'PENDING_FARMER_SIGNATURE', 'COMMISSIONED', 'GRADED', 'IN_STORAGE', 'PLEDGED', 'LISTED', 'SOLD', 'IN_TRANSIT', 'DELIVERED', 'SETTLED', 'CLOSED',
  'TRANSFORMED', 'REJECTED', 'UNVERIFIABLE',
];
export const STATUS_LABEL: Record<LotStatus, string> = {
  PENDING_FARMER_SIGNATURE: 'Waiting for farmer signature', COMMISSIONED: 'Commissioned, to weigh and grade', GRADED: 'Graded', IN_STORAGE: 'In storage',
  PLEDGED: 'Pledged', LISTED: 'Listed', SOLD: 'Sold, to dispatch', IN_TRANSIT: 'In transit', DELIVERED: 'Delivered', SETTLED: 'Settled', CLOSED: 'Closed',
  TRANSFORMED: 'Sent to processing', REJECTED: 'Rejected', UNVERIFIABLE: 'Unverifiable (erased)',
};
/** Lots that are still moving and can raise an exception. Closed, settled and side states are not worth a per-lot read. */
export const ACTIVE_STATUSES: LotStatus[] = ['GRADED', 'IN_STORAGE', 'PLEDGED', 'LISTED', 'SOLD', 'IN_TRANSIT', 'DELIVERED'];

export function groupByStatus(lots: LotListItem[]): { status: LotStatus; lots: LotListItem[] }[] {
  const map = new Map<LotStatus, LotListItem[]>();
  for (const l of lots) map.set(l.status, [...(map.get(l.status) ?? []), l]);
  return STATUS_ORDER.filter((s) => map.has(s)).map((status) => ({ status, lots: map.get(status)! }));
}

export interface TodayCounters { draftsAwaitingSignature: number; gradedAwaitingStorage: number; pledged: number }
export function counters(lots: LotListItem[]): TodayCounters {
  const n = (s: LotStatus) => lots.filter((l) => l.status === s).length;
  return { draftsAwaitingSignature: n('PENDING_FARMER_SIGNATURE'), gradedAwaitingStorage: n('GRADED'), pledged: n('PLEDGED') };
}

export type ExceptionKind = 'PHI_BREACH' | 'AUDIT_DIVERGENCE' | 'COLD_CHAIN_BREACH' | 'PLEDGED_BUT_LISTED' | 'CUSTODY_PENDING';
export interface LotException { kind: ExceptionKind; sscc: string; humanRef: string; detail: string }
export const EXCEPTION_TITLE: Record<ExceptionKind, string> = {
  PHI_BREACH: 'Pre-harvest interval breach', AUDIT_DIVERGENCE: 'Audit divergence', COLD_CHAIN_BREACH: 'Cold-chain breach',
  PLEDGED_BUT_LISTED: 'Pledged but listed', CUSTODY_PENDING: 'Waiting for the buyer to accept custody',
};

/** Derived only from what the passports and the audit sample say; nothing is estimated. */
export function exceptionsFrom(passports: LotPassport[], audit?: AuditSample): LotException[] {
  const out: LotException[] = [];
  for (const p of passports) {
    if (p.phiCompliant === false) out.push({ kind: 'PHI_BREACH', sscc: p.sscc, humanRef: p.humanRef, detail: 'A spray was applied inside the pre-harvest interval.' });
    if (p.coldChain && p.coldChain.breaches > 0) {
      out.push({ kind: 'COLD_CHAIN_BREACH', sscc: p.sscc, humanRef: p.humanRef, detail: `${p.coldChain.breaches} temperature ${p.coldChain.breaches === 1 ? 'breach' : 'breaches'} in the anchored digests.` });
    }
    if (p.lien?.status === 'ACTIVE' && (p.status === 'LISTED' || p.status === 'SOLD')) {
      const lien = p.lien.lienId ? `Lien ${p.lien.lienId}` : 'A lien';
      out.push({ kind: 'PLEDGED_BUT_LISTED', sscc: p.sscc, humanRef: p.humanRef, detail: `${lien} is active while the lot is ${p.status.toLowerCase()}. Custody cannot move until it is released.` });
    }
    const open = p.custody.find((h) => !h.acceptedAt);
    if (p.status === 'IN_TRANSIT' && open) out.push({ kind: 'CUSTODY_PENDING', sscc: p.sscc, humanRef: p.humanRef, detail: `Proposed to the ${shortOrg(open.to).toLowerCase()} (${open.place}); not yet accepted.` });
  }
  for (const a of audit?.items ?? []) {
    if (a.status === 'DIVERGENT') out.push({ kind: 'AUDIT_DIVERGENCE', sscc: a.sscc, humanRef: a.humanRef, detail: a.note ?? 'The re-inspection differed from the recorded grade.' });
  }
  return out;
}
