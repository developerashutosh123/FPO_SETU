'use client';
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardList, ExternalLink, LogIn, LogOut, PackageSearch, ScanLine, Sprout, X } from 'lucide-react';
import { shortHash, type LedgerEventName, type StreamEvent } from '@/contract/contract';
import { DATA_SOURCE, api, getConn, resolveBase, subscribeConn, type ConnState } from '@/lib/api';
import { AuthProvider, isBuyerManager, useAuth } from '@/lib/auth';
import { formatCount, formatDateTimeIST } from '@/lib/format';
import { DEMO_MODE, PORTALS, govTxUrl } from '@/lib/portals';
import { useLedgerStream } from '@/lib/stream';

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
    const load = () => api.ledgerStatus(ac.signal).then((r) => setLastIndexedAt(r.data.lastIndexedAt)).catch(() => {});
    void load();
    const id = setInterval(load, 30_000); // index-only mode has no live stream: poll /ledger/status every 30 s (PORTAL_COMMON section B)
    return () => { ac.abort(); clearInterval(id); };
  }, [conn.mode]);
  const h = conn.health?.channels;
  const n = (c: 'trace-channel' | 'finance-channel' | 'trade-channel') => (h?.[c] ? `#${formatCount(h[c]!.height)}` : '–');

  let tone: 'ok' | 'warn' | 'danger' | 'idle' = 'idle';
  let text = 'Checking ledger…';
  // The buyer is a member of trace-channel and trade-channel only, so the pill omits finance-channel (contract section 7).
  if (checked && conn.mode === 'live') { tone = 'ok'; text = `Live · trace ${n('trace-channel')} · trade ${n('trade-channel')}`; }
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

/** Contract 9.3 item 5. Only when NEXT_PUBLIC_DEMO_MODE=true. This portal owns steps 7 (buyer side) and 8 (receive and accept). */
function DemoBar() {
  const pathname = usePathname();
  if (!DEMO_MODE) return null;
  const orderId = /^\/orders\/(ORD-[\w-]+)/.exec(pathname)?.[1];
  let step = 'Step 7 of 10';
  let text = 'Rahul picks a lot from the catalogue';
  let next: { label: string; href: string } = { label: 'Place the order', href: '/orders/new' };
  if (pathname.startsWith('/orders')) {
    text = 'Rahul places the order and agrees the price privately';
    next = { label: 'FPO console submits the same price', href: orderId ? `${PORTALS.fpo}/orders/${orderId}` : PORTALS.fpo };
  } else if (pathname.startsWith('/receive')) {
    step = 'Step 8 of 10';
    text = 'Rahul scans the crate QR, accepts custody and accepts quality';
    next = { label: 'Step 9: the FPO console records the settlement', href: PORTALS.fpo };
  }
  const external = next.href.startsWith('http');
  return (
    <div className="banner" style={{ background: 'color-mix(in srgb, var(--accent-2) 20%, var(--surface))', fontSize: 12.5, color: 'var(--ink)' }} data-testid="demo-bar">
      <strong className="font-semibold">Demo · {step}</strong> · {text} · Next:{' '}
      {external ? <a href={next.href} target="_blank" rel="noreferrer">{next.label} →</a> : <Link href={next.href}>{next.label} →</Link>}
    </div>
  );
}

const EVENT_LABEL: Partial<Record<LedgerEventName, string>> = {
  LotCommissioned: 'Lot commissioned', LotGraded: 'Lot graded', QualityCredentialIssued: 'Quality credential issued', LotTransformed: 'Lot sent to processing',
  OrderCreated: 'Order created', PriceAgreed: 'Price step committed', CustodyProposed: 'Custody proposed', CustodyAccepted: 'Custody accepted',
  ConditionDigestAnchored: 'Cold-chain digest anchored', QualityAccepted: 'Quality accepted', SettlementExecuted: 'Settlement recorded',
  PatronageDistributed: 'Patronage distributed', InputApplied: 'Crop diary entry anchored',
};
/** What the buyer may see (contract 9.4): nothing from finance-channel (liens, loans, e-NWR) and no internal status mirrors. */
export const toastable = (e: StreamEvent) => e.channel !== 'finance-channel' && e.event !== 'LotStatusChanged' && e.event in EVENT_LABEL;

interface Toast { key: string; text: string; txId: string }
/** Contract 9.3 item 4: live activity toasts from /events/stream. The stream carries no PII and no price. */
function ActivityToasts() {
  const { session } = useAuth();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((key: string) => setToasts((t) => t.filter((x) => x.key !== key)), []);
  const signedIn = !!session && isBuyerManager(session.user);
  useLedgerStream((e) => {
    if (!toastable(e)) return;
    const subject = e.orderId ? `order ${e.orderId}` : e.sscc ? `lot …${e.sscc.slice(-6)}` : '';
    const key = `${e.txId}-${e.event}`;
    setToasts((t) => [{ key, text: `${EVENT_LABEL[e.event]}${subject ? ` · ${subject}` : ''}`, txId: e.txId }, ...t.filter((x) => x.key !== key)].slice(0, 3));
    setTimeout(() => dismiss(key), 8000);
  }, signedIn);
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-3 left-3 z-30 flex w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-2" aria-live="polite" data-testid="toasts">
      {toasts.map((t) => (
        <div key={t.key} className="card pointer-events-auto flex items-start gap-2 p-3 text-sm shadow-md" data-testid="toast">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{t.text}</p>
            <a href={govTxUrl(t.txId)} target="_blank" rel="noreferrer" className="mono text-xs">tx {shortHash(t.txId, 8)} <ExternalLink className="inline h-3 w-3" aria-hidden /></a>
          </div>
          <button className="rounded-sm p-1 text-ink-3 hover:text-ink" onClick={() => dismiss(t.key)} aria-label="Dismiss"><X className="h-4 w-4" aria-hidden /></button>
        </div>
      ))}
    </div>
  );
}

const NAV = [
  { href: '/', label: 'Catalogue', icon: PackageSearch, match: (p: string) => p === '/' || p.startsWith('/lots') },
  { href: '/orders', label: 'Orders', icon: ClipboardList, match: (p: string) => p.startsWith('/orders') },
  { href: '/receive', label: 'Receive', icon: ScanLine, match: (p: string) => p.startsWith('/receive') },
];

function Header() {
  const pathname = usePathname();
  const { session, logout } = useAuth();
  return (
    <header className="border-b border-line bg-surface shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-3 no-underline" style={{ color: 'var(--ink)' }}>
          <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white"><Sprout className="h-5 w-5" /></span>
          <span className="flex flex-col leading-tight">
            <span className="text-[17px] font-semibold tracking-tight">Gangetic Fresh Foods</span>
            <span className="text-xs font-medium uppercase tracking-wider text-ink-3">Sourcing portal</span>
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
      <DemoBar />
      <Banners />
      <Header />
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
      <ActivityToasts />
    </div>
  );
}
