import type { Collateral, Loan, Page } from '@/contract/contract';
import { asApiError, type ApiClientError, type ApiResult } from './api';

/**
 * The unfiltered collateral list. The gateway values every receipt one by one (lot, price basis, lien, proof, attestor
 * reputation; about 0.35 s each on the live ledger), so one request for a 25-row page takes ~9 s and the default 50-row
 * page outlives the request timeout. Instead a page is fetched as small chunks, a few at a time, each with its own short
 * timeout: the rows arrive in about the time of one chunk, and a slow chunk fails on its own instead of hanging the page.
 */
export const PAGE_SIZE = 25;
export const CHUNK_SIZE = 5;
export const MAX_IN_FLIGHT = 6;
export const CHUNK_TIMEOUT_MS = 10_000;
/** Receipts under an active lien listed first, so the "already pledged" state is visible without scrolling. */
export const PLEDGED_MAX = 5;
/** Loan states in which the lien is still active (pledge-lien: released only by ReleaseLien). Newest action first. */
const PLEDGED_LOAN_STATES = ['SANCTIONED', 'DISBURSED', 'REPAID'] as const;

export interface ListDeps {
  collateral: (query: { enwr?: string; cursor?: string; limit?: string }, signal: AbortSignal, timeoutMs: number) => Promise<ApiResult<Page<Collateral>>>;
  loans: (status: string, signal: AbortSignal, limit: string, timeoutMs: number) => Promise<ApiResult<Page<Loan>>>;
}

export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;

/** Runs at most `n` tasks at once, starting them in the order they were queued. */
export function createLimiter(n: number): Limiter {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    while (active < n && queue.length) { active++; queue.shift()!(); }
  };
  return <T,>(task: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => { Promise.resolve().then(task).then(resolve, reject).finally(() => { active--; next(); }); });
      next();
    });
}

export interface Chunk { offset: number; items?: Collateral[]; more?: boolean; error?: ApiClientError }

export const chunkOffsets = (start: number) => Array.from({ length: PAGE_SIZE / CHUNK_SIZE }, (_, i) => start + i * CHUNK_SIZE);

/** One chunk of the list. Never rejects: a failure comes back as `error` so the rest of the page still shows. */
export async function fetchChunk(deps: ListDeps, run: Limiter, offset: number, signal: AbortSignal): Promise<Chunk> {
  try {
    const r = await run(() => deps.collateral({ cursor: String(offset), limit: String(CHUNK_SIZE) }, signal, CHUNK_TIMEOUT_MS));
    return { offset, items: r.data.items, more: r.data.nextCursor !== undefined };
  } catch (e) {
    return { offset, error: asApiError(e) };
  }
}

/**
 * Up to PLEDGED_MAX receipts whose lien is active on the ledger. The loans list only says which e-NWRs to look up; each
 * one is then read through /collateral, so the valuation and the lien status shown come from the ledger, not from the loan.
 * Best effort: a failed lookup is left out.
 */
export async function fetchPledged(deps: ListDeps, run: Limiter, signal: AbortSignal): Promise<Collateral[]> {
  const pages = await Promise.all(PLEDGED_LOAN_STATES.map((s) =>
    run(() => deps.loans(s, signal, String(PLEDGED_MAX), CHUNK_TIMEOUT_MS)).then((r) => r.data.items, () => [] as Loan[])));
  const enwrs = [...new Set(pages.flat().map((l) => l.enwr))].slice(0, PLEDGED_MAX);
  const found = await Promise.all(enwrs.map((enwr) =>
    run(() => deps.collateral({ enwr }, signal, CHUNK_TIMEOUT_MS)).then((r) => r.data.items[0], () => undefined)));
  return found.filter((c): c is Collateral => c?.lien.status === 'ACTIVE');
}
