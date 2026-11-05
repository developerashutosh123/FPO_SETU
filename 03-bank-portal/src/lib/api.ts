import type {
  Collateral, ErrorCode, TxDetail, HealthResponse, LedgerMode, LedgerStatus, LienRequest, LoginResponse, Loan, Page, Receipted, RepayRequest,
} from '@/contract/contract';
import { ERROR_MESSAGES, type ClientErrorCode } from './errors';

/**
 * The only module that talks to the gateway (PORTAL_COMMON.md section B). Runs in the browser and on the server (the tx and block pages are server-rendered).
 *  - mock: the mock gateway on :4010. live: NEXT_PUBLIC_API_URL.
 *  - GET /health is probed with an 8 s timeout and retried once; only when both attempts fail do requests go to NEXT_PUBLIC_READ_API_URL
 *    and the mode becomes index-only. A single slow or dropped request on the free ngrok tunnel re-probes instead of failing over.
 *  - Every response's X-Ledger-Mode header is recorded.
 */
const trim = (s: string | undefined) => (s ?? '').replace(/\/+$/, '');
export const DATA_SOURCE: 'mock' | 'live' = process.env.NEXT_PUBLIC_DATA_SOURCE === 'live' ? 'live' : 'mock';
export const PRIMARY_URL = DATA_SOURCE === 'mock' ? trim(process.env.NEXT_PUBLIC_MOCK_URL) || 'http://localhost:4010' : trim(process.env.NEXT_PUBLIC_API_URL);
export const READ_API_URL = trim(process.env.NEXT_PUBLIC_READ_API_URL);

const HEALTH_TIMEOUT_MS = 8000;
const HEALTH_ATTEMPTS = 2;
const REQUEST_TIMEOUT_MS = 15000;
const PROBE_TTL_MS = 15000;

// ---------- connection state (subscribed to by the header pill and the offline banner) ----------
export type ConnMode = LedgerMode | 'offline';
export interface ConnState { mode: ConnMode; base: string | null; probedAt: number; health: HealthResponse | null }
let conn: ConnState = { mode: 'live', base: null, probedAt: 0, health: null };
const listeners = new Set<() => void>();
function setConn(patch: Partial<ConnState>) {
  const next = { ...conn, ...patch };
  if (next.mode === conn.mode && next.base === conn.base && next.health === conn.health && next.probedAt === conn.probedAt) return;
  conn = next;
  listeners.forEach((l) => l());
}
export const getConn = () => conn;
export function subscribeConn(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

// ---------- errors ----------
export class ApiClientError extends Error {
  constructor(public code: ClientErrorCode, public status: number, public serverMessage?: string, public txId?: string, public details?: unknown) {
    super(ERROR_MESSAGES[code] ?? ERROR_MESSAGES.UNKNOWN);
    this.name = 'ApiClientError';
  }
}
export const asApiError = (e: unknown): ApiClientError => (e instanceof ApiClientError ? e : new ApiClientError('UNKNOWN', 0, e instanceof Error ? e.message : String(e)));

// ---------- session token (browser only) ----------
export const SESSION_KEY = 'fposetu.bank.session';
function getToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try { return (JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? 'null') as { token?: string } | null)?.token; } catch { return undefined; }
}

// ---------- transport ----------
/** Free ngrok domains answer browsers with an interstitial unless this header is sent (RUNBOOK section 3). Only for ngrok hosts. */
const NGROK_HOST = /\.ngrok(-free)?\.(app|dev|io)$/;
export function extraHeadersFor(base: string): Record<string, string> {
  try { return NGROK_HOST.test(new URL(base).hostname) ? { 'ngrok-skip-browser-warning': '1' } : {}; } catch { return {}; }
}

async function timedFetch(url: string, init: RequestInit, ms: number, outer?: AbortSignal): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new DOMException('timeout', 'TimeoutError')), ms);
  const onOuter = () => ac.abort(outer?.reason);
  outer?.addEventListener('abort', onOuter);
  try { return await fetch(url, { ...init, signal: ac.signal, cache: 'no-store' }); } finally { clearTimeout(timer); outer?.removeEventListener('abort', onOuter); }
}

/** GET /health on the primary gateway, retried once. An interstitial page (HTML, not JSON) counts as a failure. */
async function probePrimary(): Promise<{ health: HealthResponse; mode: LedgerMode } | null> {
  for (let i = 0; i < HEALTH_ATTEMPTS; i++) {
    try {
      const res = await timedFetch(`${PRIMARY_URL}/health`, { headers: { accept: 'application/json', ...extraHeadersFor(PRIMARY_URL) } }, HEALTH_TIMEOUT_MS);
      if (res.ok) {
        const health = (await res.json()) as HealthResponse;
        return { health, mode: (res.headers.get('x-ledger-mode') as LedgerMode | null) ?? health.ledgerMode };
      }
    } catch { /* retry, then fall through to the read-only API */ }
  }
  return null;
}

let probing: Promise<string | null> | null = null;
/** Picks the base URL. Probes the primary gateway's /health (8 s, one retry), falls back to the read-only API. Cached for 15 s. */
export function resolveBase(force = false): Promise<string | null> {
  if (!force && conn.base && Date.now() - conn.probedAt < PROBE_TTL_MS) return Promise.resolve(conn.base);
  if (probing) return probing;
  probing = (async () => {
    const primary = PRIMARY_URL ? await probePrimary() : null;
    if (primary) {
      setConn({ mode: primary.mode, base: PRIMARY_URL, probedAt: Date.now(), health: primary.health });
      return PRIMARY_URL;
    }
    if (READ_API_URL) {
      try {
        const res = await timedFetch(`${READ_API_URL}/health`, { headers: { accept: 'application/json', ...extraHeadersFor(READ_API_URL) } }, REQUEST_TIMEOUT_MS);
        if (res.ok) {
          const health = (await res.json()) as HealthResponse;
          setConn({ mode: 'index-only', base: READ_API_URL, probedAt: Date.now(), health });
          return READ_API_URL;
        }
      } catch { /* both unreachable */ }
    }
    setConn({ mode: 'offline', base: null, probedAt: Date.now(), health: null });
    return null;
  })().finally(() => { probing = null; });
  return probing;
}

export interface ApiResult<T> { data: T; mode: LedgerMode }
/** timeoutMs overrides the 15 s per-request timeout, for list chunks that should give up sooner. */
interface RequestOpts { auth?: boolean; method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal; timeoutMs?: number }

async function parseError(res: Response): Promise<ApiClientError> {
  let body: { error?: { code?: ErrorCode; message?: string; txId?: string; details?: unknown } } | null = null;
  try { body = await res.json(); } catch { /* not JSON, e.g. an interstitial page */ }
  const e = body?.error;
  return new ApiClientError(e?.code ?? 'UNKNOWN', res.status, e?.message, e?.txId, e?.details);
}

export async function request<T>(path: string, opts: RequestOpts = {}): Promise<ApiResult<T>> {
  let base = await resolveBase();
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!base) throw new ApiClientError('NETWORK', 0);
    const headers: Record<string, string> = { accept: 'application/json', ...extraHeadersFor(base) };
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    const token = opts.auth ? getToken() : undefined;
    if (token) headers.authorization = `Bearer ${token}`;
    try {
      const res = await timedFetch(base + path, { method: opts.method ?? 'GET', headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) }, opts.timeoutMs ?? REQUEST_TIMEOUT_MS, opts.signal);
      const mode = (res.headers.get('x-ledger-mode') as LedgerMode | null) ?? (base === READ_API_URL ? 'index-only' : 'live');
      if (conn.mode !== mode && base === conn.base) setConn({ mode });
      if (!res.ok) {
        const err = await parseError(res);
        if (err.code === 'ERR_UNAUTHENTICATED' && opts.auth && typeof window !== 'undefined') window.dispatchEvent(new Event('bank:unauthenticated'));
        throw err;
      }
      return { data: (await res.json()) as T, mode };
    } catch (e) {
      if (e instanceof ApiClientError) throw e;
      if (opts.signal?.aborted && !(opts.signal.reason instanceof DOMException && opts.signal.reason.name === 'TimeoutError')) throw e;
      // network error or timeout on the primary gateway: re-probe /health (which only falls back to the read-only API after two
      // failed probes) and try once more on whatever it picks, so one dropped request on the tunnel does not flip us to index-only
      if (attempt === 0 && base === PRIMARY_URL) {
        base = await resolveBase(true);
        continue;
      }
      // the gateway's /health still answers, so this request alone failed: keep the connection state as it is
      if (base !== PRIMARY_URL || conn.base !== PRIMARY_URL) setConn({ mode: 'offline', base: null, probedAt: Date.now() });
      throw new ApiClientError('NETWORK', 0);
    }
  }
  throw new ApiClientError('NETWORK', 0);
}

// ---------- typed calls ----------
const q = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v) as [string, string][]).toString();
  return p ? `?${p}` : '';
};
const enc = encodeURIComponent;
export const api = {
  health: () => request<HealthResponse>('/health'),
  ledgerStatus: (signal?: AbortSignal) => request<LedgerStatus>('/ledger/status', { signal }),
  ledgerTx: (txId: string, signal?: AbortSignal) => request<TxDetail>(`/ledger/tx/${encodeURIComponent(txId)}`, { signal }),
  login: (username: string, password: string) => request<LoginResponse>('/auth/login', { method: 'POST', body: { username, password, portal: 'bank' } }),
  collateral: (query: { enwr?: string; sscc?: string; cursor?: string; limit?: string }, signal?: AbortSignal, timeoutMs?: number) =>
    request<Page<Collateral>>(`/collateral${q(query)}`, { auth: true, signal, timeoutMs }),
  markLien: (enwr: string, body: LienRequest) => request<Receipted<Loan>>(`/collateral/${enc(enwr)}/lien`, { auth: true, method: 'POST', body }),
  loans: (status?: string, signal?: AbortSignal, limit?: string, timeoutMs?: number) => request<Page<Loan>>(`/loans${q({ status, limit })}`, { auth: true, signal, timeoutMs }),
  loan: (loanId: string, signal?: AbortSignal) => request<Loan>(`/loans/${enc(loanId)}`, { auth: true, signal }),
  disburse: (loanId: string) => request<Receipted<Loan>>(`/loans/${enc(loanId)}/disburse`, { auth: true, method: 'POST', body: {} }),
  repay: (loanId: string, body: RepayRequest) => request<Receipted<Loan>>(`/loans/${enc(loanId)}/repay`, { auth: true, method: 'POST', body }),
  release: (loanId: string) => request<Receipted<Loan>>(`/loans/${enc(loanId)}/release`, { auth: true, method: 'POST', body: {} }),
};
