// One test group per row of CONTRACT.md Section 9.4 ("who is allowed to see what"), through the real HTTP layer and the real database layer.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testServer } from './helpers/app.js';
import { seedWorld, W } from './helpers/world.js';

let t: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => { t = await testServer(); await seedWorld(t.server.ctx.db); t.ledger.answers['order-settlement.GetOrderPrice'] = JSON.stringify({ pricePerQtl: W.price, salt: 'x'.repeat(32) }); });
afterAll(async () => { await t.close(); });

const get = async (user: string | undefined, url: string) => {
  const r = await t.server.app.inject({ method: 'GET', url, headers: user ? { authorization: `Bearer ${await t.token(user)}` } : {} });
  return { status: r.statusCode, body: r.body, json: () => JSON.parse(r.body) };
};
const NAMES = /Anima|অনিমা|9000000001/;

describe('9.4 row: farmer name and phone', () => {
  it('visible to the member (own), the VLE, the CEO and the board', async () => {
    expect((await get('anima.das', '/farmers/me')).json().name).toBe('Anima Das');
    for (const u of ['subhankar.vle', 'sujata.ceo', 'board.fpo']) expect((await get(u, '/farmers')).json().items[0].name, u).toBe('Anima Das');
  });
  it('refused to the Bank, the Buyer and the Observer', async () => {
    for (const u of ['arindam.bank', 'rahul.buyer', 'observer.gov']) expect((await get(u, '/farmers')).status, u).toBe(403);
  });
  it('never in a lot passport, the catalogue, the collateral list or the public provenance', async () => {
    for (const [u, url] of [['sujata.ceo', `/lots/${W.sscc}`], ['arindam.bank', `/lots/${W.sscc}`], ['observer.gov', `/lots/${W.sscc}`], ['sujata.ceo', '/lots'], ['arindam.bank', '/collateral'], ['sujata.ceo', '/orders'], ['sujata.ceo', '/loans'], [undefined, `/public/provenance/${W.sscc}`]] as const) {
      const r = await get(u, url);
      expect(r.status, `${u} ${url}`).toBe(200);
      expect(r.body, `${u} ${url}`).not.toMatch(NAMES);
    }
  });
});

describe('9.4 row: crop diary detail', () => {
  it('readable by the member (own), the VLE, the FPO CEO and the operator; refused to everyone else, in particular the Bank', async () => {
    expect((await get('anima.das', `/diary/inputs`)).status).toBe(200);
    for (const u of ['subhankar.vle', 'sujata.ceo', 'debasis.ops']) expect((await get(u, `/diary/inputs?farmerId=${W.farmerId}`)).status, u).toBe(200);
    for (const u of ['arindam.bank', 'rahul.buyer', 'observer.gov', 'board.fpo', 'ratan.store']) expect((await get(u, `/diary/inputs?farmerId=${W.farmerId}`)).status, u).toBe(403);
  });
  it('a member cannot read another member diary', async () => {
    expect((await get('anima.das', `/diary/inputs?farmerId=${'0'.repeat(8)}-0000-4000-8000-${'0'.repeat(12)}`)).status).toBe(403);
  });
  it('the buyer and the consumer get only the PHI flag (phiCompliant), no products or doses', async () => {
    const p = (await get('rahul.buyer', `/lots/${W.sscc}`)).json();
    expect(typeof p.phiCompliant).toBe('boolean');
    expect((await get(undefined, `/public/provenance/${W.sscc}`)).json().phiCompliant).toBe(true);
    expect(JSON.stringify(p)).not.toMatch(/Mancozeb|dose|activeIngredient/);
  });
});

describe('9.4 row: grade and weight', () => {
  it('every role that can open the lot sees grade and net weight; the consumer sees the grade only', async () => {
    for (const u of ['anima.das', 'subhankar.vle', 'sujata.ceo', 'arindam.bank', 'rahul.buyer', 'observer.gov']) { const p = (await get(u, `/lots/${W.sscc}`)).json(); expect([p.grade, p.netKg], u).toEqual(['A', 1964]); }
    const pub = (await get(undefined, `/public/provenance/${W.sscc}`)).json();
    expect(pub.grade).toBe('A');
    expect(pub).not.toHaveProperty('netKg');
  });
});

describe('9.4 row: lien and loan', () => {
  it('the member sees only that the lot is pledged; the VLE and the Buyer see nothing; CEO, board, Bank and Observer see the lien', async () => {
    expect((await get('anima.das', `/lots/${W.sscc}`)).json().lien).toEqual({ status: 'ACTIVE' });
    expect((await get('subhankar.vle', `/lots/${W.sscc}`)).json()).not.toHaveProperty('lien');
    expect((await get('subhankar.vle', `/lots/${W.sscc}`)).json().storage).not.toHaveProperty('enwr');
    for (const u of ['sujata.ceo', 'board.fpo', 'arindam.bank', 'observer.gov']) { const l = (await get(u, `/lots/${W.sscc}`)).json().lien; expect(l.status, u).toBe('ACTIVE'); expect(l.lienId, u).toBe('LIEN-2026-00040'); }
    expect((await get('rahul.buyer', `/lots/${W.sscc}`)).status).toBe(200); // SOLD lots are visible to the buyer, but without the lien
    expect((await get('rahul.buyer', `/lots/${W.sscc}`)).json()).not.toHaveProperty('lien');
  });
  it('the consumer view has no lien field at all', async () => { expect((await get(undefined, `/public/provenance/${W.sscc}`)).body).not.toMatch(/lien|loan|ENWR/i); });
});

describe('9.4 row: loan terms (private data collection)', () => {
  it('amount, tenure and rate only for the CEO and the Bank', async () => {
    for (const u of ['sujata.ceo', 'arindam.bank']) { const l = (await get(u, `/loans/${W.loanId}`)).json(); expect([l.amount, l.tenureDays, l.ratePct], u).toEqual([54000, 180, 9.5]); }
    for (const u of ['anima.das', 'subhankar.vle', 'rahul.buyer', 'observer.gov', 'board.fpo', 'debasis.ops']) expect((await get(u, `/loans/${W.loanId}`)).status, u).toBe(403);
  });
  it('the collateral list (Observer may read it) carries no loan amount, tenure or rate', async () => {
    expect((await get('observer.gov', '/collateral')).body).not.toMatch(/54000|tenureDays|ratePct|"amount"/);
  });
});

describe('9.4 row: sale price (private data collection)', () => {
  it('readable only by the FPO CEO and the Buyer, from the collection', async () => {
    for (const u of ['sujata.ceo', 'rahul.buyer']) expect((await get(u, `/orders/${W.orderId}/price`)).json().pricePerQtl, u).toBe(W.price);
    for (const u of ['arindam.bank', 'observer.gov', 'board.fpo', 'subhankar.vle', 'anima.das']) { const r = await get(u, `/orders/${W.orderId}/price`); expect([r.status, r.json().error.code], u).toEqual([403, 'ERR_FORBIDDEN_ORG']); }
  });
  it('the price never appears in a lot passport, an order, the catalogue, the explorer search or the provenance; only the hash does', async () => {
    for (const [u, url] of [['sujata.ceo', `/lots/${W.sscc}`], ['rahul.buyer', `/lots/${W.sscc}`], ['observer.gov', `/lots/${W.sscc}`], ['sujata.ceo', `/orders/${W.orderId}`], ['rahul.buyer', '/orders'], [undefined, `/public/provenance/${W.sscc}`]] as const) {
      const r = await get(u, url);
      expect(r.body, `${u} ${url}`).not.toMatch(/1580|pricePerQtl/);
    }
    expect((await get('observer.gov', `/lots/${W.sscc}`)).json().order.priceHash).toBe('e'.repeat(64));
  });
  it('the member sees her own payout in her statement and nothing of other lots', async () => {
    const s = (await get('anima.das', '/statements/me')).json().items;
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ sscc: W.sscc, net: 30411, gross: 31031, upiRef: '604512339876' });
  });
});

describe('9.4 row: patronage', () => {
  it('own statement for the member; runs and preview for the CEO; runs for the board; nobody else', async () => {
    expect((await get('sujata.ceo', '/patronage/runs')).json().items[0].memberCount).toBe(1);
    expect((await get('board.fpo', '/patronage/runs')).status).toBe(200);
    for (const u of ['subhankar.vle', 'arindam.bank', 'rahul.buyer', 'observer.gov', 'anima.das']) expect((await get(u, '/patronage/runs')).status, u).toBe(403);
    for (const u of ['subhankar.vle', 'arindam.bank', 'rahul.buyer', 'observer.gov', 'sujata.ceo']) expect((await get(u, '/statements/me')).status, u).toBe(403);
  });
  it('the Observer gets equity metrics through the KPIs, with no per-member amounts', async () => {
    const r = await get('observer.gov', '/kpis');
    expect(r.status).toBe(200);
    expect(r.body).not.toMatch(/30411|31031|FT-9c2e/);
  });
});

describe('everything else that is read-only works without touching the ledger', () => {
  it('lists, collateral, orders, loans, KPIs and prices are answered from the index', async () => {
    for (const [u, url] of [['sujata.ceo', '/lots'], ['arindam.bank', '/collateral'], ['sujata.ceo', '/orders'], ['sujata.ceo', '/loans'], ['board.fpo', '/kpis'], ['rahul.buyer', '/prices'], ['rahul.buyer', '/prices/msp'], [undefined, '/villages'], ['sujata.ceo', '/audit/sample'], ['arindam.bank', '/reputation/attestors'], ['sujata.ceo', '/storage/deposits']] as const) {
      expect((await get(u, url)).status, `${u} ${url}`).toBe(200);
    }
    expect(t.ledger.calls).toEqual([]);
  });
});
