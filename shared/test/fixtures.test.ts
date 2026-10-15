import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { ENDPOINTS } from '../mock/endpoints.mjs';
import { isValidSscc, canonicalJson, CONTRACT_VERSION } from '../contract.ts';
import { ajv, validatorFor, resName } from './helpers.ts';

const dir = new URL('../fixtures/', import.meta.url);
type Ex = { endpoint: string; params?: Record<string, string>; query?: Record<string, string>; status?: number; body: any };
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const loaded = files.map((f) => ({ f, json: JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as { _meta: any; examples: Ex[] } }));
const all: (Ex & { file: string })[] = loaded.flatMap(({ f, json }) => json.examples.map((e) => ({ ...e, file: f })));
const byId = new Map(ENDPOINTS.map((e) => [e.id, e]));

test('the ten required fixture files exist', () => {
  for (const n of ['auth', 'ledger', 'lots', 'collateral', 'orders', 'statements', 'kpis', 'prices', 'provenance', 'villages']) assert.ok(files.includes(`${n}.json`), `${n}.json`);
  for (const { f, json } of loaded) assert.equal(json._meta.contractVersion, CONTRACT_VERSION, f);
});

test('every example matches the response schema of its endpoint (contract types)', () => {
  const bad: string[] = [];
  for (const ex of all) {
    const e = byId.get(ex.endpoint);
    if (!e) { bad.push(`${ex.file}: unknown endpoint ${ex.endpoint}`); continue; }
    const name = (ex.status ?? 200) >= 400 ? 'ApiError' : resName(ex.endpoint);
    const v = validatorFor(name);
    if (!v(ex.body)) bad.push(`${ex.file} ${ex.endpoint} ${JSON.stringify(ex.params ?? {})} -> ${name}: ${ajv.errorsText(v.errors, { dataVar: 'body' }).slice(0, 300)}`);
  }
  assert.deepEqual(bad, []);
});

test('every GET endpoint that returns JSON has at least one fixture example', () => {
  const have = new Set(all.map((e) => e.endpoint));
  const missing = ENDPOINTS.filter((e) => e.method === 'GET' && !e.content && !have.has(e.id)).map((e) => e.id);
  assert.deepEqual(missing, []);
});
test('every POST/DELETE endpoint has a receipt example, except the ones that return plain data', () => {
  const have = new Set(all.map((e) => e.endpoint));
  const expectedMissing = new Set<string>(); // all write endpoints must have an example; none are exempt
  const missing = ENDPOINTS.filter((e) => e.method !== 'GET' && !have.has(e.id) && !expectedMissing.has(e.id)).map((e) => e.id);
  assert.deepEqual(missing, []);
});

test('every tx ID and hash in fixtures is a FIXTURE- placeholder; no real-looking 64-hex tx IDs', () => {
  const txIds: string[] = [];
  const walk = (v: any) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { for (const [k, x] of Object.entries(v)) { if (k === 'txId' && typeof x === 'string') txIds.push(x); if ((k === 'blockHash' || k === 'dataHash' || k === 'previousHash') && typeof x === 'string') assert.ok(x.startsWith('FIXTURE-'), `${k}=${x}`); walk(x); } } };
  all.forEach((e) => walk(e.body));
  assert.ok(txIds.length > 100);
  for (const t of txIds) assert.match(t, /^FIXTURE-/, t);
});

test('every proof in lots, orders, loans and provenance resolves to a ledger tx example on the same channel and block', () => {
  const tx = new Map<string, any>();
  all.filter((e) => e.endpoint === 'ledgerTx').forEach((e) => tx.set(e.body.txId, e.body));
  const bad: string[] = [];
  const walk = (v: any, where: string) => {
    if (Array.isArray(v)) v.forEach((x) => walk(x, where));
    else if (v && typeof v === 'object') {
      if (typeof v.txId === 'string' && typeof v.blockNumber === 'number' && typeof v.channel === 'string' && !('chaincode' in v) && !('validationCode' in v)) {
        const t = tx.get(v.txId);
        if (!t) bad.push(`${where}: ${v.txId} not in ledger.json`); else if (t.channel !== v.channel || t.blockNumber !== v.blockNumber) bad.push(`${where}: ${v.txId} channel/block mismatch`);
      }
      for (const x of Object.values(v)) walk(x, where);
    }
  };
  all.filter((e) => e.endpoint !== 'ledgerTx' && e.endpoint !== 'ledgerBlock' && e.endpoint !== 'eventsStream').forEach((e) => walk(e.body, `${e.file}:${e.endpoint}`));
  assert.deepEqual(bad.slice(0, 10), []);
});

test('lot passports: valid SSCCs, chronological proofs, status agrees with facts', () => {
  const passports = all.filter((e) => e.endpoint === 'getLot').map((e) => e.body);
  assert.ok(passports.length >= 15);
  const statuses = new Set<string>();
  for (const p of passports) {
    assert.ok(isValidSscc(p.sscc), p.sscc);
    assert.match(p.humanRef, /^WB-PSM-(KGP2|DBR|KSY)-(POT|PAD|BRJ|CAU)-FPO07-2026-[RKB]-\d{5}$/);
    assert.equal(p.humanRef.slice(-3), p.sscc.slice(-4, -1), `serial of ${p.sscc} must match ${p.humanRef}`);
    const txs = all.filter((e) => e.endpoint === 'ledgerTx').map((e) => e.body);
    const times = p.proofs.map((pr: any) => txs.find((t: any) => t.txId === pr.txId).timestamp as string);
    assert.deepEqual([...times].sort(), times, `proofs of ${p.sscc} must be chronological`);
    if (p.status === 'PLEDGED') assert.equal(p.lien.status, 'ACTIVE', p.sscc);
    if (p.lien?.status === 'ACTIVE') assert.equal(p.status, 'PLEDGED', p.sscc);
    if (['IN_TRANSIT', 'DELIVERED', 'SETTLED', 'CLOSED', 'REJECTED'].includes(p.status)) assert.notEqual(p.lien?.status, 'ACTIVE');
    statuses.add(p.status);
    assert.ok(!('name' in p) && !('phone' in p), 'no PII on a lot passport');
  }
  for (const s of ['PENDING_FARMER_SIGNATURE', 'COMMISSIONED', 'GRADED', 'IN_STORAGE', 'PLEDGED', 'LISTED', 'SOLD', 'IN_TRANSIT', 'DELIVERED', 'CLOSED', 'TRANSFORMED', 'REJECTED']) assert.ok(statuses.has(s), `fixture world should include a lot in ${s}`);
});

test('the farmer-signature draft payload is canonical JSON of the F2 fields', () => {
  const d = all.find((e) => e.endpoint === 'listPendingDrafts')!.body[0];
  const payload = JSON.parse(d.payloadToSign);
  assert.deepEqual(Object.keys(payload).sort(), ['bagCount', 'commodity', 'estWeightKg', 'farmerToken', 'harvestOrUnloadDate', 'plotId', 'sscc']);
  assert.equal(d.payloadToSign, canonicalJson(payload));
  assert.equal(payload.sscc, d.sscc);
});

test('patronage fixture reconciles exactly; statement lines reconcile', () => {
  const prev = all.find((e) => e.endpoint === 'patronagePreview')!.body;
  const gross = prev.lines.reduce((a: number, l: any) => a + l.gross, 0);
  assert.equal(gross, prev.settlementAmount);
  for (const l of prev.lines) assert.equal(l.gross, l.net + l.deductions.reduce((a: number, d: any) => a + d.amount, 0), l.sscc);
  const net = prev.lines.reduce((a: number, l: any) => a + l.net, 0), ded = prev.lines.reduce((a: number, l: any) => a + l.deductions.reduce((b: number, d: any) => b + d.amount, 0), 0);
  assert.equal(net + ded, prev.settlementAmount);
  assert.ok(Math.abs(net + ded - prev.settlementAmount) <= 1);
  const st = all.find((e) => e.endpoint === 'myStatements')!.body.items[0];
  assert.equal(st.gross, st.net + st.deductions.reduce((a: number, d: any) => a + d.amount, 0));
});

test('collateral valuation follows the documented formula', () => {
  const items = all.find((e) => e.endpoint === 'listCollateral' && !e.query)!.body.items;
  assert.ok(items.length >= 4);
  for (const c of items) {
    assert.equal(c.assessedValue, Math.round(c.quantityQtl * c.priceBasis.modalPerQtl * (1 - c.haircutPct / 100)), c.enwr);
    assert.equal(c.eligibleLoan, Math.round(c.assessedValue * 0.7), c.enwr);
    assert.match(c.enwr, /^ENWR-(NERL|CCRL)-2026-\d{6}$/);
  }
});

test('privacy and honesty rules in fixtures', () => {
  const text = (f: string) => readFileSync(new URL(f, dir), 'utf8');
  const prov = loaded.find((x) => x.f === 'provenance.json')!;
  assert.ok(!/"(name|nameLocal|phone)"\s*:/.test(JSON.stringify(prov.json.examples)), 'public provenance must not contain names or phones');
  const orders = loaded.find((x) => x.f === 'orders.json')!;
  assert.ok(orders.json.examples.filter((e) => e.endpoint !== 'getOrderPrice').every((e) => !JSON.stringify(e.body).includes('pricePerQtl')), 'only getOrderPrice may carry a price');
  const prices = loaded.find((x) => x.f === 'prices.json')!;
  for (const e of prices.json.examples.filter((x) => x.endpoint === 'prices')) for (const r of e.body.items) assert.match(r.source, /^FIXTURE-PLACEHOLDER/);
  for (const { f, json } of loaded) assert.match(JSON.stringify(json._meta), /FIXTURE/, `${f} _meta must say it is fixture data`);
  void text;
});

test('villages: five rows, honest precision, inside the right block box', () => {
  const v = all.find((e) => e.endpoint === 'villages')!.body as any[];
  assert.deepEqual(v.map((x) => x.code).sort(), ['CHANGUAL', 'DUAN', 'GOLGRAM', 'GOPALPUR', 'SANKOA']);
  const box: Record<string, [number, number, number, number]> = { 'Kharagpur-II': [22.2379, 22.4588, 87.3362, 87.5296], Debra: [22.3151, 22.5635, 87.4891, 87.6914], Keshiary: [22.0198, 22.2424, 87.1350, 87.3245] };
  for (const x of v) {
    const [s, n, w, e] = box[x.block]!;
    assert.ok(x.lat >= s && x.lat <= n && x.lon >= w && x.lon <= e, `${x.code} outside ${x.block}`);
    assert.ok(x.source.startsWith('https://nominatim.openstreetmap.org/') , x.code);
    if (x.precision === 'BLOCK_CENTROID') assert.match(x.note, /not mapped in OpenStreetMap/);
  }
  assert.deepEqual(v.filter((x) => x.precision === 'BLOCK_CENTROID').map((x) => x.code).sort(), ['GOLGRAM', 'GOPALPUR']);
});

test('the schema validator is not vacuous: wrong shapes are rejected', () => {
  const v = validatorFor('LedgerReceipt');
  assert.equal(v({ txId: 'x' }), false);
  const h = validatorFor('HealthResponse');
  assert.equal(h({ ok: true, ledgerMode: 'sometimes', contractVersion: '1', channels: {} }), false);
  assert.equal(h({ ok: true, ledgerMode: 'live', contractVersion: '1', channels: {}, extra: 1 }), false, 'additional properties are rejected');
  const r = validatorFor('Receipted_LotPassport');
  const ok = all.find((e) => e.endpoint === 'farmerSign')!.body;
  assert.equal(r(ok), true);
  assert.equal(r({ ...ok, resource: { ...ok.resource, status: 'NOT_A_STATUS' } }), false);
});
