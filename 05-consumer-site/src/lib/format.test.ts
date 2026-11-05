import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, shortTx } from './format';

describe('formatDate', () => {
  it('keeps date-only strings as DD-MM-YYYY', () => expect(formatDate('2026-11-02')).toBe('02-11-2026'));
  it('converts timestamps to IST before taking the date', () => {
    expect(formatDate('2026-11-04T20:00:00Z')).toBe('05-11-2026'); // 01:30 IST next day
    expect(formatDate('2026-11-04T12:32:00Z')).toBe('04-11-2026');
  });
  it('returns unparseable input unchanged', () => expect(formatDate('soon')).toBe('soon'));
});

describe('formatDateTime', () => {
  it('shows the IST clock time', () => {
    expect(formatDateTime('2026-11-04T12:32:00Z')).toBe('04-11-2026, 18:02 IST');
    expect(formatDateTime('2026-11-04T20:00:00Z')).toBe('05-11-2026, 01:30 IST');
  });
  it('falls back to a plain date for date-only input', () => expect(formatDateTime('2026-11-02')).toBe('02-11-2026'));
});

describe('shortTx', () => {
  it('shortens long ids only', () => {
    expect(shortTx('a'.repeat(64))).toBe('aaaaaaaa…aaaaaa');
    expect(shortTx('FIXTURE-1')).toBe('FIXTURE-1');
  });
});
