'use client';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Landmark, LogIn, LogOut, PackageSearch } from 'lucide-react';
import { FOOTER_TEXT } from '@/contract/contract';
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

const NAV = [
  { href: '/collateral', label: 'Collateral', icon: PackageSearch, match: (p: string) => p.startsWith('/collateral') },
  { href: '/loans', label: 'Loans', icon: Landmark, match: (p: string) => p.startsWith('/loans') },
];

function Header() {
  const pathname = usePathname();
  const { session, logout } = useAuth();
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/collateral" className="flex items-baseline gap-2 no-underline" style={{ color: 'var(--ink)' }}>
          <span className="text-lg font-semibold tracking-tight">Subarnarekha Krishi Bank</span>
          <span className="text-sm text-ink-2">Underwriting</span>
        </Link>
        <nav aria-label="Main" className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
          {NAV.map(({ href, label, icon: Icon, match }) => {
            const active = match(pathname);
            return (
              <Link key={href} href={href} aria-current={active ? 'page' : undefined}
                className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-sm px-3 text-sm font-medium no-underline"
                style={{ color: active ? 'var(--accent-text)' : 'var(--ink-2)', background: active ? 'color-mix(in srgb, var(--accent-text) 10%, transparent)' : 'transparent' }}>
                <Icon className="h-4 w-4" aria-hidden />{label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <LedgerStatusPill />
          {session ? (
            <span className="flex items-center gap-2 text-sm">
              <span className="text-ink-2">{session.user.displayName}</span>
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
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">{children}</main>
      <footer className="border-t border-line bg-surface">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-ink-2">{FOOTER_TEXT}</p>
      </footer>
    </div>
  );
}
