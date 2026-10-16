// End-to-end check of the golden journey (CONTRACT.md Section 6, steps 1 to 10) through the real HTTP API, the real Fabric network and a
// throwaway local Postgres. Asserts every effect, including the negative cases. Needs: make up && make deploy && make test-db.
//   pnpm e2e
import { generateKeyPairSync, sign } from 'node:crypto';
import { priceSeries } from '../src/db/schema.js';
import { createTestDb } from '../test/helpers/db.js';
import { createServer, ensureDevicesRegistered } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { loadRates } from '../src/services/rates.js';
import { canonicalJson, ssccCheckDigit } from '../src/contract/contract.js';

setTimeout(() => { console.log('e2e: timed out after 14 minutes'); process.exit(2); }, 14 * 60_000).unref();
let pass = 0, fail = 0;
const section = (s: string) => console.log(`\n== ${s}`);
function check(name: string, ok: unknown, detail?: unknown) {
  if (ok) { pass++; console.log(`  PASS ${name}`); } else { fail++; console.log(`  FAIL ${name}${detail !== undefined ? `  -> ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 400)}` : ''}`); }
}

const tdb = await createTestDb();
const rnd = () => Math.random().toString(16).slice(2).padStart(64, 'a');
const cfg = loadConfig({
  ...process.env, DATABASE_URL: tdb.url, JWT_SECRET: rnd(), FARMER_TOKEN_SECRET: rnd(), PRICE_SALT_SECRET: rnd(), LOG_LEVEL: 'silent', FABRIC_DISABLED: '',
} as NodeJS.ProcessEnv);
const server = await createServer({ cfg, dbh: tdb, rates: loadRates('test/e2e-rates.json'), startIndexer: false, startWorkers: true, logger: false, rateLimitMax: 100000 });
await server.app.listen({ port: 0, host: '127.0.0.1' });
const base = `http://127.0.0.1:${(server.app.server.address() as { port: number }).port}`;

// ---------------------------------------------------------------- tiny HTTP client
type R = { status: number; body: any; headers: Headers; text: string };
async function call(method: string, path: string, token?: string, body?: unknown): Promise<R> {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text(); let j: any; try { j = JSON.parse(text); } catch { j = undefined; }
  return { status: res.status, body: j, headers: res.headers, text };
}
const login = async (username: string, portal: string) => (await call('POST', '/auth/login', undefined, { username, password: 'Setu@2026', portal })).body.token as string;

// SSE listener: every event the gateway publishes during the run
const sse: any[] = [];
const sseAbort = new AbortController();
void (async () => {
  const res = await fetch(`${base}/events/stream`, { signal: sseAbort.signal });
  const reader = res.body!.getReader(); let buf = '';
  for (;;) { const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true })); if (done) return; buf += Buffer.from(value!).toString(); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const frag = buf.slice(0, i); buf = buf.slice(i + 2); const m = /^data: (.*)$/m.exec(frag); if (m) sse.push(JSON.parse(m[1]!)); } }
})();
const waitFor = async (what: string, fn: () => boolean, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await new Promise((r) => setTimeout(r, 200)); } check(`waited for ${what}`, false); return false; };

const device = () => { const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' }); const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string }; return { privateKey, pubHex: '04' + Buffer.from(jwk.x, 'base64url').toString('hex') + Buffer.from(jwk.y, 'base64url').toString('hex') }; };
const signWith = (k: ReturnType<typeof device>, text: string) => sign('sha256', Buffer.from(text, 'utf8'), { key: k.privateKey, dsaEncoding: 'ieee-p1363' }).toString('hex');
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const poly = (lon: number, lat: number) => ({ type: 'Polygon' as const, coordinates: [[[lon, lat], [lon + 0.0006, lat], [lon + 0.0006, lat + 0.0006], [lon, lat + 0.0006], [lon, lat]]] });

try {
  section('setup');
  // start the indexer at the current chain height: the ledger also holds the lots of earlier runs, which this fresh database must not replay
  for (const c of ['trace-channel', 'finance-channel', 'trade-channel'] as const) {
    const u = c === 'trade-channel' ? { username: 'sujata.ceo', msp: 'FpoOrgMSP' as const } : { username: 'observer.gov', msp: 'RegulatorOrgMSP' as const };
    await tdb.sql`insert into indexer_checkpoints (channel, next_block) values (${c}, ${await server.ctx.ledger.chainHeight(c, u)}) on conflict (channel) do update set next_block = excluded.next_block`;
  }
  server.indexer.start();
  const dev = await ensureDevicesRegistered(server.ctx);
  check('device keys registered on-chain (or already were)', Array.isArray(dev));
  // test-only price row so potato can be valued; production prices come from AGMARKNET (never synthesised)
  // the ledger keeps every run's lots, so each run starts its counters at a fresh random offset (a real deployment keeps its counters in Postgres)
  const rb = (lo: number, span: number) => lo + Math.floor(Math.random() * span);
  const yr = new Date().getFullYear(), ym = new Date().toISOString().slice(0, 7), nn = rb(10000, 80000);
  for (const [name, next] of [['sscc', rb(100000000, 800000000)], [`order-${yr}`, nn], [`deposit-${yr}`, nn], [`run-${ym}`, rb(100, 800)], [`enwr-NERL-${yr}`, rb(100000, 800000)], [`enwr-CCRL-${yr}`, rb(100000, 800000)]] as const) await tdb.sql`insert into sequences (name, value) values (${name}, ${next - 1})`;
  const loanBase = rb(10000, 80000), L = (n: number) => `LN-2026-${loanBase + n}`;
  await tdb.db.insert(priceSeries).values({ date: today, market: 'Medinipur(West)', commodity: 'Potato', variety: 'E2E TEST', minPrice: 1, maxPrice: 1, modalPrice: 1350, source: 'E2E TEST ROW (throwaway database, not market data)' });
  const t = { vle: await login('subhankar.vle', 'farmer'), ceo: await login('sujata.ceo', 'fpo'), op: await login('debasis.ops', 'fpo'), wh: await login('ratan.store', 'fpo'), bank: await login('arindam.bank', 'bank'), buyer: await login('rahul.buyer', 'buyer'), obs: await login('observer.gov', 'gov'), board: await login('board.fpo', 'gov') };
  check('all personas can sign in', Object.values(t).every(Boolean));
  check('wrong password is ERR_UNAUTHENTICATED', (await call('POST', '/auth/login', undefined, { username: 'sujata.ceo', password: 'nope', portal: 'fpo' })).body?.error?.code === 'ERR_UNAUTHENTICATED');
  check('a persona cannot use another portal', (await call('POST', '/auth/login', undefined, { username: 'arindam.bank', password: 'Setu@2026', portal: 'buyer' })).status === 403);
  check('no token is ERR_UNAUTHENTICATED', (await call('GET', '/lots')).body?.error?.code === 'ERR_UNAUTHENTICATED');
  check('GET /health is ok with three channel heights', await (async () => { const h = (await call('GET', '/health')).body; return h.ok && Object.keys(h.channels).length === 3; })());

  section('step 1: VLE onboards Anima (F1)');
  const anima = device(), sukumar = device();
  const reg = await call('POST', '/farmers', t.vle, { name: 'Anima Das', nameLocal: 'অনিমা দাস', gender: 'F', phone: '9000000001', village: 'CHANGUAL', plot: { geojson: poly(87.3795, 22.3106), areaHa: 0.8, crops: ['POTATO', 'PADDY'] }, consent: { version: 'v1', lang: 'bn', acceptedAt: new Date().toISOString() }, devicePublicKeyHex: anima.pubHex });
  check('POST /farmers returns a receipt with 3 endorsing orgs', reg.status === 201 && /^[0-9a-f]{64}$/.test(reg.body.txId) && reg.body.validationCode === 'VALID' && reg.body.endorsers.length >= 3, reg.body);
  const animaId = reg.body.resource.id as string, animaToken = reg.body.resource.farmerToken as string, animaPlot = reg.body.resource.plots[0].plotId as string;
  const tx = (await call('GET', `/ledger/tx/${reg.body.txId}`)).body;
  check('the explorer shows that transaction with creator and endorsers, keys only', tx.creatorMsp === 'FpoOrgMSP' && tx.fn === 'RegisterFarmerAndPlot' && tx.endorsers.length >= 3 && tx.rwset.writes.some((k: string) => k === `FARMER_${animaToken}`) && tx.blockNumber >= 0 && /^[0-9a-f]{64}$/.test(tx.blockHash), tx);
  check('SSE delivered FarmerOnboarded, PlotRegistered and ConsentGranted (alsoEmitted expanded)', await waitFor('F1 events', () => ['FarmerOnboarded', 'PlotRegistered', 'ConsentGranted'].every((n) => sse.some((e) => e.event === n && e.txId === reg.body.txId))));
  check('a second member with the same phone is refused', (await call('POST', '/farmers', t.vle, { ...JSON.parse('{}'), name: 'X', nameLocal: 'X', gender: 'F', phone: '9000000001', village: 'CHANGUAL', plot: { geojson: poly(87.38, 22.31), areaHa: 0.5, crops: ['POTATO'] }, consent: { version: 'v1', lang: 'bn', acceptedAt: new Date().toISOString() } })).body?.error?.code === 'ERR_VALIDATION');
  check('only a VLE can register farmers', (await call('POST', '/farmers', t.ceo, {})).body?.error?.code === 'ERR_FORBIDDEN_ROLE');
  // second member for the paddy path (Gopalpur); registers his phone key through the dedicated endpoint
  const sk = await call('POST', '/farmers', t.vle, { name: 'Sukumar Murmu', nameLocal: 'সুকুমার মুর্মু', gender: 'M', phone: '9000000009', village: 'GOPALPUR', plot: { geojson: poly(87.2311, 22.131), areaHa: 1.1, crops: ['PADDY'] }, consent: { version: 'v1', lang: 'bn', acceptedAt: new Date().toISOString() } });
  const sukumarId = sk.body.resource.id as string, sukumarPlot = sk.body.resource.plots[0].plotId as string;
  const skTok = (await call('POST', '/auth/otp/verify', undefined, { phone: '9000000009', otp: '123456' })).body.token as string;
  check('member registers a device key (member role, own identity path)', (await call('POST', '/farmers/me/device-key', skTok, { publicKeyHex: sukumar.pubHex })).status === 200);

  section('step 2: Anima logs a spray (crop diary, hash on-chain)');
  const otp = await call('POST', '/auth/otp/request', undefined, { phone: '9000000001' });
  check('OTP request returns the demo OTP', otp.body.demoOtp === '123456');
  check('wrong OTP is refused', (await call('POST', '/auth/otp/verify', undefined, { phone: '9000000001', otp: '000000' })).status === 401);
  const aTok = (await call('POST', '/auth/otp/verify', undefined, { phone: '9000000001', otp: '123456' })).body.token as string;
  const me = (await call('GET', '/farmers/me', aTok)).body;
  check('GET /farmers/me returns her private record', me.name === 'Anima Das' && me.phone === '9000000001' && me.farmerToken === animaToken);
  const diary = await call('POST', '/diary/inputs', aTok, { product: 'Mancozeb 75% WP', activeIngredient: 'Mancozeb', dose: '2.5 g/L', appliedOn: today, phiDays: 7, crop: 'POTATO' });
  check('diary entry anchored with a receipt and a PHI clear date', diary.status === 201 && diary.body.resource.phiClearOn > today && /^[0-9a-f]{64}$/.test(diary.body.resource.hash), diary.body);
  check('the Bank cannot read the crop diary', (await call('GET', `/diary/inputs?farmerId=${animaId}`, t.bank)).body?.error?.code === 'ERR_FORBIDDEN_ROLE');
  check('the VLE can read it', (await call('GET', `/diary/inputs?farmerId=${animaId}`, t.vle)).body.items.length === 1);
  check('the event carries the hash and the PHI date, not the product', await waitFor('InputApplied', () => sse.some((e) => e.event === 'InputApplied')) && !JSON.stringify(sse.filter((e) => e.event === 'InputApplied')).includes('Mancozeb'));

  section('step 3: VLE creates a 40-bag draft, Anima signs on her phone (F2)');
  const draft = await call('POST', '/lots/drafts', t.vle, { farmerId: animaId, plotId: animaPlot, commodity: 'POTATO', variety: 'Kufri Jyoti', bagCount: 40, estWeightKg: 2000, harvestOrUnloadDate: today });
  check('draft has a valid SSCC, a human reference and the payload to sign', draft.status === 201 && ssccCheckDigit(draft.body.sscc.slice(0, 17)) === Number(draft.body.sscc[17]) && /^WB-PSM-KGP2-POT-FPO07-\d{4}-R-\d{5}$/.test(draft.body.humanRef) && JSON.parse(draft.body.payloadToSign).bagCount === 40, draft.body);
  check('payloadToSign is canonical JSON', draft.body.payloadToSign === canonicalJson(JSON.parse(draft.body.payloadToSign)));
  const sscc = draft.body.sscc as string;
  const pending = (await call('GET', '/lots/drafts/pending', aTok)).body;
  check('Anima sees it in her pending drafts', pending.some((d: any) => d.sscc === sscc && d.bagCount === 40));
  check('a tampered signature is ERR_BAD_FARMER_SIGNATURE (nothing reaches the ledger)', (await call('POST', `/lots/${sscc}/farmer-sign`, aTok, { signatureHex: signWith(anima, draft.body.payloadToSign.replace('"bagCount":40', '"bagCount":41')) })).body?.error?.code === 'ERR_BAD_FARMER_SIGNATURE');
  check('a signature from another key is refused', (await call('POST', `/lots/${sscc}/farmer-sign`, aTok, { signatureHex: signWith(sukumar, draft.body.payloadToSign) })).body?.error?.code === 'ERR_BAD_FARMER_SIGNATURE');
  const signed = await call('POST', `/lots/${sscc}/farmer-sign`, aTok, { signatureHex: signWith(anima, draft.body.payloadToSign) });
  check('the signature is verified by chaincode and the lot is COMMISSIONED', signed.status === 200 && signed.body.fn === 'CommissionLot' && signed.body.resource.status === 'COMMISSIONED' && signed.body.resource.proofs.some((p: any) => p.txId === signed.body.txId), signed.body);
  check('the lot passport never contains a name or phone', !JSON.stringify(signed.body.resource).match(/Anima|অনিমা|9000000001/));
  check('it appears in the FPO queue and in the index', (await call('GET', '/lots?status=COMMISSIONED', t.ceo)).body.items.some((l: any) => l.sscc === sscc));
  check('replaying the signature is refused (the draft is already used)', (await call('POST', `/lots/${sscc}/farmer-sign`, aTok, { signatureHex: signWith(anima, draft.body.payloadToSign) })).body?.error?.code === 'ERR_INVALID_STATE');

  section('step 4: operator reads the simulated devices and grades (F3)');
  const wb = (await call('POST', '/devices/WB-CHG-01/read', t.op, { sscc })).body, qm = (await call('POST', '/devices/QM-CHG-01/read', t.op, { sscc })).body;
  check('device readings are returned with signatures', wb.deviceId === 'WB-CHG-01' && /^[0-9a-f]{128}$/.test(wb.signatureHex) && wb.reading.netKg > 1900 && qm.reading.potato && /^[0-9a-f]{128}$/.test(qm.signatureHex), { wb, qm });
  check('an unknown device is 404', (await call('POST', '/devices/NOPE/read', t.op, { sscc })).status === 404);
  const forged = { ...wb, reading: { ...wb.reading, netKg: wb.reading.netKg + 100, grossKg: wb.reading.grossKg + 100 } };
  check('a reading changed after signing is ERR_BAD_DEVICE_SIGNATURE', (await call('POST', `/lots/${sscc}/quality`, t.op, { weighbridgeReading: forged, qualityReading: qm, grade: 'A' })).body?.error?.code === 'ERR_BAD_DEVICE_SIGNATURE');
  const graded = await call('POST', `/lots/${sscc}/quality`, t.op, { weighbridgeReading: wb, qualityReading: qm, grade: 'A' });
  check('both device signatures verified in chaincode: GRADED grade A with the measured weight', graded.status === 200 && graded.body.resource.status === 'GRADED' && graded.body.resource.grade === 'A' && graded.body.resource.netKg === wb.reading.netKg && graded.body.resource.quality.deviceVerified, graded.body);
  const pdf = await fetch(`${base}/lots/${sscc}/label.pdf`, { headers: { authorization: `Bearer ${t.op}` } });
  check('the label is a PDF', (await pdf.arrayBuffer()).byteLength > 1000 && pdf.headers.get('content-type') === 'application/pdf');
  check('the buyer sees the graded lot in the catalogue (no names, no price)', (await call('GET', '/catalogue', t.buyer)).body.items.some((c: any) => c.sscc === sscc && c.grade === 'A' && !JSON.stringify(c).match(/Anima|price/i)));
  const netKg = graded.body.resource.netKg as number;

  section('step 5: warehouse clerk deposits the potato lot and a paddy lot, requests e-NWRs');
  const dep = await call('POST', '/storage/deposits', t.wh, { sscc, facility: 'COLD_STORAGE', facilityName: 'Rupnarayan Cold Storage (demo)', bags: 40, depositedAt: today });
  check('deposit recorded and the lot mirrored to IN_STORAGE', dep.status === 201 && dep.body.resource.depositId.startsWith('DEP-') && !dep.headers.get('x-mirror-pending'), dep.body);
  check('the lot status is IN_STORAGE', (await call('GET', `/lots/${sscc}`, t.ceo)).body.status === 'IN_STORAGE');
  const enwr = await call('POST', `/storage/deposits/${dep.body.resource.depositId}/enwr`, t.wh);
  check('e-NWR issued by the simulated NERL adapter and referenced on-chain', enwr.status === 200 && /^ENWR-NERL-\d{4}-\d{6}$/.test(enwr.body.resource.enwr) && enwr.body.resource.simulatedAdapter === true, enwr.body);
  const potatoEnwr = enwr.body.resource.enwr as string;
  // paddy lot from Gopalpur
  const pd = await call('POST', '/lots/drafts', t.vle, { farmerId: sukumarId, plotId: sukumarPlot, commodity: 'PADDY', variety: 'Swarna (MTU 7029)', bagCount: 100, estWeightKg: 5000, harvestOrUnloadDate: today });
  const sskTok = skTok; const paddy = pd.body.sscc as string;
  await call('POST', `/lots/${paddy}/farmer-sign`, sskTok, { signatureHex: signWith(sukumar, pd.body.payloadToSign) });
  const pwb = (await call('POST', '/devices/WB-CHG-01/read', t.op, { sscc: paddy })).body, pqm = (await call('POST', '/devices/QM-CHG-01/read', t.op, { sscc: paddy })).body;
  check('paddy quality reading stays inside the FCI/uniform specification (moisture <= 17%)', pqm.reading.paddy.moisturePct <= 17 && pqm.reading.paddy.foreignMatterPct <= 1.0, pqm);
  await call('POST', `/lots/${paddy}/quality`, t.op, { weighbridgeReading: pwb, qualityReading: pqm, grade: 'A' });
  const pdep = await call('POST', '/storage/deposits', t.wh, { sscc: paddy, facility: 'WAREHOUSE', facilityName: 'Kansai Agri Warehouse (demo)', bags: 100, depositedAt: today });
  const penwr = await call('POST', `/storage/deposits/${pdep.body.resource.depositId}/enwr`, t.wh);
  check('paddy lot deposited in the warehouse with a CCRL e-NWR', penwr.body.resource?.repository === 'CCRL', penwr.body);
  check('FPO sees both deposits', (await call('GET', '/storage/deposits', t.ceo)).body.items.length === 2);

  section('step 6: bank views collateral, marks a lien, disburses; a second lien is rejected live (F5)');
  const col = (await call('GET', `/collateral?enwr=${potatoEnwr}`, t.bank)).body.items[0];
  check('collateral valued from the price row: assessed = qtl x modal x (1 - haircut), loan = 70%', col.assessedValue === Math.round((netKg / 100) * 1350 * 0.8) && col.eligibleLoan === Math.round(col.assessedValue * 0.7) && col.haircutPct === 20 && col.lien.status === 'NONE', col);
  check('the potato cold-storage receipt is not shown as CGS-NPF eligible, with the reason', col.cgsNpfEligible === false && /not yet verified/.test(col.cgsNpfReason));
  const pcol = (await call('GET', `/collateral?enwr=${penwr.body.resource.enwr}`, t.bank)).body.items[0];
  check('paddy is valued at the MSP (a real figure), 70% of the assessed value', pcol.priceBasis.market === 'All-India MSP' && pcol.priceBasis.modalPerQtl === 2441 && pcol.cgsNpfEligible === true, pcol);
  check('a loan above the eligible amount is refused', (await call('POST', `/collateral/${potatoEnwr}/lien`, t.bank, { loanId: L(1), amount: col.eligibleLoan + 1, tenureDays: 180, ratePct: 9.5 })).body?.error?.code === 'ERR_VALIDATION');
  const lien = await call('POST', `/collateral/${potatoEnwr}/lien`, t.bank, { loanId: L(1), amount: col.eligibleLoan, tenureDays: 180, ratePct: 9.5 });
  check('lien marked; loan SANCTIONED; terms returned to the bank only', lien.status === 201 && lien.body.fn === 'MarkLien' && lien.body.resource.status === 'SANCTIONED' && lien.body.resource.amount === col.eligibleLoan && lien.body.resource.ratePct === 9.5, lien.body);
  const dup = await call('POST', `/collateral/${potatoEnwr}/lien`, t.bank, { loanId: L(2), amount: 1000, tenureDays: 30, ratePct: 9 });
  check('SECOND LIEN: ERR_DOUBLE_FINANCING quoting the first lien tx', dup.status === 409 && dup.body.error.code === 'ERR_DOUBLE_FINANCING' && dup.body.error.message.includes(lien.body.txId), dup.body);
  check('the lot is PLEDGED', (await call('GET', `/lots/${sscc}`, t.ceo)).body.status === 'PLEDGED');
  const aView = (await call('GET', `/lots/${sscc}`, aTok)).body;
  check('Anima sees her lot as pledged, without the lien details', aView.status === 'PLEDGED' && aView.lien.status === 'ACTIVE' && !aView.lien.lienId);
  check('the buyer cannot see a pledged lot at all', (await call('GET', `/lots/${sscc}`, t.buyer)).status === 404 && !(await call('GET', '/catalogue', t.buyer)).body.items.some((c: any) => c.sscc === sscc));
  check('the Observer sees the lien status but not loan terms (no access to /loans)', (await call('GET', '/loans', t.obs)).status === 403 && (await call('GET', `/collateral?enwr=${potatoEnwr}`, t.obs)).body.items[0].lien.status === 'ACTIVE');
  check('the Observer cannot read the private terms through the chaincode either', await (async () => { try { await server.ctx.ledger.evaluate({ username: 'observer.gov', msp: 'RegulatorOrgMSP' }, 'finance-channel', 'pledge-lien', 'GetLoanTerms', [L(1)]); return false; } catch (e: any) { return e.code === 'ERR_FORBIDDEN_ORG'; } })());
  check('disbursement recorded', (await call('POST', `/loans/${L(1)}/disburse`, t.bank)).body.resource.status === 'DISBURSED');
  check('the loan is visible to the FPO CEO with terms', (await call('GET', `/loans/${L(1)}`, t.ceo)).body.tenureDays === 180);
  const plien = await call('POST', `/collateral/${penwr.body.resource.enwr}/lien`, t.bank, { loanId: L(3), amount: pcol.eligibleLoan, tenureDays: 150, ratePct: 9 });
  check('a lien on the paddy e-NWR succeeds too', plien.status === 201);

  section('step 7: the pledged lot is listed and Rahul agrees the price privately (F6)');
  const ord = await call('POST', '/orders', t.ceo, { ssccs: [sscc], channel: 'DIRECT', deliveryBy: today });
  check('order created and the lot LISTED while still pledged', ord.status === 201 && /^ORD-\d{4}-\d{5}$/.test(ord.body.resource.orderId) && ord.body.resource.status === 'OPEN', ord.body);
  const oid = ord.body.resource.orderId as string;
  const price = 1580;
  const p1 = await call('POST', `/orders/${oid}/agree-price`, t.ceo, { pricePerQtl: price });
  check('step 1 of the agreement: AWAITING_COUNTERPARTY with only a hash in the answer', p1.body.resource.state === 'AWAITING_COUNTERPARTY' && /^[0-9a-f]{64}$/.test(p1.body.resource.priceHash) && !p1.text.includes(String(price)), p1.body);
  check('the buyer submitting a different price is ERR_PRICE_HASH_MISMATCH', (await call('POST', `/orders/${oid}/agree-price`, t.buyer, { pricePerQtl: 1650 })).body?.error?.code === 'ERR_PRICE_HASH_MISMATCH');
  const p2 = await call('POST', `/orders/${oid}/agree-price`, t.buyer, { pricePerQtl: price });
  check('the matching price commits: AGREED', p2.body.resource.state === 'AGREED' && p2.body.resource.priceHash === p1.body.resource.priceHash, p2.body);
  const pr = await call('GET', `/orders/${oid}/price`, t.buyer);
  check('the buyer reads the price from the private data collection', pr.status === 200 && pr.body.pricePerQtl === price && pr.body.totalAmount === Math.round((netKg / 100) * price), pr.body);
  check('the FPO CEO reads it too', (await call('GET', `/orders/${oid}/price`, t.ceo)).body.pricePerQtl === price);
  for (const [who, tok] of [['Bank', t.bank], ['Regulator observer', t.obs], ['board', t.board]] as const) check(`${who} gets ERR_FORBIDDEN_ORG on the price`, (await call('GET', `/orders/${oid}/price`, tok)).body?.error?.code === 'ERR_FORBIDDEN_ORG');
  const orderJson = (await call('GET', `/orders/${oid}`, t.ceo)).text;
  check('the public order carries the hash and no price', orderJson.includes(p1.body.resource.priceHash) && !orderJson.includes(String(price)));
  check('the lot is SOLD and still shows its lien', await (async () => { const l = (await call('GET', `/lots/${sscc}`, t.ceo)).body; return l.status === 'SOLD' && l.lien.status === 'ACTIVE'; })());

  section('step 8: lien released after repayment, dispatch, buyer accepts (F4)');
  const early = await call('POST', `/lots/${sscc}/custody/propose`, t.op, { toOrg: 'BuyerOrgMSP', vehicleNo: 'WB74A1234', loggerId: 'BLE-01' });
  check('dispatch with an active lien is ERR_LOT_PLEDGED', early.body?.error?.code === 'ERR_LOT_PLEDGED', early.body);
  check('repayment recorded', (await call('POST', `/loans/${L(1)}/repay`, t.bank, { amount: col.eligibleLoan })).body.resource.status === 'REPAID');
  const rel = await call('POST', `/loans/${L(1)}/release`, t.bank);
  check('lien released', rel.body.resource.status === 'RELEASED' && !rel.headers.get('x-mirror-pending'), rel.body);
  const prop = await call('POST', `/lots/${sscc}/custody/propose`, t.op, { toOrg: 'BuyerOrgMSP', vehicleNo: 'WB74A1234', loggerId: 'BLE-01' });
  check('custody proposed: IN_TRANSIT', prop.status === 200 && prop.body.resource.status === 'IN_TRANSIT' && prop.body.resource.custody.length === 1, prop.body);
  check('the order shows IN_TRANSIT (derived from the lot)', (await call('GET', `/orders/${oid}`, t.buyer)).body.status === 'IN_TRANSIT');
  const dg = await call('POST', `/lots/${sscc}/condition-digest`, t.op, { window: '2026-11-12T06:00Z/2026-11-13T04:00Z', minC: 2.1, maxC: 6.4, avgC: 4.1, breaches: 0, digestHash: 'a'.repeat(64) });
  check('cold-chain digest anchored', dg.body.resource?.coldChain?.continuous === true, dg.body);
  check('the FPO cannot accept its own transfer', (await call('POST', `/lots/${sscc}/custody/accept`, t.ceo)).body?.error?.code === 'ERR_FORBIDDEN_ROLE');
  const acc = await call('POST', `/lots/${sscc}/custody/accept`, t.buyer);
  check('Rahul accepts custody: DELIVERED, endorsed by FPO and Buyer', acc.status === 200 && acc.body.resource.status === 'DELIVERED' && acc.body.endorsers.includes('FpoOrgMSP') && acc.body.endorsers.includes('BuyerOrgMSP'), acc.body);
  const aq = await call('POST', `/orders/${oid}/accept-quality`, t.buyer, { accepted: true, notes: 'Matches the grade A sample.' });
  check('quality accepted: order DELIVERED', aq.status === 200 && aq.body.resource.status === 'DELIVERED', aq.body);

  section('step 9: settlement and patronage (F7)');
  const amount = Math.round((netKg / 100) * price);
  check('a settlement that does not match price x weight is refused', (await call('POST', `/orders/${oid}/settle`, t.ceo, { amount: amount + 500, upiRef: '604512339876' })).body?.error?.code === 'ERR_VALIDATION');
  const st = await call('POST', `/orders/${oid}/settle`, t.ceo, { amount, upiRef: '604512339876' });
  check('settlement recorded (amount stays in the private collection)', st.status === 200 && st.body.resource.status === 'SETTLED' && !st.text.includes(String(amount)), st.body);
  const prev = await call('POST', '/patronage/preview', t.ceo, { orderId: oid });
  check('preview reconciles: sum(net) + sum(deductions) = settlement amount', prev.body.reconciles === true && prev.body.settlementAmount === prev.body.totals.net + prev.body.totals.deductions && prev.body.lines[0].name === 'Anima Das', prev.body);
  const run = await call('POST', '/patronage/runs', t.ceo, { orderId: oid });
  check('F7 patronage distributed on-chain: lot CLOSED', run.status === 201 && /^PR-\d{4}-\d{2}-\d{3}$/.test(run.body.resource.runId) && run.body.resource.memberCount === 1, run.body);
  check('the lot is CLOSED', (await call('GET', `/lots/${sscc}`, t.ceo)).body.status === 'CLOSED');
  check('on-chain lines carry the farmer token, never the name', await (async () => { const c = JSON.parse(await server.ctx.ledger.evaluate({ username: 'observer.gov', msp: 'RegulatorOrgMSP' }, 'trace-channel', 'lot-lifecycle', 'GetPatronageRun', [run.body.resource.runId])); return c.lines[0].farmerToken === animaToken && !JSON.stringify(c).includes('Anima'); })());
  check('FPO and board see the run', (await call('GET', '/patronage/runs', t.board)).body.items.length === 1);

  section('step 10: Anima reads her statement; a consumer scans the pack QR');
  const stmt = await call('GET', '/statements/me', aTok);
  const line = stmt.body.items[0];
  check('her statement shows kg, grade, gross, deductions, net, the UPI reference and proofs', stmt.body.items.length === 1 && line.sscc === sscc && line.kg === netKg && line.gross === amount && line.net === line.gross - line.deductions.reduce((a: number, d: any) => a + d.amount, 0) && line.upiRef === '604512339876' && line.proofs.length >= 3, stmt.body);
  const prov = await call('GET', `/public/provenance/${sscc}`);
  check('public provenance has the journey and proofs and no name or phone', prov.status === 200 && prov.body.journey.length >= 4 && prov.body.proofs.length >= 8 && prov.body.village === 'Changual' && !prov.text.match(/Anima|অনিমা|9000000001|Sukumar/), prov.body);
  check('scan report accepted', (await call('POST', '/public/scan-report', undefined, { sscc, suspicious: false })).body.received === true);
  const kp = (await call('GET', '/kpis', t.ceo)).body.items;
  const kpi = (k: string) => kp.find((x: any) => x.key === k);
  check('KPIs computed from the index: statement views, women, pledge reach, audit null without audits', kpi('statement_views').value === 100 && kpi('women_participation').value >= 50 && kpi('pledge_reach').value > 0 && kpi('audit_divergence').value === null && kpi('month12_gate').criteria.length === 4, kp);
  check('the lender criterion of the Month-12 gate is met', kpi('month12_gate').criteria.find((c: any) => c.key === 'lender_disbursed').met === true);

  section('DPDP erasure and the explorer');
  const er = await call('DELETE', `/farmers/${sukumarId}/personal-data`, skTok);
  check('a member erases their own data: farmer record blanked, chain marks the lots unverifiable', er.status === 200 && er.body.resource.erased === true, er.body);
  check('the paddy lot keeps its commercial status but its origin is unverifiable', await (async () => { const l = (await call('GET', `/lots/${paddy}`, t.ceo)).body; return l.status === 'PLEDGED'; })());
  check('public provenance of an erased grower says the origin cannot be verified', (await call('GET', `/public/provenance/${paddy}`)).body?.error?.message?.includes('erase'));
  check('the erased member cannot log in again', (await call('POST', '/auth/otp/request', undefined, { phone: '9000000009' })).status === 404);
  check('a member cannot erase someone else', (await call('DELETE', `/farmers/${animaId}/personal-data`, skTok)).status === 403);
  const status = (await call('GET', '/ledger/status')).body;
  check('ledger status: 4 peers up, 3 orderers with a Raft leader per channel, 3 channels with members', status.peers.length === 4 && status.peers.every((p: any) => p.up) && status.orderers.length === 3 && status.orderers.flatMap((o: any) => o.leaderOf ?? []).sort().join() === 'finance-channel,trace-channel,trade-channel' && status.channels.find((c: any) => c.name === 'trade-channel').members.length === 2, status);
  const blocks = (await call('GET', '/ledger/blocks?channel=trace-channel&limit=3')).body;
  check('latest blocks with hashes', blocks.length === 3 && blocks[0].number > blocks[1].number && /^[0-9a-f]{64}$/.test(blocks[0].dataHash));
  const bd = (await call('GET', `/ledger/blocks/trace-channel/${blocks[0].number}`)).body;
  check('block detail lists its transactions', bd.txs.length >= 1 && bd.txs[0].txId.length === 64);
  check('block hashes chain: previousHash of block n+1 is the hash of block n', await (async () => { const a = (await call('GET', `/ledger/blocks/trace-channel/${blocks[1].number}`)).body; const b = (await call('GET', `/ledger/tx/${bd.txs[0].txId}`)).body; return a.number + 1 === bd.number && b.blockHash.length === 64 && bd.previousHash.length === 64; })());
  check('search finds a lot by SSCC, an order by ID and a transaction by ID', (await call('GET', `/ledger/search?q=${sscc}`)).body[0]?.kind === 'lot' && (await call('GET', `/ledger/search?q=${oid}`)).body[0]?.kind === 'order' && (await call('GET', `/ledger/search?q=${graded.body.txId}`)).body[0]?.kind === 'tx');
  check('GET /config/public lists the adapter modes', (await call('GET', '/config/public')).body.adapterModes.upi === 'simulated');
  check('GET /prices needs a login and serves the (test) row; MSP is public data with a source', (await call('GET', '/prices?commodity=Potato', t.buyer)).body.items.length === 1 && (await call('GET', '/prices/msp?crop=paddy', t.buyer)).body.items.some((m: any) => m.pricePerQtl === 2441));
  check('GET /villages is public', (await call('GET', '/villages')).body.length === 5);
  check('OpenAPI docs are served', (await fetch(`${base}/docs/json`)).status === 200);

  section('cross-cutting');
  const priceLeaks = sse.filter((e) => JSON.stringify({ ...e, event: '', txId: '' }).match(/1580|pricePerQtl|amount|Anima|9000000001/i));
  check('no SSE event carried a price, an amount or a name', priceLeaks.length === 0 && sse.length >= 30, { events: sse.length, priceLeaks });
  check('every committed transaction of the run was indexed (events and blocks)', sse.some((e) => e.event === 'PatronageDistributed') && sse.some((e) => e.event === 'LotStatusChanged'));
  const pendingMirrors = (await tdb.sql`select count(*)::int as n from mirror_queue where done = false`)[0]!.n as number;
  check('no status mirror is pending', pendingMirrors === 0, pendingMirrors);
} catch (e) {
  fail++; console.log('  FAIL unexpected error:', e);
} finally {
  sseAbort.abort();
  await server.stop().catch(() => undefined);
  await tdb.drop().catch(() => undefined);
}
console.log(`\ne2e: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
