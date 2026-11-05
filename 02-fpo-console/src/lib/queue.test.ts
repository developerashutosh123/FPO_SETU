import { describe, expect, it } from 'vitest';
import type { AuditSample, LotListItem, LotPassport } from '@/contract/contract';
import { counters, exceptionsFrom, groupByStatus } from './queue';

const item = (sscc: string, status: LotListItem['status']): LotListItem => ({
  sscc, humanRef: `REF-${sscc}`, commodity: 'POTATO', status, village: 'CHANGUAL', bagCount: 10, estWeightKg: 500, harvestOrUnloadDate: '2026-11-01',
});
const passport = (over: Partial<LotPassport>): LotPassport => ({
  sscc: '1', humanRef: 'REF-1', commodity: 'POTATO', status: 'GRADED', village: 'CHANGUAL', farmerToken: 'FT-x', plotId: 'PL-x', bagCount: 1, estWeightKg: 1,
  harvestOrUnloadDate: '2026-11-01', custody: [], integrity: { docs: [] }, proofs: [], ...over,
});

describe('queue', () => {
  const lots = [item('a', 'GRADED'), item('b', 'GRADED'), item('c', 'PLEDGED'), item('d', 'PENDING_FARMER_SIGNATURE'), item('e', 'CLOSED')];
  it('counts the three headline numbers', () => {
    expect(counters(lots)).toEqual({ draftsAwaitingSignature: 1, gradedAwaitingStorage: 2, pledged: 1 });
  });
  it('groups in the order a lot moves through the centre', () => {
    expect(groupByStatus(lots).map((g) => `${g.status}:${g.lots.length}`)).toEqual(['PENDING_FARMER_SIGNATURE:1', 'GRADED:2', 'PLEDGED:1', 'CLOSED:1']);
  });
});

describe('exceptionsFrom', () => {
  it('finds each of the five exception kinds from what the ledger reports', () => {
    const audit: AuditSample = { drawnOn: '2026-11-01', sampleRatePct: 5, audited: 1, divergent: 1, divergenceRatePct: 100, items: [{ sscc: '9', humanRef: 'REF-9', village: 'DUAN', status: 'DIVERGENT', note: 'Grade differed' }] };
    const out = exceptionsFrom([
      passport({ sscc: '1', phiCompliant: false }),
      passport({ sscc: '2', coldChain: { continuous: false, breaches: 2, digests: [] } }),
      passport({ sscc: '3', status: 'LISTED', lien: { status: 'ACTIVE', lienId: 'LIEN-2026-00041' } }),
      passport({ sscc: '4', status: 'IN_TRANSIT', custody: [{ from: 'FpoOrgMSP', to: 'BuyerOrgMSP', place: 'Changual', proposedAt: '2026-11-02T00:00:00Z' }] }),
    ], audit);
    expect(out.map((e) => e.kind).sort()).toEqual(['AUDIT_DIVERGENCE', 'COLD_CHAIN_BREACH', 'CUSTODY_PENDING', 'PHI_BREACH', 'PLEDGED_BUT_LISTED']);
  });
  it('reports nothing for a clean lot and ignores a released lien', () => {
    expect(exceptionsFrom([passport({ status: 'LISTED', lien: { status: 'RELEASED' }, phiCompliant: true, coldChain: { continuous: true, breaches: 0, digests: [] } })])).toEqual([]);
  });
});
