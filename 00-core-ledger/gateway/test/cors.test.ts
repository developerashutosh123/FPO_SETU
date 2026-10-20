// What a browser on a Vercel portal needs from the gateway through the public tunnel: preflight, simple GET, the mode header, SSE.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { originAllowed } from '../src/services/origin.js';
import { testServer } from './helpers/app.js';

const PORTAL = 'https://fpo-setu-fpo-console-git-main-demo.vercel.app';
const NGROK = 'https://example-static-name.ngrok-free.app';
let t: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => { t = await testServer({ env: { CORS_ORIGINS: `${PORTAL},${NGROK},http://localhost:3002` } }); });
afterAll(async () => { await t.close(); });
const app = () => t.server.app;

describe('CORS', () => {
  it('answers the preflight of an authorised fetch from an allowed portal, including the ngrok bypass header', async () => {
    const r = await app().inject({ method: 'OPTIONS', url: '/lots', headers: { origin: PORTAL, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization,ngrok-skip-browser-warning' } });
    expect(r.statusCode).toBe(204);
    expect(r.headers['access-control-allow-origin']).toBe(PORTAL);
    expect(String(r.headers['access-control-allow-headers']).toLowerCase()).toContain('ngrok-skip-browser-warning');
    expect(String(r.headers['access-control-allow-headers']).toLowerCase()).toContain('authorization');
  });
  it('lets the portal read the response and the ledger-mode header', async () => {
    const r = await app().inject({ method: 'GET', url: '/health', headers: { origin: PORTAL } });
    expect(r.headers['access-control-allow-origin']).toBe(PORTAL);
    expect(String(r.headers['access-control-expose-headers'])).toContain('X-Ledger-Mode');
    expect(r.headers['x-ledger-mode']).toBeDefined();
  });
  it('allows localhost and the tunnel origin, and no origin outside the list', async () => {
    for (const o of ['http://localhost:3002', NGROK]) expect((await app().inject({ method: 'GET', url: '/villages', headers: { origin: o } })).headers['access-control-allow-origin'], o).toBe(o);
    const r = await app().inject({ method: 'GET', url: '/villages', headers: { origin: 'https://evil.example' } });
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('GET /events/stream from a portal origin', () => {
  it('carries the CORS header so EventSource connects without a CORS error, and the mode header', async () => {
    await app().listen({ port: 0, host: '127.0.0.1' });
    const port = (app().server.address() as AddressInfo).port;
    const ac = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/events/stream`, { headers: { origin: PORTAL, accept: 'text/event-stream' }, signal: ac.signal });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    expect(res.headers.get('access-control-allow-origin')).toBe(PORTAL);
    expect(res.headers.get('x-ledger-mode')).toBe('live');
    const first = await res.body!.getReader().read();
    expect(new TextDecoder().decode(first.value)).toContain('retry: 3000');
    ac.abort();
  });
});

describe('origin patterns (Vercel preview deployments change their host name every time)', () => {
  const list = ['https://fpo-console.vercel.app', 'https://fpo-console-*-myteam.vercel.app', 'http://localhost:3002'];
  it('exact entries match exactly', () => {
    expect(originAllowed(list, 'https://fpo-console.vercel.app')).toBe(true);
    expect(originAllowed(list, 'http://localhost:3002')).toBe(true);
    expect(originAllowed(list, 'http://localhost:3003')).toBe(false);
    expect(originAllowed(list, 'https://fpo-console.vercel.app.evil.example')).toBe(false);
  });
  it('a * stands for one host label of the project, nothing else', () => {
    expect(originAllowed(list, 'https://fpo-console-git-main-myteam.vercel.app')).toBe(true);
    expect(originAllowed(list, 'https://fpo-console-abc123xyz-myteam.vercel.app')).toBe(true);
    expect(originAllowed(list, 'https://fpo-console-abc-otherteam.vercel.app')).toBe(false);
    expect(originAllowed(list, 'http://fpo-console-abc-myteam.vercel.app')).toBe(false); // scheme must match
    expect(originAllowed(list, 'https://evil.example/https://fpo-console-abc-myteam.vercel.app')).toBe(false);
    expect(originAllowed(list, 'https://fpo-console-a.b-myteam.vercel.app')).toBe(false); // one label, no dots
  });
  it('a bare * is not a wildcard for everything', () => { expect(originAllowed(['*'], 'https://anything.example')).toBe(false); });
});
