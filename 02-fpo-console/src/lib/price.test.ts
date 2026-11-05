import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '@/contract/contract';
import { parsePricePerQtl, parseUpiRef } from './price';

const hashFor = (orderId: string, pricePerQtl: number, salt: string) => createHash('sha256').update(canonicalJson({ orderId, pricePerQtl, salt })).digest('hex');

describe('parsePricePerQtl', () => {
  it('turns every way of typing the same price into the same number, so both sides hash identically', () => {
    const salt = '0123456789abcdef0123456789abcdef'; // derived by the gateway for both parties
    const typed = ['1580', ' 1580 ', '1,580', '₹1,580', '1580.0', '1580.00'];
    const hashes = typed.map((t) => { const r = parsePricePerQtl(t); if (!r.ok) throw new Error(t); return hashFor('ORD-2026-00091', r.value, salt); });
    expect(new Set(hashes).size).toBe(1);
    expect(hashes[0]).toBe(hashFor('ORD-2026-00091', 1580, salt));
  });
  it('keeps paise and is not the same price as a different number', () => {
    const a = parsePricePerQtl('1580.5'); const b = parsePricePerQtl('1580');
    expect(a).toEqual({ ok: true, value: 1580.5 });
    expect(hashFor('ORD-2026-00091', 1580.5, 's')).not.toBe(hashFor('ORD-2026-00091', (b as { value: number }).value, 's'));
  });
  it.each(['', 'abc', '-5', '0', '12.345', '1e3', '1000001', '15 80x'])('rejects %j', (t) => {
    expect(parsePricePerQtl(t).ok).toBe(false);
  });
});

describe('parseUpiRef', () => {
  it('accepts 12 digits with or without the SIM prefix', () => {
    expect(parseUpiRef('604512339876')).toEqual({ ok: true, value: '604512339876' });
    expect(parseUpiRef('SIM 604512339876')).toEqual({ ok: true, value: '604512339876' });
  });
  it.each(['', '60451233987', '6045123398765', 'abcdefghijkl'])('rejects %j', (t) => expect(parseUpiRef(t).ok).toBe(false));
});
