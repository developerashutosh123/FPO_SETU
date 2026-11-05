'use client';
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import type { StreamEvent } from '@/contract/contract';
import { useLedgerStream } from './useLedgerStream';

export type LedgerSignal = { type: 'event'; event: StreamEvent } | { type: 'poll' };
type Listener = (s: LedgerSignal) => void;
const Ctx = createContext<{ subscribe: (l: Listener) => () => void }>({ subscribe: () => () => {} });

/** One event stream for the whole app (PORTAL_COMMON.md section B). Views subscribe with useLedgerSignal. */
export function LedgerEventsProvider({ children }: { children: ReactNode }) {
  const listeners = useRef(new Set<Listener>());
  const subscribe = useRef((l: Listener) => { listeners.current.add(l); return () => { listeners.current.delete(l); }; }).current;
  useLedgerStream({
    onEvent: (event) => listeners.current.forEach((l) => l({ type: 'event', event })),
    onPoll: () => listeners.current.forEach((l) => l({ type: 'poll' })),
  });
  return <Ctx.Provider value={{ subscribe }}>{children}</Ctx.Provider>;
}

export function useLedgerSignal(handler: Listener) {
  const { subscribe } = useContext(Ctx);
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribe((s) => ref.current(s)), [subscribe]);
}

/** Calls `reload` (debounced 1.2 s) when the stream reports an event `match` accepts, or on every index-only poll. */
export function useReloadOnLedger(reload: () => void, match: (e: StreamEvent) => boolean = () => true) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useLedgerSignal((s) => {
    if (s.type === 'event' && !match(s.event)) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(reload, 1200);
  });
}
