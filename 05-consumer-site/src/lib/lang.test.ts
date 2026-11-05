import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import bn from '@/i18n/bn.json';
import { fill, pickLang, withLang } from './lang';

const keys = (o: unknown, p = ''): string[] =>
  o && typeof o === 'object' && !Array.isArray(o)
    ? Object.entries(o).flatMap(([k, v]) => (k === '_review' ? [] : keys(v, `${p}${k}.`)))
    : Array.isArray(o) ? o.flatMap((v, i) => keys(v, `${p}${i}.`)) : [p];

describe('i18n', () => {
  it('Bengali has exactly the English keys and is marked for review', () => {
    expect(keys(bn).sort()).toEqual(keys(en).sort());
    expect((bn as { _review?: boolean })._review).toBe(true);
  });
  it('uses the same placeholders in both languages', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    const flat = (o: unknown): string[] => (typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.entries(o).filter(([k]) => k !== '_review').flatMap(([, v]) => flat(v)) : []);
    const a = flat(en), b = flat(bn);
    a.forEach((s, i) => expect(ph(b[i]!), s).toBe(ph(s)));
  });
  it('has no em dashes and no GI wording in any string', () => {
    const all = JSON.stringify([en, bn]);
    expect(all).not.toContain('—');
    expect(all).not.toMatch(/geographical indication|\bGI\b/i);
  });
  it('pickLang defaults to English', () => {
    expect(pickLang(undefined)).toBe('en');
    expect(pickLang('hi')).toBe('en');
    expect(pickLang('bn')).toBe('bn');
    expect(pickLang(['bn', 'en'])).toBe('bn');
  });
  it('fill and withLang', () => {
    expect(fill('Block {n}', { n: 5 })).toBe('Block 5');
    expect(withLang('/00/1', 'bn')).toBe('/00/1?lang=bn');
    expect(withLang('/?invalid=1', 'bn')).toBe('/?invalid=1&lang=bn');
    expect(withLang('/00/1', 'en')).toBe('/00/1');
  });
});
