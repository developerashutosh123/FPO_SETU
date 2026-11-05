'use client';
import type { LotListItem } from '@/contract/contract';
import { api, type ApiResult } from './api';
import { useApi } from './useApi';
import { useReloadOnLedger } from './ledgerEvents';

const PAGE = '200';
const MAX_PAGES = 5;

/** Every lot the role may list, 200 at a time, at most 1,000. Lot lists carry no names or phones (contract section 8). */
export async function loadAllLots(signal: AbortSignal): Promise<ApiResult<{ items: LotListItem[]; truncated: boolean }>> {
  const items: LotListItem[] = [];
  let cursor: string | undefined;
  let mode: ApiResult<unknown>['mode'] = 'live';
  for (let i = 0; i < MAX_PAGES; i++) {
    const r = await api.lots({ cursor, limit: PAGE }, signal);
    mode = r.mode;
    items.push(...r.data.items);
    cursor = r.data.nextCursor;
    if (!cursor) return { data: { items, truncated: false }, mode };
  }
  return { data: { items, truncated: true }, mode };
}

/** Loads the lot list and reloads it when the ledger stream reports a lot or order event. */
export function useAllLots() {
  const state = useApi((s) => loadAllLots(s), []);
  useReloadOnLedger(state.reload, (e) => e.sscc !== undefined);
  return state;
}
