import { afterEach, describe, expect, it, vi } from 'vitest';

async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('./api');
}
const json = (body: unknown, mode = 'live', status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'x-ledger-mode': mode } });
const HEALTH = { ok: true, ledgerMode: 'live', contractVersion: '1.0.4', channels: {} };

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('bank api client', () => {
  it('sends the ngrok header only to ngrok hosts', async () => {
    const { extraHeadersFor } = await load({ NEXT_PUBLIC_DATA_SOURCE: 'live' });
    expect(extraHeadersFor('https://repaying-chant-consumer.ngrok-free.dev')).toEqual({ 'ngrok-skip-browser-warning': '1' });
    expect(extraHeadersFor('https://read-api-ten.vercel.app')).toEqual({});
  });

  it('keeps the gateway message and the existing-lien tx ID of ERR_DOUBLE_FINANCING', async () => {
    const body = { error: { code: 'ERR_DOUBLE_FINANCING', message: 'e-NWR X already has an active lien (tx abc)', txId: 'abc' } };
    vi.stubGlobal('fetch', vi.fn(async (u: string) => (u.endsWith('/health') ? json(HEALTH) : json(body, 'live', 409))));
    const { api } = await load({ NEXT_PUBLIC_DATA_SOURCE: 'live', NEXT_PUBLIC_API_URL: 'https://gw.example' });
    const err = await api.markLien('ENWR-NERL-2026-004212', { loanId: 'LN-2026-00001', amount: 1, tenureDays: 1, ratePct: 1 }).catch((e) => e);
    expect(err.code).toBe('ERR_DOUBLE_FINANCING');
    expect(err.serverMessage).toBe(body.error.message);
    expect(err.txId).toBe('abc');
  });

  it('fails over to the read-only API and reports index-only when /health fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      if (u.startsWith('https://gw.example')) throw new TypeError('network');
      return u.endsWith('/health') ? json(HEALTH, 'index-only') : json({ items: [] }, 'index-only');
    }));
    const { api, getConn } = await load({ NEXT_PUBLIC_DATA_SOURCE: 'live', NEXT_PUBLIC_API_URL: 'https://gw.example', NEXT_PUBLIC_READ_API_URL: 'https://read.example' });
    const r = await api.collateral({});
    expect(r.mode).toBe('index-only');
    expect(getConn().base).toBe('https://read.example');
  });
});
