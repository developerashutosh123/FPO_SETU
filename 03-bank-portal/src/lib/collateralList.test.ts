import { describe, expect, it, vi } from 'vitest';
import type { Collateral, Loan } from '@/contract/contract';
import { ApiClientError } from './api';
import { CHUNK_SIZE, chunkOffsets, createLimiter, fetchChunk, fetchPledged, type ListDeps } from './collateralList';

const col = (enwr: string, status: 'NONE' | 'ACTIVE' | 'RELEASED' = 'NONE') => ({ enwr, lien: { status } }) as unknown as Collateral;
const ok = <T,>(data: T) => Promise.resolve({ data, mode: 'live' as const });
const signal = new AbortController().signal;

describe('collateral list loader', () => {
  it('never runs more than n tasks at once', async () => {
    const run = createLimiter(3);
    let active = 0, peak = 0;
    const task = () => { active++; peak = Math.max(peak, active); return new Promise<void>((r) => setTimeout(() => { active--; r(); }, 5)); };
    await Promise.all(Array.from({ length: 12 }, () => run(task)));
    expect(peak).toBe(3);
  });

  it('keeps going after a task fails', async () => {
    const run = createLimiter(1);
    const results = await Promise.allSettled([run(() => Promise.reject(new Error('x'))), run(() => Promise.resolve(2))]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'fulfilled']);
  });

  it('splits a 25-row page into five chunks of five', () => {
    expect(chunkOffsets(25)).toEqual([25, 30, 35, 40, 45]);
    expect(CHUNK_SIZE).toBe(5);
  });

  it('asks for one chunk with its own timeout and turns a failure into an error chunk', async () => {
    const collateral = vi.fn<ListDeps['collateral']>(() => ok({ items: [col('A')], nextCursor: '10' }));
    const deps: ListDeps = { collateral, loans: () => ok({ items: [] }) };
    expect(await fetchChunk(deps, createLimiter(1), 5, signal)).toEqual({ offset: 5, items: [col('A')], more: true });
    expect(collateral).toHaveBeenCalledWith({ cursor: '5', limit: '5' }, signal, 10_000);
    const failing: ListDeps = { ...deps, collateral: () => Promise.reject(new ApiClientError('NETWORK', 0)) };
    const c = await fetchChunk(failing, createLimiter(1), 0, signal);
    expect(c.error?.code).toBe('NETWORK');
    expect(c.items).toBeUndefined();
  });

  it('lists pledged receipts from the ledger lien status, not the loan status', async () => {
    const loans: Record<string, Loan[]> = {
      SANCTIONED: [{ enwr: 'E1' } as Loan],
      DISBURSED: [{ enwr: 'E2' } as Loan, { enwr: 'E1' } as Loan, { enwr: 'E3' } as Loan],
    };
    const deps: ListDeps = {
      loans: (s) => (s === 'REPAID' ? Promise.reject(new ApiClientError('NETWORK', 0)) : ok({ items: loans[s] ?? [] })),
      collateral: (q) => (q.enwr === 'E3' ? Promise.reject(new ApiClientError('NETWORK', 0)) : ok({ items: [col(q.enwr!, q.enwr === 'E2' ? 'RELEASED' : 'ACTIVE')] })),
    };
    expect((await fetchPledged(deps, createLimiter(2), signal)).map((c) => c.enwr)).toEqual(['E1']);
  });
});
