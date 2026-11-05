import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PRIMARY = 'https://demo-name.ngrok-free.dev';
const READ = 'https://read-api.example.vercel.app';
const SSCC = '089012340000004517';
const prov = { sscc: SSCC, commodity: 'POTATO', ledgerMode: 'live', proofs: [], journey: [] };

type Call = { url: string; headers: Record<string, string> };
let calls: Call[];

function stub(handler: (url: string) => Response | Promise<Response>) {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    return handler(url);
  }));
}
const json = (body: unknown, mode = 'live', status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'x-ledger-mode': mode } });

async function load() {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_DATA_SOURCE', 'live');
  vi.stubEnv('NEXT_PUBLIC_API_URL', PRIMARY);
  vi.stubEnv('NEXT_PUBLIC_READ_API_URL', READ);
  return import('./api');
}

beforeEach(() => { vi.useRealTimers(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('getProvenance', () => {
  it('uses the gateway when /health answers and sends the ngrok header only to ngrok hosts', async () => {
    stub((u) => (u.endsWith('/health') ? json({ ok: true, ledgerMode: 'live' }) : json(prov)));
    const { getProvenance } = await load();
    const r = await getProvenance(SSCC);
    expect(r.status).toBe('ok');
    expect(calls.every((c) => c.url.startsWith(PRIMARY))).toBe(true);
    expect(calls.every((c) => c.headers['ngrok-skip-browser-warning'] === '1')).toBe(true);
  });

  it('retries /health once before failing over, then reads the read-only API and reports index-only', async () => {
    stub((u) => {
      if (u.startsWith(PRIMARY)) throw new Error('tunnel down');
      return u.endsWith('/health') ? json({ ok: true, ledgerMode: 'index-only' }, 'index-only') : json({ ...prov, ledgerMode: 'index-only' }, 'index-only');
    });
    const { getProvenance } = await load();
    const r = await getProvenance(SSCC);
    expect(r).toMatchObject({ status: 'ok', mode: 'index-only' });
    expect(calls.filter((c) => c.url === `${PRIMARY}/health`)).toHaveLength(2);
    expect(calls.filter((c) => c.url.startsWith(READ)).every((c) => !('ngrok-skip-browser-warning' in c.headers))).toBe(true);
  });

  it('does not fail over when one health probe drops and the retry succeeds', async () => {
    let n = 0;
    stub((u) => {
      if (u.endsWith('/health')) { if (n++ === 0) throw new Error('dropped'); return json({ ok: true, ledgerMode: 'live' }); }
      return json(prov);
    });
    const { getProvenance } = await load();
    expect((await getProvenance(SSCC)).status).toBe('ok');
    expect(calls.some((c) => c.url.startsWith(READ))).toBe(false);
  });

  it('treats an HTML interstitial on /health as a failure', async () => {
    stub((u) => (u.startsWith(PRIMARY) ? new Response('<html>ngrok</html>', { status: 200 }) : u.endsWith('/health') ? json({ ok: true }) : json(prov, 'index-only')));
    const { getProvenance } = await load();
    expect(await getProvenance(SSCC)).toMatchObject({ status: 'ok', mode: 'index-only' });
  });

  it('maps 404 to not_found and a dead API to unreachable', async () => {
    stub((u) => (u.endsWith('/health') ? json({ ok: true }) : json({ error: { code: 'ERR_NOT_FOUND' } }, 'live', 404)));
    expect(await (await load()).getProvenance(SSCC)).toEqual({ status: 'not_found' });
    stub(() => { throw new Error('offline'); });
    expect(await (await load()).getProvenance(SSCC)).toEqual({ status: 'unreachable' });
  });
});
