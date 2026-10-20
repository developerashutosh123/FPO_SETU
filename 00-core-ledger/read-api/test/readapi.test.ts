// The read-only API against the gateway on the SAME throwaway database: same bodies for every GET and every role, mode header
// index-only, every write refused with 503. The gateway side uses the gateway's own test helpers.
// Vitest runs it; tsc skips it (tsconfig exclude), because it loads the gateway's types and the generated copy of them together.
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { blocksView, indexerCheckpoints } from '../../gateway/src/db/schema';
import { PERSONAS } from '../../gateway/src/auth/personas';
import { testServer } from '../../gateway/test/helpers/app';
import { seedWorld, W } from '../../gateway/test/helpers/world';
import { createReadApi, type ReadApi } from '../src/instance';
import { ENDPOINTS } from '../src/gateway/contract/endpoints.mjs';

let t: Awaited<ReturnType<typeof testServer>>;
let ra: ReadApi;
const USERS = PERSONAS.map((p) => p.username);

beforeAll(async () => {
  t = await testServer({ ratesFile: join(__dirname, '..', '..', 'gateway', 'test', 'e2e-rates.json') });
  const db = t.server.ctx.db;
  await seedWorld(db);
  t.ledger.answers['order-settlement.GetOrderPrice'] = JSON.stringify({ pricePerQtl: W.price, salt: 'x'.repeat(32) });
  const blk = (channel: string, number: number) => ({ channel, number, dataHash: 'd'.repeat(64), previousHash: 'p'.repeat(64), blockHash: 'b'.repeat(64), txCount: 1, time: new Date('2026-11-01T10:00:00Z') });
  await db.insert(blocksView).values([blk('trace-channel', 0), blk('trace-channel', 41), blk('finance-channel', 11), blk('trade-channel', 7)]);
  await db.insert(indexerCheckpoints).values([{ channel: 'trace-channel', nextBlock: 42, updatedAt: new Date('2026-11-09T08:30:00Z') }, { channel: 'finance-channel', nextBlock: 12, updatedAt: new Date('2026-11-09T08:31:00Z') }]);
  ra = await createReadApi({ DATABASE_URL: t.tdb.url, JWT_SECRET: t.cfg.JWT_SECRET, LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);
});
afterAll(async () => { await ra?.app.close(); await ra?.dbh.close(); await t.close(); });

const headers = async (user?: string) => (user ? { authorization: `Bearer ${await t.token(user)}` } : {});
const viaReadApi = async (method: string, url: string, user?: string, payload?: object) => ra.app.inject({ method: method as 'GET', url, headers: await headers(user), payload });
const viaGateway = async (url: string, user?: string) => t.server.app.inject({ method: 'GET', url, headers: await headers(user) });

describe('mode header', () => {
  it('every response says index-only: reads, errors and refusals', async () => {
    for (const [m, u, user] of [['GET', '/villages'], ['GET', `/lots/${W.sscc}`, 'sujata.ceo'], ['GET', '/lots'], ['GET', '/no/such/route'], ['GET', '/lots/nonsense', 'sujata.ceo'], ['POST', '/lots/drafts', 'subhankar.vle'], ['POST', '/auth/login']] as const) {
      const r = await viaReadApi(m, u, user, m === 'POST' ? {} : undefined);
      expect(r.headers['x-ledger-mode'], `${m} ${u}`).toBe('index-only');
    }
  });
});

describe('GET /health', () => {
  it('reports index-only and the channel heights from blocks_view', async () => {
    const r = await viaReadApi('GET', '/health');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true, ledgerMode: 'index-only', contractVersion: expect.stringMatching(/^1\.\d+\.\d+$/), channels: { 'trace-channel': { height: 42 }, 'finance-channel': { height: 12 }, 'trade-channel': { height: 8 } } });
  });
});

describe('GET /ledger/status', () => {
  it('is index-only, carries lastIndexedAt from the checkpoint and says it is not a live peer query', async () => {
    const s = (await viaReadApi('GET', '/ledger/status')).json();
    expect(s.mode).toBe('index-only');
    expect(s.lastIndexedAt).toBe('2026-11-09T08:31:00Z'); // the latest checkpoint
    expect(s.note).toMatch(/last indexed chain state/i);
    expect(s.note).toMatch(/not a live query of a peer/i);
    expect(s.channels.map((c: { name: string; height: number }) => [c.name, c.height])).toEqual([['trace-channel', 42], ['finance-channel', 12], ['trade-channel', 8]]);
    expect(s.peers.every((p: { up: boolean }) => p.up === false)).toBe(true); // no peer is asked from here, so none is claimed to be up
  });
});

describe('writes', () => {
  const SIGN_IN = new Set(['login', 'otpRequest', 'otpVerify']);
  const writes = ENDPOINTS.filter((e) => e.method !== 'GET' && !SIGN_IN.has(e.id));
  it('covers every POST and DELETE of the contract', () => { expect(writes.length).toBeGreaterThan(15); });
  for (const e of writes) {
    it(`${e.method} ${e.path} is 503 ERR_LEDGER_UNAVAILABLE, signed in or not`, async () => {
      const url = e.path.replace(/\{(\w+)\}/g, (_, k) => (k === 'sscc' ? W.sscc : k === 'orderId' ? W.orderId : k === 'loanId' ? W.loanId : 'x'));
      for (const user of [undefined, 'sujata.ceo', 'observer.gov']) {
        const r = await viaReadApi(e.method, url, user, {});
        expect(r.statusCode, `${user ?? 'anonymous'}`).toBe(503);
        expect(r.json().error.code).toBe('ERR_LEDGER_UNAVAILABLE');
        expect(r.headers['x-ledger-mode']).toBe('index-only');
      }
    });
  }
  it('the three sign-in calls still work (they write nothing), so a role-scoped page can be shown', async () => {
    const r = await viaReadApi('POST', '/auth/login', undefined, { username: 'sujata.ceo', password: 'Setu@2026', portal: 'fpo' });
    expect(r.statusCode).toBe(200);
    expect(r.json().token).toBeTruthy();
  });
});

describe('role filtering is the gateway\'s (CONTRACT.md Section 9.4)', () => {
  const NAMES = /Anima|অনিমা|9000000001/;
  it('the observer, the bank and the buyer cannot read farmers or diaries; the CEO can', async () => {
    for (const u of ['observer.gov', 'arindam.bank', 'rahul.buyer']) expect((await viaReadApi('GET', '/farmers', u)).statusCode, u).toBe(403);
    expect((await viaReadApi('GET', '/farmers', 'sujata.ceo')).json().items[0].name).toBe('Anima Das');
    for (const u of ['arindam.bank', 'rahul.buyer', 'observer.gov']) expect((await viaReadApi('GET', `/diary/inputs?farmerId=${W.farmerId}`, u)).statusCode, u).toBe(403);
  });
  it('no name or phone in a lot, a list, the collateral or the public provenance', async () => {
    for (const [u, url] of [['sujata.ceo', `/lots/${W.sscc}`], ['arindam.bank', `/lots/${W.sscc}`], ['observer.gov', '/lots'], ['arindam.bank', '/collateral'], ['sujata.ceo', '/orders'], [undefined, `/public/provenance/${W.sscc}`]] as const) {
      const r = await viaReadApi('GET', url, u);
      expect(r.statusCode, `${u} ${url}`).toBe(200);
      expect(r.body, `${u} ${url}`).not.toMatch(NAMES);
    }
  });
  it('the lien is hidden from the VLE and the buyer, shown in full to the bank, and only as a flag to the member', async () => {
    expect((await viaReadApi('GET', `/lots/${W.sscc}`, 'subhankar.vle')).json()).not.toHaveProperty('lien');
    expect((await viaReadApi('GET', `/lots/${W.sscc}`, 'rahul.buyer')).json()).not.toHaveProperty('lien');
    expect((await viaReadApi('GET', `/lots/${W.sscc}`, 'anima.das')).json().lien).toEqual({ status: 'ACTIVE' });
    expect((await viaReadApi('GET', `/lots/${W.sscc}`, 'arindam.bank')).json().lien.lienId).toBe('LIEN-2026-00040');
  });
  it('the price is for the FPO CEO and the buyer only; the bank and the observer are refused', async () => {
    expect((await viaReadApi('GET', `/orders/${W.orderId}/price`, 'sujata.ceo')).statusCode).toBe(200);
    expect((await viaReadApi('GET', `/orders/${W.orderId}/price`, 'rahul.buyer')).statusCode).toBe(200);
    for (const u of ['arindam.bank', 'observer.gov']) expect((await viaReadApi('GET', `/orders/${W.orderId}/price`, u)).statusCode, u).toBe(403);
    expect((await viaReadApi('GET', `/orders/${W.orderId}`, 'sujata.ceo')).body).not.toMatch(/1580|salt/);
  });
  it('a request without a token, or with a token that does not verify, is not signed in', async () => {
    expect((await viaReadApi('GET', '/lots')).statusCode).toBe(401);
    const r = await ra.app.inject({ method: 'GET', url: '/lots', headers: { authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.e30.bad' } });
    expect(r.statusCode).toBe(401);
  });
});

describe('same bodies as the gateway, for every role', () => {
  const paths = [
    '/villages', '/lots', `/lots/${W.sscc}`, '/lots?commodity=POTATO&grade=A', '/catalogue', '/lots/drafts/pending', `/public/provenance/${W.sscc}`,
    '/orders', `/orders/${W.orderId}`, `/orders/${W.orderId}/price`, '/loans', `/loans/${W.loanId}`, '/collateral', `/collateral?sscc=${W.sscc}`, '/storage/deposits',
    '/patronage/runs', '/statements/me', '/kpis', '/prices', '/prices/msp?crop=paddy', '/audit/sample', '/reputation/attestors',
    '/farmers', '/farmers/me', `/diary/inputs?farmerId=${W.farmerId}`, '/diary/inputs', '/lots/nonsense', '/orders/ORD-0000-00000', '/no/such/route',
  ];
  it('is byte-identical, status and body, for the public and all nine personas', async () => {
    let n = 0;
    for (const path of paths) {
      for (const user of [undefined, ...USERS]) {
        const [a, b] = [await viaGateway(path, user), await viaReadApi('GET', path, user)];
        expect(b.statusCode, `${user ?? 'public'} ${path}`).toBe(a.statusCode);
        expect(b.body, `${user ?? 'public'} ${path}`).toBe(a.body);
        expect(a.headers['x-ledger-mode']).toBe('live');
        expect(b.headers['x-ledger-mode']).toBe('index-only');
        n++;
      }
    }
    expect(n).toBe(paths.length * (USERS.length + 1));
  });
});
