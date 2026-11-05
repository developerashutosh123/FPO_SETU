'use client';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Keyboard, LogIn, LogOut, X } from 'lucide-react';
import { FOOTER_TEXT, type StreamEvent } from '@/contract/contract';
import { DATA_SOURCE, api, getConn, resolveBase, subscribeConn, type ConnState } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';
import { navFor, ROLE_LABEL } from '@/lib/access';
import { formatCount, formatDateTimeIST } from '@/lib/format';
import { LedgerEventsProvider, useLedgerSignal } from '@/lib/ledgerEvents';
import { govTxUrl } from '@/lib/portals';

const SERVER_CONN: ConnState = { mode: 'live', base: null, probedAt: 0, health: null };
export const useConn = () => useSyncExternalStore(subscribeConn, getConn, () => SERVER_CONN);
/** True only when the gateway is live. Every write button uses this and explains why it is off (contract 9.3 item 3). */
export const useWritesEnabled = () => useConn().mode === 'live';
export const WRITES_PAUSED_REASON = 'The ledger node is asleep. Actions that write to the ledger are paused.';

/** Probes the gateway on mount and every 30 s so the pill and banner stay current. */
function useConnectionWatch() {
  useEffect(() => {
    void resolveBase();
    const id = setInterval(() => void resolveBase(true), 30_000);
    return () => clearInterval(id);
  }, []);
}

export function LedgerStatusPill() {
  const conn = useConn();
  const checked = conn.probedAt > 0;
  const [lastIndexedAt, setLastIndexedAt] = useState<string | undefined>();
  useEffect(() => {
    if (conn.mode !== 'index-only') return;
    const ac = new AbortController();
    api.ledgerStatus(ac.signal).then((r) => setLastIndexedAt(r.data.lastIndexedAt)).catch(() => {});
    return () => ac.abort();
  }, [conn.mode]);
  const h = conn.health?.channels;
  const n = (c: 'trace-channel' | 'finance-channel' | 'trade-channel') => (h?.[c] ? `#${formatCount(h[c]!.height)}` : '–');

  let tone: 'ok' | 'warn' | 'danger' | 'idle' = 'idle';
  let text = 'Checking ledger…';
  if (checked && conn.mode === 'live') { tone = 'ok'; text = `Live · trace ${n('trace-channel')} · finance ${n('finance-channel')} · trade ${n('trade-channel')}`; }
  else if (checked && conn.mode === 'index-only') {
    tone = 'warn';
    text = `Index-only · last block ${n('trace-channel')}${lastIndexedAt ? ` at ${formatDateTimeIST(lastIndexedAt)}` : ''}`;
  } else if (checked) { tone = 'danger'; text = 'Ledger offline'; }

  const dot = tone === 'ok' ? 'bg-ok' : tone === 'warn' ? 'bg-warn' : tone === 'danger' ? 'bg-danger' : 'bg-ink-3';
  return (
    <span className="chip" data-tone={tone === 'idle' ? undefined : tone} role="status" aria-live="polite" data-testid="ledger-pill">
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} aria-hidden />
      {text}
    </span>
  );
}

function Banners() {
  const conn = useConn();
  return (
    <>
      {DATA_SOURCE === 'mock' && (
        <div className="border-b border-line bg-surface px-4 py-1.5 text-center text-xs text-ink-2" data-testid="mock-banner">
          <strong className="font-semibold text-ink">Mock data.</strong> This build reads fixtures from the mock gateway. Transaction IDs start with FIXTURE- and are not on a ledger.
        </div>
      )}
      {conn.mode === 'index-only' && (
        <div role="status" className="border-b px-4 py-2 text-center text-sm" style={{ background: 'color-mix(in srgb, var(--warn-text) 12%, var(--surface))', borderColor: 'color-mix(in srgb, var(--warn-text) 40%, transparent)' }} data-testid="offline-banner">
          <strong className="font-semibold text-warn">The ledger node is asleep.</strong> You are seeing the last indexed state. Actions that write to the ledger are paused.
        </div>
      )}
      {conn.mode === 'offline' && (
        <div role="alert" className="border-b px-4 py-2 text-center text-sm" style={{ background: 'color-mix(in srgb, var(--danger-text) 10%, var(--surface))', borderColor: 'color-mix(in srgb, var(--danger-text) 40%, transparent)' }}>
          <strong className="font-semibold text-danger">Cannot reach the ledger or its read-only copy.</strong> Check your connection and reload.
        </div>
      )}
    </>
  );
}

/** Contract 9.3 item 4: toasts from /events/stream. LotStatusChanged is hidden (it is the mirror call, not news). */
const EVENT_TEXT: Partial<Record<StreamEvent['event'], string>> = {
  LotCommissioned: 'commissioned', LotGraded: 'graded', DepositRecorded: 'deposited', ENWRIssued: 'e-NWR issued', LienMarked: 'lien marked', LienReleased: 'lien released',
  OrderCreated: 'order created', PriceAgreed: 'price agreed', CustodyProposed: 'custody proposed', CustodyAccepted: 'custody accepted', QualityAccepted: 'quality accepted',
  SettlementExecuted: 'settled', PatronageDistributed: 'patronage paid', LoanDisbursed: 'loan disbursed', LoanRepaid: 'loan repaid', LotTransformed: 'sent to processing',
};
interface Toast { id: number; text: string; txId: string }
function ActivityToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useLedgerSignal((s) => {
    if (s.type !== 'event') return;
    const verb = EVENT_TEXT[s.event.event];
    if (!verb) return;
    const subject = s.event.sscc ? `Lot …${s.event.sscc.slice(-6)}` : s.event.orderId ?? s.event.enwr ?? 'Ledger';
    const t: Toast = { id: Date.now() + Math.random(), text: `${subject} ${verb}`, txId: s.event.txId };
    setToasts((cur) => [...cur.slice(-2), t]);
    setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== t.id)), 8000);
  });
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-30 flex w-80 flex-col gap-2" aria-live="polite" data-testid="toasts">
      {toasts.map((t) => (
        <div key={t.id} className="card flex items-start justify-between gap-2 px-3 py-2 text-sm shadow-md">
          <span>{t.text} · <a className="mono" href={govTxUrl(t.txId)} target="_blank" rel="noreferrer">tx {t.txId.slice(0, 8)}…</a></span>
          <button className="text-ink-3 hover:text-ink" aria-label="Dismiss" onClick={() => setToasts((cur) => cur.filter((x) => x.id !== t.id))}><X className="h-4 w-4" aria-hidden /></button>
        </div>
      ))}
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ['/', 'Focus the search box on this page'], ['?', 'Show or hide this list'],
  ['W', 'Intake: read the weighbridge'], ['Q', 'Intake: read the quality meter'], ['G', 'Intake: confirm the proposed grade'], ['P', 'Intake: print the label'],
];
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

function ShortcutOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()} data-testid="shortcuts">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Keyboard shortcuts</h2><button className="btn !min-h-8 !px-2" onClick={onClose} aria-label="Close"><X className="h-4 w-4" aria-hidden /></button></div>
        <dl className="mt-3 text-sm">
          {SHORTCUTS.map(([k, d]) => <div key={k} className="flex items-center justify-between gap-4 border-b border-line py-2 last:border-b-0"><dt>{d}</dt><dd><kbd className="kbd">{k}</kbd></dd></div>)}
        </dl>
        <p className="mt-3 text-xs text-ink-3">Shortcuts are ignored while you are typing in a field. New lot (N) is not here: lots are created from the VLE app.</p>
      </div>
    </div>
  );
}

function Header({ onShortcuts }: { onShortcuts: () => void }) {
  const pathname = usePathname();
  const { session, logout } = useAuth();
  const nav = session ? navFor(session.user.role) : [];
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
        <Link href="/" className="flex items-baseline gap-2 no-underline" style={{ color: 'var(--ink)' }}>
          <span className="text-lg font-semibold tracking-tight">Kharagpur Krishak Sanghati</span>
          <span className="text-sm text-ink-2">FPO07 console</span>
        </Link>
        <nav aria-label="Main" className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
          {nav.map(({ href, label }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link key={href} href={href} aria-current={active ? 'page' : undefined}
                className="inline-flex min-h-10 items-center whitespace-nowrap rounded-sm px-3 text-sm font-medium no-underline"
                style={{ color: active ? 'var(--accent-text)' : 'var(--ink-2)', background: active ? 'color-mix(in srgb, var(--accent-text) 10%, transparent)' : 'transparent' }}>
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <LedgerStatusPill />
          <button className="btn !min-h-8 !px-2" onClick={onShortcuts} aria-label="Keyboard shortcuts"><Keyboard className="h-4 w-4" aria-hidden /></button>
          {session ? (
            <span className="flex items-center gap-2 text-sm">
              <span className="text-ink-2">{session.user.displayName} · {ROLE_LABEL[session.user.role] ?? session.user.role}</span>
              <button className="btn !min-h-8 !px-2" onClick={logout} aria-label="Sign out"><LogOut className="h-4 w-4" aria-hidden />Sign out</button>
            </span>
          ) : session === null ? (
            <Link href="/login" className="btn no-underline"><LogIn className="h-4 w-4" aria-hidden />Sign in</Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <LedgerEventsProvider>
        <Inner>{children}</Inner>
      </LedgerEventsProvider>
    </AuthProvider>
  );
}

function Inner({ children }: { children: ReactNode }) {
  useConnectionWatch();
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') setHelp(false);
      if (isTyping(e.target)) return;
      if (e.key === '?') { e.preventDefault(); setHelp((h) => !h); }
      if (e.key === '/') {
        const box = document.querySelector<HTMLInputElement>('[data-search]');
        if (box) { e.preventDefault(); box.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-sm focus:bg-surface focus:p-2">Skip to content</a>
      <Banners />
      <Header onShortcuts={() => setHelp(true)} />
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-5">{children}</main>
      <footer className="border-t border-line bg-surface">
        <p className="mx-auto max-w-7xl px-4 py-4 text-xs text-ink-2">{FOOTER_TEXT}</p>
      </footer>
      <ActivityToasts />
      <ShortcutOverlay open={help} onClose={() => setHelp(false)} />
    </div>
  );
}
