import { describe, expect, it } from 'vitest';
import { subjectsOf, summarizeTx } from './explain';
import { formatDateTimeIST, joinList } from './format';

describe('subjectsOf', () => {
  it('finds a valid SSCC inside a prefixed key and ignores 18 digits that fail the GS1 check', () => {
    expect(subjectsOf(['DEPOSIT_089012340000004524']).sscc).toBe('089012340000004524');
    expect(subjectsOf(['DEPOSIT_089012340000004525']).sscc).toBeUndefined();
  });
  it('finds e-NWR, order and loan references', () => {
    const s = subjectsOf(['LIEN_ENWR-NERL-2026-004211', 'ORDER_ORD-2026-00087', 'LOAN_LN-2026-00040']);
    expect(s).toMatchObject({ enwr: 'ENWR-NERL-2026-004211', orderId: 'ORD-2026-00087', loanId: 'LN-2026-00040' });
  });
});

describe('summarizeTx', () => {
  it('says two endorsers acted jointly (contract example)', () => {
    const t = { fn: 'markLien', endorsers: ['FpoOrgMSP', 'BankOrgMSP'], creatorMsp: 'FpoOrgMSP', rwset: { reads: [], writes: ['LIEN_ENWR-NERL-2026-004211'] } } as never;
    expect(summarizeTx(t)).toBe('FPO and Bank jointly recorded a lien on ENWR-NERL-2026-004211.');
  });
  it('names the submitter when three orgs endorsed, and falls back for unknown functions', () => {
    const t = { fn: 'somethingNew', endorsers: ['FpoOrgMSP', 'BankOrgMSP', 'BuyerOrgMSP'], creatorMsp: 'FpoOrgMSP', rwset: { reads: [], writes: [] } } as never;
    expect(summarizeTx(t)).toBe('FPO ran somethingNew.');
  });
  it('never mentions a price for agreePrice', () => {
    const t = { fn: 'agreePrice', endorsers: ['FpoOrgMSP', 'BuyerOrgMSP'], creatorMsp: 'FpoOrgMSP', rwset: { reads: [], writes: ['ORDER_ORD-2026-00087'] } } as never;
    expect(summarizeTx(t)).toContain('only its hash is on the ledger');
    expect(summarizeTx(t)).not.toMatch(/₹|INR/);
  });
});

describe('format', () => {
  it('formats IST as DD-MM-YYYY HH:mm', () => { expect(formatDateTimeIST('2026-03-29T12:32:00Z')).toBe('29-03-2026 18:02 IST'); });
  it('joins lists', () => { expect(joinList(['a', 'b', 'c'])).toBe('a, b and c'); });
});
