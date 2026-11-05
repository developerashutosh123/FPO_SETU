import { afterEach, describe, expect, it, vi } from 'vitest';

async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('./api');
}
const json = (body: unknown, mode = 'live', status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'x-ledger-mode': mode } });
const HEALTH = { ok: true, ledgerMode: 'live', contractVersion: '1.0.4', channels: {} };
const LIVE = { NEXT_PUBLIC_DATA_SOURCE: 'live', NEXT_PUBLIC_API_URL: 'https://gw.example', NEXT_PUBLIC_READ_API_URL: 'https://read.example' };

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('buyer api client', () => {
  it('sends the ngrok header only to ngrok hosts', async () => {
    const { extraHeadersFor } = await load({ NEXT_PUBLIC_DATA_SOURCE: 'live' });
    expect(extraHeadersFor('https://repaying-chant-consumer.ngrok-free.dev')).toEqual({ 'ngrok-skip-browser-warning': '1' });
    expect(extraHeadersFor('https://read-api-ten.vercel.app')).toEqual({});
  });

  it('keeps the gateway message and code of ERR_PRICE_HASH_MISMATCH', async () => {
    const body = { error: { code: 'ERR_PRICE_HASH_MISMATCH', message: 'The two submitted prices do not match.' } };
    vi.stubGlobal('fetch', vi.fn(async (u: string) => (u.endsWith('/health') ? json(HEALTH) : json(body, 'live', 409))));
    const { api } = await load(LIVE);
    const err = await api.agreePrice('ORD-2026-00091', { pricePerQtl: 1400 }).catch((e) => e);
    expect(err.code).toBe('ERR_PRICE_HASH_MISMATCH');
    expect(err.serverMessage).toBe(body.error.message);
  });

  it('never sends a salt: the gateway derives it so both sides agree', async () => {
    const calls: { url: string; body?: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
      calls.push({ url: u, body: init?.body as string | undefined });
      return u.endsWith('/health') ? json(HEALTH) : json({ txId: 't', resource: { state: 'AWAITING_COUNTERPARTY', priceHash: 'h', orderId: 'o' } });
    }));
    const { api } = await load(LIVE);
    await api.agreePrice('ORD-2026-00091', { pricePerQtl: 1500 });
    const post = calls.find((c) => c.url.endsWith('/agree-price'))!;
    expect(JSON.parse(post.body!)).toEqual({ pricePerQtl: 1500 });
  });

  it('uses an explicit token for the demo FPO call and the stored session otherwise', async () => {
    const seen: (string | undefined)[] = [];
    vi.stubGlobal('window', { localStorage: { getItem: () => JSON.stringify({ token: 'buyer-token' }) }, dispatchEvent: () => true });
    vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
      if (!u.endsWith('/health')) seen.push((init?.headers as Record<string, string>).authorization);
      return u.endsWith('/health') ? json(HEALTH) : json({ txId: 't', resource: {} });
    }));
    const { api } = await load(LIVE);
    await api.acceptCustody('089012340000004616');
    await api.acceptCustody('089012340000004616', 'fpo-token');
    expect(seen).toEqual(['Bearer buyer-token', 'Bearer fpo-token']);
  });

  it('fails over to the read-only API and reports index-only when /health fails twice', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      if (u.startsWith('https://gw.example')) throw new TypeError('network');
      return u.endsWith('/health') ? json(HEALTH, 'index-only') : json({ items: [] }, 'index-only');
    }));
    const { api, getConn } = await load(LIVE);
    const r = await api.orders();
    expect(r.mode).toBe('index-only');
    expect(getConn().base).toBe('https://read.example');
  });

  it('retries /health once before failing over', async () => {
    let healthCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      if (u === 'https://gw.example/health' && ++healthCalls === 1) throw new TypeError('network');
      return u.endsWith('/health') ? json(HEALTH) : json({ items: [] });
    }));
    const { api, getConn } = await load(LIVE);
    await api.orders();
    expect(healthCalls).toBe(2);
    expect(getConn()).toMatchObject({ mode: 'live', base: 'https://gw.example' });
  });

  it('stays live when one request drops but /health still answers', async () => {
    let dropped = false;
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      if (u.startsWith('https://gw.example/orders') && !dropped) { dropped = true; throw new TypeError('network'); }
      return u.endsWith('/health') ? json(HEALTH) : json({ items: [] });
    }));
    const { api, getConn } = await load(LIVE);
    const r = await api.orders();
    expect(r.mode).toBe('live');
    expect(getConn()).toMatchObject({ mode: 'live', base: 'https://gw.example' });
  });
});
