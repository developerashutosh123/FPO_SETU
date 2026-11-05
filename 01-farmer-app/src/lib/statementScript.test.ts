import { describe, expect, it } from 'vitest';
import i18n from '../i18n';
import type { StatementLine } from '../contract/contract';
import { commodityFromRef, statementScript } from './statementScript';

// shared/fixtures/statements.json (myStatements), the seeded settled statement
const stmt: StatementLine = {
  sscc: '089012340000004517', humanRef: 'WB-PSM-KGP2-POT-FPO07-2026-R-00451', kg: 1964, grade: 'A', buyerType: 'Processor and organised retail (Kolkata)',
  gross: 31031, deductions: [
    { type: 'HAMALI', amount: 177 }, { type: 'MARKET_FEE', amount: 155 }, { type: 'COMMISSION', amount: 465 },
    { type: 'TRANSPORT', amount: 550 }, { type: 'COLD_STORAGE_RENT', amount: 3142 }, { type: 'FPO_MARGIN', amount: 621 },
  ], net: 25921, upiRef: '604512339876', paidOn: '2026-11-13', proofs: [],
};

describe('read-aloud script', () => {
  const t = i18n.getFixedT('bn');
  const lines = statementScript(stmt, 'আলু', 'bn', (k, o) => String(t(k, o as never)), (type) => String(t(`deduction.${type}`)));

  it('speaks gross, every deduction, net and the paid date, all amounts in words', () => {
    expect(lines.map((l) => l.key)).toEqual(['intro', 'gross', 'ded:head', 'ded:0', 'ded:1', 'ded:2', 'ded:3', 'ded:4', 'ded:5', 'net', 'paid']);
    expect(lines[0]!.text).toBe('আপনার আলু লটের হিসাব। ওজন এক হাজার নয় শো চৌষট্টি কেজি। গ্রেড এ।');
    expect(lines[1]!.text).toBe('মোট বিক্রির টাকা একত্রিশ হাজার একত্রিশ টাকা।');
    expect(lines[7]!.text).toBe('হিমঘরের ভাড়া, তিন হাজার এক শো বিয়াল্লিশ টাকা।');
    expect(lines[9]!.text).toBe('আপনি পেয়েছেন পঁচিশ হাজার নয় শো একুশ টাকা।');
    expect(lines[10]!.text).toContain('তেরো নভেম্বর দুই হাজার ছাব্বিশ');
    expect(lines[10]!.text).toContain('পরীক্ষামূলক'); // the UPI reference is simulated, and the farmer hears that
  });
  it('contains no digits: numerals are for the screen, words for the ear', () => {
    for (const l of lines) expect(l.text).not.toMatch(/[0-9০-৯]/);
  });
  it('crop code in the lot reference', () => expect(commodityFromRef(stmt.humanRef)).toBe('POTATO'));
});
