'use client';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Landmark, LogIn, LogOut, PackageSearch } from 'lucide-react';
import { DATA_SOURCE, api, getConn, resolveBase, subscribeConn, type ConnState } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';
import { formatCount, formatDateTimeIST } from '@/lib/format';

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

const NAV = [
  { href: '/collateral', label: 'Collateral', icon: PackageSearch, match: (p: string) => p.startsWith('/collateral') },
  { href: '/loans', label: 'Loans', icon: Landmark, match: (p: string) => p.startsWith('/loans') },
];

function Header() {
  const pathname = usePathname();
  const { session, logout } = useAuth();
  return (
    <header className="border-b border-line bg-surface shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/collateral" className="flex items-center gap-3 no-underline" style={{ color: 'var(--ink)' }}>
          <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white"><Landmark className="h-5 w-5" /></span>
          <span className="flex flex-col leading-tight">
            <span className="text-[17px] font-semibold tracking-tight">Subarnarekha Krishi Bank</span>
            <span className="text-xs font-medium uppercase tracking-wider text-ink-3">Underwriting console</span>
          </span>
        </Link>
        <nav aria-label="Main" className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
          {NAV.map(({ href, label, icon: Icon, match }) => {
            const active = match(pathname);
            return (
              <Link key={href} href={href} aria-current={active ? 'page' : undefined}
                className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-md px-3.5 text-sm font-medium no-underline transition-colors hover:bg-surface-2"
                style={{ color: active ? 'var(--accent-text)' : 'var(--ink-2)', background: active ? 'color-mix(in srgb, var(--accent-text) 9%, var(--surface))' : undefined }}>
                <Icon className="h-4 w-4" aria-hidden />{label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <LedgerStatusPill />
          {session ? (
            <span className="flex items-center gap-3 text-sm">
              <span className="hidden text-ink-2 sm:inline">{session.user.displayName}</span>
              <button className="btn !min-h-8 !px-2.5" onClick={logout} aria-label="Sign out"><LogOut className="h-4 w-4" aria-hidden />Sign out</button>
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
      <Inner>{children}</Inner>
    </AuthProvider>
  );
}

function Inner({ children }: { children: ReactNode }) {
  useConnectionWatch();
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-sm focus:bg-surface focus:p-2">Skip to content</a>
      <Banners />
      <Header />
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
