import { afterEach, describe, expect, it, vi } from 'vitest';

async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('./api');
}
const json = (body: unknown, mode = 'live', status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'x-ledger-mode': mode } });
const HEALTH = { ok: true, ledgerMode: 'live', contractVersion: '1.0.4', channels: {} };
const LIVE = { NEXT_PUBLIC_DATA_SOURCE: 'live', NEXT_PUBLIC_API_URL: 'https://gw.example' };

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('fpo api client', () => {
  it('sends the ngrok header only to ngrok hosts', async () => {
    const { extraHeadersFor } = await load({ NEXT_PUBLIC_DATA_SOURCE: 'live' });
    expect(extraHeadersFor('https://repaying-chant-consumer.ngrok-free.dev')).toEqual({ 'ngrok-skip-browser-warning': '1' });
    expect(extraHeadersFor('https://read-api-ten.vercel.app')).toEqual({});
  });

  it('treats an env value with a stray space as the same value, so " live" is live and not mock', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(HEALTH)));
    const m = await load({ NEXT_PUBLIC_DATA_SOURCE: ' live', NEXT_PUBLIC_API_URL: ' https://gw.example/ ', NEXT_PUBLIC_READ_API_URL: 'https://read.example\n' });
    expect(m.DATA_SOURCE).toBe('live');
    expect(m.PRIMARY_URL).toBe('https://gw.example');
    expect(m.READ_API_URL).toBe('https://read.example');
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_URL_GOV', ' https://fposetu-gov.vercel.app ');
    const { PORTALS } = await import('./portals');
    expect(PORTALS.gov).toBe('https://fposetu-gov.vercel.app');
  });

  it('agree-price sends a numeric pricePerQtl and no salt, so the gateway derives the salt the buyer also gets', async () => {
    const calls: { url: string; body?: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => { calls.push({ url: u, body: init?.body as string | undefined }); return u.endsWith('/health') ? json(HEALTH) : json({ resource: {} }); }));
    const { api } = await load(LIVE);
    await api.agreePrice('ORD-2026-00091', { pricePerQtl: 1580 });
    const post = calls.find((c) => c.url.endsWith('/orders/ORD-2026-00091/agree-price'))!;
    expect(JSON.parse(post.body!)).toEqual({ pricePerQtl: 1580 });
  });

  it('keeps ERR_LOT_PLEDGED and the gateway message when a pledged lot is dispatched', async () => {
    const body = { error: { code: 'ERR_LOT_PLEDGED', message: 'Lot is pledged under LIEN-2026-00041' } };
    vi.stubGlobal('fetch', vi.fn(async (u: string) => (u.endsWith('/health') ? json(HEALTH) : json(body, 'live', 409))));
    const { api } = await load(LIVE);
    const err = await api.proposeCustody('089012340000004524', { toOrg: 'BuyerOrgMSP', vehicleNo: 'WB-30-AB-1234', loggerId: 'BLE-SIM-1' }).catch((e) => e);
    expect(err.code).toBe('ERR_LOT_PLEDGED');
    expect(err.serverMessage).toBe(body.error.message);
  });

  it('fails over to the read-only API only when /health fails twice', async () => {
    let healthTries = 0;
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      if (u.startsWith('https://gw.example')) { healthTries++; throw new TypeError('network'); }
      return u.endsWith('/health') ? json(HEALTH, 'index-only') : json({ items: [] }, 'index-only');
    }));
    const { api, getConn } = await load({ ...LIVE, NEXT_PUBLIC_READ_API_URL: 'https://read.example' });
    const r = await api.orders();
    expect(healthTries).toBe(2);
    expect(r.mode).toBe('index-only');
    expect(getConn().base).toBe('https://read.example');
  });
});
