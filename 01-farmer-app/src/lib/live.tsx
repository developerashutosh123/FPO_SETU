import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { StreamEvent } from '../contract/contract';
import { useTranslation } from 'react-i18next';
import { useSession } from './session';
import { openLedgerStream } from './stream';

export interface Toast { id: string; text: string; txId: string }
interface Ctx {
  /** Bumped when something I own changed on the ledger; screens reload when it changes. */
  version: number;
  toasts: Toast[];
  dismiss: (id: string) => void;
  /** Screens tell the stream which lots are mine (the stream carries no farmer identity). */
  watch: (lots: { sscc: string; humanRef: string }[]) => void;
}
const LiveCtx = createContext<Ctx>({ version: 0, toasts: [], dismiss: () => {}, watch: () => {} });

const TOAST_EVENTS = new Set(['LotCommissioned', 'LotGraded', 'DepositRecorded', 'LienMarked', 'LienReleased', 'SettlementExecuted', 'PatronageDistributed', 'CustodyAccepted']);
/** A fresh connection can replay recent events; those are history, not news. */
const REPLAY_WINDOW_MS = 2000;

export function LiveProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const { t } = useTranslation();
  const [version, setVersion] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const mine = useRef(new Map<string, string>());
  const seen = useRef(new Set<string>());
  const openedAt = useRef(0);
  const tRef = useRef(t);
  tRef.current = t;

  const watch = useCallback((lots: { sscc: string; humanRef: string }[]) => { for (const l of lots) mine.current.set(l.sscc, l.humanRef); }, []);
  const dismiss = useCallback((id: string) => setToasts((x) => x.filter((y) => y.id !== id)), []);

  useEffect(() => {
    if (!user) return;
    const onEvent = (e: StreamEvent) => {
      if (!e.sscc || !mine.current.has(e.sscc) || seen.current.has(e.txId + e.event)) return;
      seen.current.add(e.txId + e.event);
      if (Date.now() - openedAt.current < REPLAY_WINDOW_MS) return;
      setVersion((v) => v + 1);
      if (!TOAST_EVENTS.has(e.event)) return;
      const ref = mine.current.get(e.sscc)!;
      const id = `${e.txId}-${e.event}`;
      setToasts((x) => [...x.slice(-2), { id, txId: e.txId, text: tRef.current(`toast.${e.event}`, { ref, defaultValue: tRef.current('toast.default', { ref }) }) }]);
      setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 8000);
    };
    const close = openLedgerStream({ onEvent, onOpen: () => { openedAt.current = Date.now(); }, onPoll: () => setVersion((v) => v + 1) });
    return close;
  }, [user]);

  const value = useMemo(() => ({ version, toasts, dismiss, watch }), [version, toasts, dismiss, watch]);
  return <LiveCtx.Provider value={value}>{children}</LiveCtx.Provider>;
}
export const useLive = () => useContext(LiveCtx);
