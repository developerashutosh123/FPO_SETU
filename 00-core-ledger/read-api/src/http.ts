import { getReadApi } from './instance';

const STRIP_REQUEST = new Set(['host', 'connection', 'content-length', 'transfer-encoding']);
const STRIP_RESPONSE = new Set(['connection', 'content-length', 'transfer-encoding', 'keep-alive']);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'X-Ledger-Mode': 'index-only' } });

/** Passes a request to the gateway app in-process and returns its answer unchanged. */
export async function handle(req: Request): Promise<Response> {
  let api;
  try { api = await getReadApi(); }
  catch (e) {
    const missing = /Invalid configuration/.test(String((e as Error).message));
    return json(missing ? 500 : 503, { error: { code: missing ? 'ERR_INVALID_STATE' : 'ERR_LEDGER_UNAVAILABLE', message: missing ? 'The read-only API is not configured: set DATABASE_URL and JWT_SECRET.' : 'The index database is not reachable.' } });
  }
  const url = new URL(req.url);
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { if (!STRIP_REQUEST.has(k)) headers[k] = v; });
  const payload = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text();
  const res = await api.app.inject({ method: req.method as 'GET', url: url.pathname + url.search, headers, payload, remoteAddress: (headers['x-forwarded-for'] ?? '').split(',')[0]?.trim() || undefined });
  const out = new Headers();
  for (const [k, v] of Object.entries(res.headers)) {
    if (v === undefined || STRIP_RESPONSE.has(k)) continue;
    if (Array.isArray(v)) v.forEach((x) => out.append(k, x)); else out.set(k, String(v));
  }
  return new Response(req.method === 'HEAD' || res.statusCode === 204 ? null : new Uint8Array(res.rawPayload), { status: res.statusCode, headers: out });
}
