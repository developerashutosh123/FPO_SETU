import type {
  DeviceKeyRegistered, FarmerPrivate, FarmerSignRequest, HealthResponse, LedgerReceipt, LedgerMode, LoginResponse, LotListItem, LotPassport,
  OtpRequestResponse, Page, PendingLotDraft, PublicConfig, Receipted, StatementLine, TxDetail, Village,
} from '../contract/contract';
import type { ErrorCode } from '../contract/contract';
import { DATA_SOURCE, PRIMARY_URL, READ_API_URL } from './env';
import { ApiClientError } from './errors';
import { kvGetJson } from './kv';

/**
 * The only module that talks to the gateway (PORTAL_COMMON.md section B).
 *  - mock: the mock gateway on :4010. live: EXPO_PUBLIC_API_URL.
 *  - GET /health is probed with an 8 s timeout and retried once; only when both attempts fail do requests go to EXPO_PUBLIC_READ_API_URL
 *    and the mode becomes index-only. One slow or dropped request on the free ngrok tunnel re-probes instead of failing over.
 *  - Every response's X-Ledger-Mode header is recorded.
 */
export { DATA_SOURCE, PRIMARY_URL, READ_API_URL };

const HEALTH_TIMEOUT_MS = 8000;
const HEALTH_ATTEMPTS = 2;
const REQUEST_TIMEOUT_MS = 15000;
const PROBE_TTL_MS = 15000;

// ---------- connection state (subscribed to by the status pill and the offline banner) ----------
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

// ---------- session token ----------
export const SESSION_KEY = 'fposetu.farmer.session';
export const UNAUTH_EVENT = 'fposetu:unauthenticated';
const getToken = () => kvGetJson<{ token?: string }>(SESSION_KEY)?.token;

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
/** Picks the base URL: the primary gateway if /health answers (8 s, one retry), else the read-only API. Cached for 15 s. */
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

interface RequestOpts { auth?: boolean; method?: 'GET' | 'POST' | 'DELETE'; body?: unknown; signal?: AbortSignal }

async function parseError(res: Response): Promise<ApiClientError> {
  let body: { error?: { code?: ErrorCode; message?: string; txId?: string; details?: unknown } } | null = null;
  try { body = await res.json(); } catch { /* not JSON, e.g. an interstitial page */ }
  const e = body?.error;
  return new ApiClientError(e?.code ?? 'UNKNOWN', res.status, e?.message, e?.txId, e?.details);
}

export async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
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
        if (err.code === 'ERR_UNAUTHENTICATED' && opts.auth) globalThis.dispatchEvent?.(new Event(UNAUTH_EVENT));
        throw err;
      }
      return (await res.json()) as T;
    } catch (e) {
      if (e instanceof ApiClientError) throw e;
      if (opts.signal?.aborted && !(opts.signal.reason instanceof DOMException && opts.signal.reason.name === 'TimeoutError')) throw e;
      // network error or timeout on the primary gateway: re-probe /health (it only falls back after two failed probes) and try once
      // more on whatever it picks, so one dropped request on the tunnel does not flip the app to index-only
      if (attempt === 0 && base === PRIMARY_URL) {
        base = await resolveBase(true);
        continue;
      }
      if (base !== PRIMARY_URL || conn.base !== PRIMARY_URL) setConn({ mode: 'offline', base: null, probedAt: Date.now() });
      throw new ApiClientError('NETWORK', 0);
    }
  }
  throw new ApiClientError('NETWORK', 0);
}

// ---------- typed calls ----------
export const api = {
  health: () => request<HealthResponse>('/health'),
  configPublic: () => request<PublicConfig>('/config/public'),
  villages: () => request<Village[]>('/villages'),
  otpRequest: (phone: string) => request<OtpRequestResponse>('/auth/otp/request', { method: 'POST', body: { phone } }),
  otpVerify: (phone: string, otp: string) => request<LoginResponse>('/auth/otp/verify', { method: 'POST', body: { phone, otp } }),
  me: (signal?: AbortSignal) => request<FarmerPrivate>('/farmers/me', { auth: true, signal }),
  registerDeviceKey: (publicKeyHex: string) =>
    request<Receipted<DeviceKeyRegistered>>('/farmers/me/device-key', { auth: true, method: 'POST', body: { publicKeyHex } }),
  /** A member is not on the GET /lots role list in contract 1.0.4 (see CONTRACT_REQUESTS.md). The home screen tries it and falls back. */
  listMyLots: (signal?: AbortSignal) => request<Page<LotListItem>>('/lots?limit=100', { auth: true, signal }),
  lot: (sscc: string, signal?: AbortSignal) => request<LotPassport>(`/lots/${encodeURIComponent(sscc)}`, { auth: true, signal }),
  pendingDrafts: (signal?: AbortSignal) => request<PendingLotDraft[]>('/lots/drafts/pending', { auth: true, signal }),
  farmerSign: (sscc: string, signatureHex: string) =>
    request<Receipted<LotPassport>>(`/lots/${encodeURIComponent(sscc)}/farmer-sign`, { auth: true, method: 'POST', body: { signatureHex } satisfies FarmerSignRequest }),
  statements: (signal?: AbortSignal) => request<Page<StatementLine>>('/statements/me?limit=100', { auth: true, signal }),
  tx: (txId: string, signal?: AbortSignal) => request<TxDetail>(`/ledger/tx/${encodeURIComponent(txId)}`, { signal }),
};
export type { LedgerReceipt };
