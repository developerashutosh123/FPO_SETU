import type { HealthResponse, LedgerMode, Provenance } from '@/contract/contract';

/**
 * Server-side data access for the public provenance page (PORTAL_COMMON.md section B).
 *  - mock: the mock gateway on :4010. live: NEXT_PUBLIC_API_URL.
 *  - GET /health is probed with an 8 s timeout and retried once; only when both attempts fail does the page read
 *    NEXT_PUBLIC_READ_API_URL and report index-only. A single dropped request on the free ngrok tunnel does not flip the mode.
 *  - Free ngrok domains answer with an interstitial unless `ngrok-skip-browser-warning` is sent (RUNBOOK section 3).
 *  - Provenance responses are cached for 60 s (Next fetch cache).
 */
const trim = (s: string | undefined) => (s ?? '').replace(/\/+$/, '');
export const DATA_SOURCE: 'mock' | 'live' = process.env.NEXT_PUBLIC_DATA_SOURCE === 'live' ? 'live' : 'mock';
export const PRIMARY_URL = DATA_SOURCE === 'mock' ? trim(process.env.NEXT_PUBLIC_MOCK_URL) || 'http://localhost:4010' : trim(process.env.NEXT_PUBLIC_API_URL);
export const READ_API_URL = trim(process.env.NEXT_PUBLIC_READ_API_URL);

const HEALTH_TIMEOUT_MS = 8000;
const HEALTH_ATTEMPTS = 2;
const REQUEST_TIMEOUT_MS = 15000;
const PROBE_TTL_MS = 15000;
export const REVALIDATE_SECONDS = 60;

const NGROK_HOST = /\.ngrok(-free)?\.(app|dev|io)$/;
export function extraHeadersFor(base: string): Record<string, string> {
  try { return NGROK_HOST.test(new URL(base).hostname) ? { 'ngrok-skip-browser-warning': '1' } : {}; } catch { return {}; }
}

async function timed(url: string, init: RequestInit & { next?: { revalidate: number } }, ms: number): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...init, signal: ac.signal }); } finally { clearTimeout(timer); }
}

async function healthy(base: string, attempts: number): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await timed(`${base}/health`, { headers: { accept: 'application/json', ...extraHeadersFor(base) }, cache: 'no-store' }, HEALTH_TIMEOUT_MS);
      if (res.ok) { (await res.json()) as HealthResponse; return true; } // an interstitial page fails here (HTML, not JSON)
    } catch { /* retry */ }
  }
  return false;
}

let cached: { base: string | null; at: number } | null = null;
let probing: Promise<string | null> | null = null;
/** Primary gateway if it answers /health twice-tried, else the read-only API, else null. Cached for 15 s per server instance. */
export function resolveBase(): Promise<string | null> {
  if (cached && Date.now() - cached.at < PROBE_TTL_MS) return Promise.resolve(cached.base);
  if (probing) return probing;
  probing = (async () => {
    let base: string | null = null;
    if (PRIMARY_URL && (await healthy(PRIMARY_URL, HEALTH_ATTEMPTS))) base = PRIMARY_URL;
    else if (READ_API_URL && (await healthy(READ_API_URL, 1))) base = READ_API_URL;
    cached = { base, at: Date.now() };
    return base;
  })().finally(() => { probing = null; });
  return probing;
}

export type ProvenanceResult =
  | { status: 'ok'; data: Provenance; mode: LedgerMode }
  | { status: 'not_found' }
  | { status: 'unreachable' };

/** GET /public/provenance/:sscc. No names or phone numbers come back from this endpoint (contract section 8). */
export async function getProvenance(sscc: string): Promise<ProvenanceResult> {
  const base = await resolveBase();
  if (!base) return { status: 'unreachable' };
  try {
    const res = await timed(`${base}/public/provenance/${encodeURIComponent(sscc)}`, {
      headers: { accept: 'application/json', ...extraHeadersFor(base) },
      next: { revalidate: REVALIDATE_SECONDS },
    }, REQUEST_TIMEOUT_MS);
    if (res.status === 404) return { status: 'not_found' };
    if (!res.ok) return { status: 'unreachable' };
    const data = (await res.json()) as Provenance;
    const header = res.headers.get('x-ledger-mode') as LedgerMode | null;
    return { status: 'ok', data, mode: header ?? (base === READ_API_URL ? 'index-only' : data.ledgerMode) };
  } catch {
    cached = null; // re-probe next time
    return { status: 'unreachable' };
  }
}
