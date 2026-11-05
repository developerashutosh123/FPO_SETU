import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import bn from './bn.json';
import en from './en.json';
import hi from './hi.json';

const leaves = (o: Record<string, unknown>, p = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => (k === '_review' ? [] : v && typeof v === 'object' ? leaves(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`]));
const strings = (o: Record<string, unknown>): string[] => Object.values(o).flatMap((v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? strings(v as Record<string, unknown>) : []));

describe('locale files', () => {
  it('bn, hi and en have exactly the same keys', () => {
    expect(leaves(bn).sort()).toEqual(leaves(en).sort());
    expect(leaves(hi).sort()).toEqual(leaves(en).sort());
  });
  it('the Bengali file is marked as not yet reviewed by a native speaker', () => expect((bn as Record<string, unknown>)._review).toBe(true));
  it('no em dashes and no banned marketing words in UI copy (CONTRACT.md section 10)', () => {
    for (const s of [...strings(bn), ...strings(en), ...strings(hi)]) {
      expect(s).not.toContain('—');
      expect(s).not.toMatch(/revolutioniz|empower|seamless|cutting-edge|unlock|next-gen/i);
    }
  });
  it('every contract error code has an action-phrased message', () => {
    const codes = ['ERR_UNAUTHENTICATED', 'ERR_FORBIDDEN_ROLE', 'ERR_FORBIDDEN_ORG', 'ERR_VALIDATION', 'ERR_NOT_FOUND', 'ERR_INVALID_STATE', 'ERR_BAD_FARMER_SIGNATURE', 'ERR_BAD_DEVICE_SIGNATURE', 'ERR_LEDGER_UNAVAILABLE', 'NETWORK', 'UNKNOWN'];
    for (const c of codes) for (const l of [bn, en, hi]) expect((l.errors as Record<string, string>)[c], c).toBeTruthy();
  });
  it('every deduction type and lot status has a name in every language', () => {
    const deductions = ['HAMALI', 'MARKET_FEE', 'COMMISSION', 'TRANSPORT', 'COLD_STORAGE_RENT', 'FPO_MARGIN', 'LOAN_RECOVERY'];
    const statuses = ['PENDING_FARMER_SIGNATURE', 'COMMISSIONED', 'GRADED', 'IN_STORAGE', 'PLEDGED', 'LISTED', 'SOLD', 'IN_TRANSIT', 'DELIVERED', 'SETTLED', 'CLOSED', 'TRANSFORMED', 'REJECTED', 'UNVERIFIABLE'];
    for (const l of [bn, en, hi]) {
      for (const d of deductions) expect((l.deduction as Record<string, string>)[d], d).toBeTruthy();
      for (const s of statuses) expect((l.status as Record<string, string>)[s], s).toBeTruthy();
    }
  });
});

describe('theme', () => {
  it('mirrors shared/design/tokens.css for the farmer portal and never goes below 16 sp', async () => {
    const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
    const farmer = /\[data-portal="farmer"\]\s*\{([^}]*)\}/.exec(css)![1]!;
    const { color, size } = await import('../theme');
    expect(farmer).toContain(`--accent: ${color.accent}`);
    expect(farmer).toContain(`--accent-2: ${color.accent2}`);
    expect(farmer).toContain(`--canvas: ${color.canvas}`);
    for (const v of ['ink', 'ink-2', 'ink-3', 'line', 'surface', 'ok', 'warn', 'danger', 'info']) {
      const key = v.replace('-2', '2').replace('-3', '3') as keyof typeof color;
      expect(css, v).toContain(`--${v}: ${color[key]}`);
    }
    for (const px of Object.values(size)) expect(px).toBeGreaterThanOrEqual(16);
  });
});
