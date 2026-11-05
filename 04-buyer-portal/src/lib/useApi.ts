'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LedgerMode } from '@/contract/contract';
import { asApiError, type ApiClientError, type ApiResult } from './api';

export interface ApiState<T> { data?: T; error?: ApiClientError; loading: boolean; mode?: LedgerMode; reload: () => void }

/** Loads once per `deps` change and on reload(). Keeps the previous data on screen while reloading. */
export function useApi<T>(load: (signal: AbortSignal) => Promise<ApiResult<T>>, deps: unknown[], opts: { refreshMs?: number } = {}): ApiState<T> {
  const [state, setState] = useState<{ data?: T; error?: ApiClientError; loading: boolean; mode?: LedgerMode }>({ loading: true });
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const ac = new AbortController();
    setState((s) => ({ ...s, loading: s.data === undefined }));
    loadRef.current(ac.signal)
      .then((r) => { if (!ac.signal.aborted) setState({ data: r.data, mode: r.mode, loading: false }); })
      .catch((e) => { if (!ac.signal.aborted) setState((s) => ({ data: s.data, mode: s.mode, error: asApiError(e), loading: false })); });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  useEffect(() => {
    if (!opts.refreshMs) return;
    const id = setInterval(() => setTick((t) => t + 1), opts.refreshMs);
    return () => clearInterval(id);
  }, [opts.refreshMs]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
