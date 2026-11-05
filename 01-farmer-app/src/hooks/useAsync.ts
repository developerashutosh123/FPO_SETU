import { useCallback, useEffect, useRef, useState } from 'react';
import { asApiError, type ApiClientError } from '../lib/errors';
import { useLive } from '../lib/live';

export interface AsyncState<T> { data: T | null; error: ApiClientError | null; loading: boolean; reload: () => void }

/** Runs `fn` on mount, on `deps` change and whenever the ledger stream says something of mine changed. Keeps the old data while reloading. */
export function useAsync<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[]): AsyncState<T> {
  const { version } = useLive();
  const [state, setState] = useState<{ data: T | null; error: ApiClientError | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    const ac = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    fnRef.current(ac.signal).then(
      (data) => { if (!ac.signal.aborted) setState({ data, error: null, loading: false }); },
      (e) => { if (!ac.signal.aborted) setState((s) => ({ data: s.data, error: asApiError(e), loading: false })); },
    );
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
