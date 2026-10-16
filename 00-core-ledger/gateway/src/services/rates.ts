import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Commodity, Deduction } from '../contract/contract.js';
import { HttpError } from '../errors.js';

type Status = 'SOURCED' | 'ASSUMPTION' | 'UNSOURCED';
interface RateEntry { perQtl?: number | null; pct?: number | null; status: Status; source: string; candidate?: string | null }
export interface Rates {
  ltvPct: { value: 70 };
  haircutPct: Record<Commodity, { value: number; status: Status; source: string }>;
  deductions: Record<'COLD_STORAGE_RENT' | 'HAMALI' | 'MARKET_FEE' | 'COMMISSION' | 'TRANSPORT' | 'FPO_MARGIN', RateEntry>;
}

export function loadRates(file = process.env.RATES_FILE ?? 'config/rates.json'): Rates {
  return JSON.parse(readFileSync(resolve(file), 'utf8')) as Rates;
}

const rupees = (n: number) => Math.round(n);

/**
 * Deductions for one lot. A deduction whose rate is not configured makes the whole computation fail with a message that names it:
 * a statement with a missing deduction would overstate the farmer's payout, so we refuse instead of guessing.
 */
export function computeDeductions(rates: Rates, input: { kg: number; gross: number; loanRecovery?: number }): Deduction[] {
  const qtl = input.kg / 100;
  const missing: string[] = [];
  const d = rates.deductions;
  const need = (k: keyof Rates['deductions'], v: number | null | undefined) => { if (v == null) missing.push(k); return v ?? 0; };
  const out: Deduction[] = [
    { type: 'HAMALI', amount: rupees(qtl * need('HAMALI', d.HAMALI.perQtl)) },
    { type: 'MARKET_FEE', amount: rupees((input.gross * need('MARKET_FEE', d.MARKET_FEE.pct)) / 100) },
    { type: 'COMMISSION', amount: rupees((input.gross * need('COMMISSION', d.COMMISSION.pct)) / 100) },
    { type: 'TRANSPORT', amount: rupees(qtl * need('TRANSPORT', d.TRANSPORT.perQtl)) },
    { type: 'COLD_STORAGE_RENT', amount: rupees(qtl * need('COLD_STORAGE_RENT', d.COLD_STORAGE_RENT.perQtl)) },
    { type: 'FPO_MARGIN', amount: rupees((input.gross * need('FPO_MARGIN', d.FPO_MARGIN.pct)) / 100) },
  ];
  if (missing.length) throw new HttpError('ERR_VALIDATION', `Deduction rates not configured: ${missing.join(', ')}. Add the sourced values to config/rates.json (see docs/DATA_SOURCES.md).`, { details: { missing } });
  if (input.loanRecovery && input.loanRecovery > 0) out.push({ type: 'LOAN_RECOVERY', amount: rupees(input.loanRecovery) });
  return out.filter((x) => x.amount > 0);
}
