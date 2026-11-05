'use client';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Boxes, ClipboardList, FileCheck2, Keyboard, LayoutDashboard, LogIn, LogOut, Scale, Sprout, X, type LucideIcon } from 'lucide-react';
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

  const dot = tone === 'idle' ? 'bg-ink-3' : 'bg-current';
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
        <div className="banner" data-tone="muted" data-testid="mock-banner">
          <strong className="font-semibold text-ink">Mock data.</strong> This build reads fixtures from the mock gateway. Transaction IDs start with FIXTURE- and are not on a ledger.
        </div>
      )}
      {conn.mode === 'index-only' && (
        <div role="status" className="banner" data-tone="warn" data-testid="offline-banner">
          <strong className="font-semibold text-warn">The ledger node is asleep.</strong> You are seeing the last indexed state. Actions that write to the ledger are paused.
        </div>
      )}
      {conn.mode === 'offline' && (
        <div role="alert" className="banner" data-tone="danger">
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

const NAV_ICON: Record<string, LucideIcon> = { '/': LayoutDashboard, '/intake': Scale, '/lots': Boxes, '/orders': ClipboardList, '/collateral': FileCheck2 };
const isActive = (href: string, pathname: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3 no-underline">
      <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-2 text-white"><Sprout className="h-5 w-5" /></span>
      <span className="flex flex-col leading-tight">
        <span className="text-[15px] font-semibold tracking-tight">Kharagpur Krishak Sanghati</span>
        <span className="text-xs font-medium uppercase tracking-wider opacity-60">FPO07 console</span>
      </span>
    </Link>
  );
}

/** Persistent left sidebar (large screens). Small screens get the same links in the top bar. */
function Sidebar() {
  const pathname = usePathname();
  const { session, logout } = useAuth();
  const nav = session ? navFor(session.user.role) : [];
  if (!session) return null;
  return (
    <aside className="sidebar hidden w-64 shrink-0 flex-col lg:flex">
      <div className="sticky top-0 flex h-dvh flex-col gap-6 px-4 py-5">
        <Brand />
        <nav aria-label="Main" className="flex flex-col gap-1">
          {nav.map(({ href, label }) => {
            const Icon = NAV_ICON[href] ?? LayoutDashboard;
            return (
              <Link key={href} href={href} aria-current={isActive(href, pathname) ? 'page' : undefined} className="sidenav inline-flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium no-underline transition-colors">
                <Icon className="h-[18px] w-[18px]" aria-hidden />{label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
          <p className="font-medium">{session.user.displayName}</p>
          <p className="text-xs opacity-70">{ROLE_LABEL[session.user.role] ?? session.user.role}</p>
          <button className="btn !mt-3 !min-h-9 w-full" onClick={logout} aria-label="Sign out"><LogOut className="h-4 w-4" aria-hidden />Sign out</button>
        </div>
      </div>
    </aside>
  );
}

function Header({ onShortcuts }: { onShortcuts: () => void }) {
  const pathname = usePathname();
  const { session, logout } = useAuth();
  const nav = session ? navFor(session.user.role) : [];
  return (
    <header className="border-b border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6">
        <Link href="/" className={`flex items-baseline gap-2 no-underline ${session ? 'lg:hidden' : ''}`} style={{ color: 'var(--ink)' }}>
          <span className="text-base font-semibold tracking-tight">Kharagpur Krishak Sanghati</span>
          <span className="hidden text-sm text-ink-2 sm:inline">FPO07 console</span>
        </Link>
        {session && (
          <nav aria-label="Main" className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto lg:hidden">
            {nav.map(({ href, label }) => {
              const active = isActive(href, pathname);
              return (
                <Link key={href} href={href} aria-current={active ? 'page' : undefined}
                  className="inline-flex min-h-10 items-center whitespace-nowrap rounded-md px-3 text-sm font-medium no-underline"
                  style={{ color: active ? 'var(--accent-text)' : 'var(--ink-2)', background: active ? 'color-mix(in srgb, var(--accent-text) 10%, transparent)' : 'transparent' }}>
                  {label}
                </Link>
              );
            })}
          </nav>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <LedgerStatusPill />
          <button className="btn !min-h-8 !px-2" onClick={onShortcuts} aria-label="Keyboard shortcuts"><Keyboard className="h-4 w-4" aria-hidden /></button>
          {session ? (
            <span className="flex items-center gap-2 text-sm lg:hidden">
              <span className="hidden text-ink-2 sm:inline">{session.user.displayName} · {ROLE_LABEL[session.user.role] ?? session.user.role}</span>
              <button className="btn !min-h-8 !px-2" onClick={logout} aria-label="Sign out"><LogOut className="h-4 w-4" aria-hidden />Sign out</button>
            </span>
          ) : session === null ? (
            <Link href="/login" className="btn"><LogIn className="h-4 w-4" aria-hidden />Sign in</Link>
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
      <div className="flex min-w-0 flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header onShortcuts={() => setHelp(true)} />
          <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
          <footer className="border-t border-line bg-surface">
            <p className="mx-auto max-w-7xl px-4 py-4 text-xs text-ink-2 sm:px-6">{FOOTER_TEXT}</p>
          </footer>
        </div>
      </div>
      <ActivityToasts />
      <ShortcutOverlay open={help} onClose={() => setHelp(false)} />
    </div>
  );
}
