import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ENDPOINTS, ROLES } from '../src/contract/endpoints.mjs';
import { PERSONAS } from '../src/auth/personas.js';
import { testServer } from './helpers/app.js';

let t: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => { t = await testServer(); });
afterAll(async () => { await t.close(); });

const ROLE_USER: Record<string, string> = Object.fromEntries(PERSONAS.map((p) => [p.role, p.username]));
const fill = (path: string) => path.replace(/\{(\w+)\}/g, (_m, k: string) => ({ sscc: '089012340000000019', txId: '0'.repeat(64), channel: 'trace-channel', number: '1', id: '00000000-0000-4000-8000-000000000000', deviceId: 'WB-CHG-01', enwr: 'ENWR-NERL-2026-000001', loanId: 'LN-2026-00001', orderId: 'ORD-2026-00001' } as Record<string, string>)[k] ?? 'x');

// Every endpoint of the contract, for every role: the gateway allows exactly the roles in CONTRACT.md Section 8 (shared endpoint table).
describe('role matrix: 60 endpoints x 9 roles + anonymous', () => {
  for (const e of ENDPOINTS.filter((x) => x.id !== 'eventsStream')) {
    it(`${e.method} ${e.path} [${e.roles.join(', ')}]`, async () => {
      const call = async (username?: string) => {
        const headers: Record<string, string> = username ? { authorization: `Bearer ${await t.token(username)}` } : {};
        if (e.method !== 'GET') headers['content-type'] = 'application/json';
        const r = await t.server.app.inject({ method: e.method, url: fill(e.path), headers, payload: e.method === 'GET' ? undefined : '{}' });
        return r;
      };
      const pub = e.roles.includes('public'), anyAuth = e.roles.includes('authenticated');
      const anon = await call();
      if (pub) expect(anon.statusCode, 'anonymous allowed').not.toBe(401); else expect(anon.statusCode, 'anonymous refused').toBe(401);
      for (const role of ROLES) {
        const before = t.ledger.calls.length;
        const r = await call(ROLE_USER[role]);
        const allowed = pub || anyAuth || e.roles.includes(role);
        if (allowed && e.id === 'erasePersonalData' && role === 'member') expect(JSON.parse(r.body).error.message).toMatch(/only their own/); // role is allowed; the handler limits it to the member's own id
        else if (allowed) expect([401, 403].includes(r.statusCode) && !(r.statusCode === 403 && /ERR_FORBIDDEN_ORG/.test(r.body) && e.id === 'getOrderPrice'), `${role} should be allowed: ${r.statusCode} ${r.body.slice(0, 120)}`).toBe(false);
        else {
          expect(t.ledger.calls.length, `${role} refused: the ledger must not be touched`).toBe(before);
          expect(r.statusCode, `${role} should be refused`).toBe(403);
          expect(JSON.parse(r.body).error.code).toBe(e.id === 'getOrderPrice' ? 'ERR_FORBIDDEN_ORG' : 'ERR_FORBIDDEN_ROLE');
        }
      }
    });
  }
});
