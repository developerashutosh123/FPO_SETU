import type {
  BlockDetail, BlockSummary, Channel, ErrorCode, HealthResponse, KpisResponse, LedgerMode, LedgerSearchResponse, LedgerStatus,
  LoginResponse, LotPassport, TxDetail,
} from '@/contract/contract';
import { ERROR_MESSAGES, type ClientErrorCode } from './errors';

/**
 * The only module that talks to the gateway (PORTAL_COMMON.md section B). Runs in the browser and on the server (the tx and block pages are server-rendered).
 *  - mock: the mock gateway on :4010. live: NEXT_PUBLIC_API_URL.
 *  - If GET /health fails or takes longer than 2.5 s, requests go to NEXT_PUBLIC_READ_API_URL and the mode becomes index-only.
 *  - Every response's X-Ledger-Mode header is recorded.
 */
const trim = (s: string | undefined) => (s ?? '').replace(/\/+$/, '');
export const DATA_SOURCE: 'mock' | 'live' = process.env.NEXT_PUBLIC_DATA_SOURCE === 'live' ? 'live' : 'mock';
export const PRIMARY_URL = DATA_SOURCE === 'mock' ? trim(process.env.NEXT_PUBLIC_MOCK_URL) || 'http://localhost:4010' : trim(process.env.NEXT_PUBLIC_API_URL);
export const READ_API_URL = trim(process.env.NEXT_PUBLIC_READ_API_URL);

const HEALTH_TIMEOUT_MS = 2500;
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
export const SESSION_KEY = 'fposetu.gov.session';
function getToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try { return (JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? 'null') as { token?: string } | null)?.token; } catch { return undefined; }
}

// ---------- transport ----------
/** Free ngrok domains answer browsers with an interstitial unless this header is sent (RUNBOOK section 3). Only for ngrok hosts. */
export function extraHeadersFor(base: string): Record<string, string> {
  try {
    const host = new URL(base).hostname;
    return host.endsWith('.ngrok-free.app') || host.endsWith('.ngrok-free.dev') ? { 'ngrok-skip-browser-warning': '1' } : {};
  } catch { return {}; }
}

async function timedFetch(url: string, init: RequestInit, ms: number, outer?: AbortSignal): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new DOMException('timeout', 'TimeoutError')), ms);
  const onOuter = () => ac.abort(outer?.reason);
  outer?.addEventListener('abort', onOuter);
  try { return await fetch(url, { ...init, signal: ac.signal, cache: 'no-store' }); } finally { clearTimeout(timer); outer?.removeEventListener('abort', onOuter); }
}

let probing: Promise<string | null> | null = null;
/** Picks the base URL. Probes the primary gateway's /health (2.5 s), falls back to the read-only API. Cached for 15 s. */
export function resolveBase(force = false): Promise<string | null> {
  if (!force && conn.base && Date.now() - conn.probedAt < PROBE_TTL_MS) return Promise.resolve(conn.base);
  if (probing) return probing;
  probing = (async () => {
    if (PRIMARY_URL) {
      try {
        const res = await timedFetch(`${PRIMARY_URL}/health`, { headers: { accept: 'application/json', ...extraHeadersFor(PRIMARY_URL) } }, HEALTH_TIMEOUT_MS);
        if (res.ok) {
          const health = (await res.json()) as HealthResponse;
          const mode = (res.headers.get('x-ledger-mode') as LedgerMode | null) ?? health.ledgerMode;
          setConn({ mode, base: PRIMARY_URL, probedAt: Date.now(), health });
          return PRIMARY_URL;
        }
      } catch { /* fall through to the read-only API */ }
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
interface RequestOpts { auth?: boolean; method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal }

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
      const res = await timedFetch(base + path, { method: opts.method ?? 'GET', headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) }, REQUEST_TIMEOUT_MS, opts.signal);
      const mode = (res.headers.get('x-ledger-mode') as LedgerMode | null) ?? (base === READ_API_URL ? 'index-only' : 'live');
      if (conn.mode !== mode && base === conn.base) setConn({ mode });
      if (!res.ok) {
        const err = await parseError(res);
        if (err.code === 'ERR_UNAUTHENTICATED' && opts.auth && typeof window !== 'undefined') window.dispatchEvent(new Event('gov:unauthenticated'));
        throw err;
      }
      return { data: (await res.json()) as T, mode };
    } catch (e) {
      if (e instanceof ApiClientError) throw e;
      if (opts.signal?.aborted && !(opts.signal.reason instanceof DOMException && opts.signal.reason.name === 'TimeoutError')) throw e;
      // network error or timeout on the primary gateway: fail over once to the read-only API
      if (attempt === 0 && base === PRIMARY_URL && READ_API_URL) {
        setConn({ mode: 'index-only', base: READ_API_URL, probedAt: Date.now() });
        base = READ_API_URL;
        continue;
      }
      setConn({ mode: 'offline', base: null, probedAt: Date.now() });
      throw new ApiClientError('NETWORK', 0);
    }
  }
  throw new ApiClientError('NETWORK', 0);
}

// ---------- typed calls ----------
export const api = {
  health: () => request<HealthResponse>('/health'),
  ledgerStatus: (signal?: AbortSignal) => request<LedgerStatus>('/ledger/status', { signal }),
  ledgerBlocks: (channel?: Channel, limit = 15, signal?: AbortSignal) =>
    request<BlockSummary[]>(`/ledger/blocks?${new URLSearchParams({ ...(channel ? { channel } : {}), limit: String(limit) })}`, { signal }),
  ledgerBlock: (channel: Channel, n: number, signal?: AbortSignal) => request<BlockDetail>(`/ledger/blocks/${channel}/${n}`, { signal }),
  ledgerTx: (txId: string, signal?: AbortSignal) => request<TxDetail>(`/ledger/tx/${encodeURIComponent(txId)}`, { signal }),
  ledgerSearch: (q: string, signal?: AbortSignal) => request<LedgerSearchResponse>(`/ledger/search?${new URLSearchParams({ q })}`, { signal }),
  login: (username: string, password: string) => request<LoginResponse>('/auth/login', { method: 'POST', body: { username, password, portal: 'gov' } }),
  kpis: (signal?: AbortSignal) => request<KpisResponse>('/kpis', { auth: true, signal }),
  lot: (sscc: string, signal?: AbortSignal) => request<LotPassport>(`/lots/${encodeURIComponent(sscc)}`, { auth: true, signal }),
};
