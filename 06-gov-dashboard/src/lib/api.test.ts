import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Each test imports a fresh copy of api.ts so its module state (probe cache, ledger mode) starts clean.
async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('./api');
}
const json = (body: unknown, mode = 'live', status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'x-ledger-mode': mode } });
const HEALTH = { ok: true, ledgerMode: 'live', contractVersion: '1.0.4', channels: { 'trace-channel': { height: 5 } } };

beforeEach(() => { vi.useRealTimers(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('api failover', () => {
  it('uses the primary gateway when /health answers', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { calls.push(u); return u.endsWith('/health') ? json(HEALTH) : json([]); }));
    const { api, getConn } = await load({ NEXT_PUBLIC_DATA_SOURCE: 'live', NEXT_PUBLIC_API_URL: 'https://gw.example', NEXT_PUBLIC_READ_API_URL: 'https://read.example' });
    await api.ledgerBlocks('trace-channel');
    expect(calls[0]).toBe('https://gw.example/health');
    expect(calls[1]).toContain('https://gw.example/ledger/blocks');
    expect(getConn().mode).toBe('live');
  });

  it('switches to the read-only API and reports index-only when /health fails', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      calls.push(u);
      if (u.startsWith('https://gw.example')) throw new TypeError('fetch failed');
      return u.endsWith('/health') ? json(HEALTH, 'index-only') : json([], 'index-only');
    }));
    const { api, getConn } = await load({ NEXT_PUBLIC_DATA_SOURCE: 'live', NEXT_PUBLIC_API_URL: 'https://gw.example', NEXT_PUBLIC_READ_API_URL: 'https://read.example' });
    const r = await api.ledgerBlocks();
    expect(r.mode).toBe('index-only');
    expect(getConn()).toMatchObject({ mode: 'index-only', base: 'https://read.example' });
    expect(calls.some((c) => c.startsWith('https://read.example/ledger/blocks'))).toBe(true);
  });

  it('gives up on /health only after two 8 s timeouts', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((u: string, init: RequestInit) => {
      if (u.startsWith('https://gw.example')) return new Promise((_, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('timeout', 'TimeoutError'))));
      return Promise.resolve(u.endsWith('/health') ? json(HEALTH, 'index-only') : json([], 'index-only'));
    }));
    const { api, getConn } = await load({ NEXT_PUBLIC_DATA_SOURCE: 'live', NEXT_PUBLIC_API_URL: 'https://gw.example', NEXT_PUBLIC_READ_API_URL: 'https://read.example' });
    const p = api.ledgerBlocks();
    await vi.advanceTimersByTimeAsync(8001);
    expect(getConn().mode).not.toBe('index-only');
    await vi.advanceTimersByTimeAsync(7998);
    expect(getConn().mode).not.toBe('index-only');
    await vi.advanceTimersByTimeAsync(2);
    await p;
    expect(getConn().mode).toBe('index-only');
  });

  it('stays live when one /health probe fails and the retry answers', async () => {
    let healthCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      if (u === 'https://gw.example/health' && ++healthCalls === 1) throw new TypeError('fetch failed');
      return u.endsWith('/health') ? json(HEALTH) : json([]);
    }));
    const { api, getConn } = await load({ NEXT_PUBLIC_DATA_SOURCE: 'live', NEXT_PUBLIC_API_URL: 'https://gw.example', NEXT_PUBLIC_READ_API_URL: 'https://read.example' });
    await api.ledgerBlocks();
    expect(healthCalls).toBe(2);
    expect(getConn()).toMatchObject({ mode: 'live', base: 'https://gw.example' });
  });

  it('stays live when a request drops but /health still answers', async () => {
    let dropped = false;
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      if (u.startsWith('https://gw.example/ledger/blocks') && !dropped) { dropped = true; throw new TypeError('fetch failed'); }
      return u.endsWith('/health') ? json(HEALTH) : json([]);
    }));
    const { api, getConn } = await load({ NEXT_PUBLIC_DATA_SOURCE: 'live', NEXT_PUBLIC_API_URL: 'https://gw.example', NEXT_PUBLIC_READ_API_URL: 'https://read.example' });
    const r = await api.ledgerBlocks();
    expect(r.mode).toBe('live');
    expect(getConn()).toMatchObject({ mode: 'live', base: 'https://gw.example' });
  });

  it('reports offline when neither API answers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    const { api, getConn } = await load({ NEXT_PUBLIC_DATA_SOURCE: 'live', NEXT_PUBLIC_API_URL: 'https://gw.example', NEXT_PUBLIC_READ_API_URL: 'https://read.example' });
    await expect(api.ledgerBlocks()).rejects.toMatchObject({ code: 'NETWORK' });
    expect(getConn().mode).toBe('offline');
  });

  it('maps an API error code to the friendly message and keeps the server text', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => (u.endsWith('/health') ? json(HEALTH) : json({ error: { code: 'ERR_NOT_FOUND', message: 'No transaction x.' } }, 'live', 404))));
    const { api } = await load({ NEXT_PUBLIC_DATA_SOURCE: 'live', NEXT_PUBLIC_API_URL: 'https://gw.example' });
    await expect(api.ledgerTx('x')).rejects.toMatchObject({ code: 'ERR_NOT_FOUND', status: 404, serverMessage: 'No transaction x.', message: expect.stringContaining('Check it') });
  });
});

describe('ngrok header', () => {
  it('is sent to ngrok hosts only', async () => {
    const { extraHeadersFor } = await load({ NEXT_PUBLIC_DATA_SOURCE: 'live', NEXT_PUBLIC_API_URL: 'https://x.ngrok-free.dev' });
    expect(extraHeadersFor('https://repaying-chant-consumer.ngrok-free.dev')).toEqual({ 'ngrok-skip-browser-warning': '1' });
    expect(extraHeadersFor('https://old.ngrok-free.app')).toEqual({ 'ngrok-skip-browser-warning': '1' });
    expect(extraHeadersFor('https://paid.ngrok.app')).toEqual({ 'ngrok-skip-browser-warning': '1' });
    expect(extraHeadersFor('https://notngrok.app')).toEqual({});
    expect(extraHeadersFor('https://read-api-ten.vercel.app')).toEqual({});
    expect(extraHeadersFor('http://localhost:4010')).toEqual({});
  });

  it('is attached to requests against an ngrok gateway', async () => {
    const seen: Record<string, string>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string, init: RequestInit) => { seen.push(init.headers as Record<string, string>); return u.endsWith('/health') ? json(HEALTH) : json([]); }));
    const { api } = await load({ NEXT_PUBLIC_DATA_SOURCE: 'live', NEXT_PUBLIC_API_URL: 'https://x.ngrok-free.dev' });
    await api.ledgerBlocks();
    expect(seen.length).toBe(2);
    expect(seen.every((h) => h['ngrok-skip-browser-warning'] === '1')).toBe(true);
  });
});
