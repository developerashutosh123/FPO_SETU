// Seeds the demo world (CONTRACT.md Sections 4.5 and 5) THROUGH THE REAL API AND REAL TRANSACTIONS, so every lot, loan, order and
// patronage run on the ledger came from the same code paths a portal uses. Deterministic content (fixed RNG seed); ledger timestamps are
// the time of the run, because a ledger cannot be back-dated.
//
//   pnpm seed                    full world: 150 members, about 540 lots in every state
//   pnpm seed --scale mini       about 25 lots, every branch once (for checking the script)
//   pnpm seed --scale golden     only the named personas' golden-journey lots
//   pnpm seed --test-data        throwaway local database only: injects TEST price rows and TEST rates (never for a real database)
//
// Needs: network up and chaincode deployed on a FRESH ledger (make rebuild), a migrated database, AGMARKNET prices for potato at
// Medinipur (West), and fully sourced deduction rates in config/rates.json. It refuses to start otherwise and says what is missing.
import { createECDH, createPrivateKey, createHash, sign } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { loadConfig } from '../src/config.js';
import { signSession } from '../src/auth/jwt.js';
import { PERSONAS, sessionUserOf } from '../src/auth/personas.js';
import { type Commodity, type SessionUser, type VillageCode } from '../src/contract/contract.js';
import { audits, farmers, lotsView, priceSeries, sequences, telemetry } from '../src/db/schema.js';
import { createServer, ensureDevicesRegistered, type Server } from '../src/server.js';
import { loadRates, type Rates } from '../src/services/rates.js';
import { istDate } from '../src/services/dates.js';
import villages from '../src/contract/villages.json' with { type: 'json' };
import { FEMALE, MALE, SANTALI_FEMALE, SANTALI_MALE, SANTALI_SURNAME, SURNAME, type N } from './seed/names.js';

const argv = process.argv.slice(2);
const scale = (argv.includes('--scale') ? argv[argv.indexOf('--scale') + 1] : 'full') as 'full' | 'mini' | 'golden';
const testData = argv.includes('--test-data');
const SEED = 20261015;
const CONC = Number(process.env.SEED_CONCURRENCY ?? 16); // parallel lots; raise DB_POOL_MAX with it
const started = Date.now();
const log = (...a: unknown[]) => console.log(`[${((Date.now() - started) / 1000).toFixed(0).padStart(4)}s]`, ...a);

// ---------------------------------------------------------------- deterministic helpers
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(SEED);
const pick = <T,>(xs: T[]) => xs[Math.floor(R() * xs.length)]!;
const between = (lo: number, hi: number) => lo + Math.floor(R() * (hi - lo + 1));
const sha = (s: string) => createHash('sha256').update(s).digest();
function deviceKey(i: number) {
  const e = createECDH('prime256v1'); e.setPrivateKey(sha(`fposetu-seed-device-key-${SEED}-${i}`));
  const pub = e.getPublicKey(); const priv = e.getPrivateKey();
  const key = createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: priv.toString('base64url'), x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') }, format: 'jwk' });
  return { pubHex: pub.toString('hex'), sign: (text: string) => sign('sha256', Buffer.from(text), { key, dsaEncoding: 'ieee-p1363' }).toString('hex') };
}
async function pool<T>(items: T[], n: number, fn: (x: T, i: number) => Promise<void>) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k]!, k); } })); }
const retryable = /MVCC|rejected the transaction when committing|ERR_LEDGER_UNAVAILABLE|timed? ?out|DEADLINE/i;
async function retry<T>(label: string, fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let k = 1; ; k++) { try { return await fn(); } catch (e) { if (k >= tries || !retryable.test(String((e as Error).message))) throw new Error(`${label}: ${(e as Error).message}`); await new Promise((r) => setTimeout(r, 400 * k)); } }
}

// ---------------------------------------------------------------- preflight
const dbUrl = process.env.DATABASE_URL ?? '';
if (testData && !/@(127\.0\.0\.1|localhost)[:/]/.test(dbUrl)) { console.error('--test-data is only allowed against a local throwaway database. Refusing.'); process.exit(1); }
const cfg = loadConfig();
const rates: Rates = loadRates(testData ? 'test/e2e-rates.json' : undefined);
const server: Server = await createServer({ cfg, rates, startIndexer: true, startWorkers: true, logger: false, rateLimitMax: 1_000_000 });
const { ctx, app } = server;
const today = istDate(new Date());

const problems: string[] = [];
const missingRates = Object.entries(rates.deductions).filter(([, v]) => (v.perQtl ?? v.pct) == null).map(([k]) => k);
if (missingRates.length) problems.push(`config/rates.json has unsourced deduction rates: ${missingRates.join(', ')}. Add sourced values (docs/DATA_SOURCES.md) or tell me to use labelled indicative ones.`);
if (testData) for (const [commodity, modal] of [['Potato', 1350], ['Brinjal', 2100], ['Cauliflower', 1800]] as const) await ctx.db.insert(priceSeries).values({ date: today, market: 'Medinipur(West)', commodity, variety: 'SEED TEST', minPrice: 1, maxPrice: 1, modalPrice: modal, source: 'SEED TEST ROW (throwaway database, not market data)' }).onConflictDoNothing();
const potatoBasis = await ctx.adapters.agmarknet.basisFor('Potato', today);
if (!potatoBasis) problems.push('No AGMARKNET potato price from a tracked market within the last 7 days is loaded (price_series). Run pnpm prices:snapshot, or load CSVs with pnpm load:csv.');
if ((await ctx.db.select({ n: sql<number>`count(*)::int` }).from(sequences).where(eq(sequences.name, 'sscc')))[0]!.n > 0) problems.push('This database already has lots (the sscc counter exists). Seed a fresh database on a fresh ledger: make rebuild, then pnpm db:reset-seed.');
// a commodity without a real recent price gets lots that are created and graded only: no orders, no prices (DECISIONS D25)
const unpriced = new Set<Commodity>();
if (scale !== 'golden') for (const [c, name] of [['BRINJAL', 'Brinjal'], ['CAULIFLOWER', 'Cauliflower']] as const) if (!(await ctx.adapters.agmarknet.basisFor(name, today))) unpriced.add(c);
if (problems.length) { console.error('Seed cannot start:\n - ' + problems.join('\n - ')); await server.stop(); process.exit(1); }
const basePotato = potatoBasis!.modalPrice;
log(`scale ${scale}; potato modal basis Rs ${basePotato}/qtl (${potatoBasis!.market}${potatoBasis!.preferred ? '' : ', nearest reporting market'}, ${potatoBasis!.date}, ${potatoBasis!.source})`);
if (unpriced.size) log(`no real recent price for ${[...unpriced].join(', ')}: those lots are created and graded only, with no orders`);
await ensureDevicesRegistered(ctx);

// ---------------------------------------------------------------- api
const tokenCache = new Map<string, string>();
const staff = async (u: string) => { if (!tokenCache.has(u)) { const p = PERSONAS.find((x) => x.username === u)!; tokenCache.set(u, await signSession(cfg.JWT_SECRET, sessionUserOf(p, p.portals[0]!))); } return tokenCache.get(u)!; };
const tok = { vle: () => staff('subhankar.vle'), ceo: () => staff('sujata.ceo'), op: () => staff('debasis.ops'), wh: () => staff('ratan.store'), bank: () => staff('arindam.bank'), buyer: () => staff('rahul.buyer') };
async function call(method: string, url: string, token: string, body?: unknown) {
  const r = await app.inject({ method: method as 'GET', url, headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, payload: body === undefined ? undefined : JSON.stringify(body) });
  let j: any; try { j = JSON.parse(r.body); } catch { j = undefined; }
  return { status: r.statusCode, body: j, headers: r.headers };
}
async function ok(method: string, url: string, token: string, body?: unknown) {
  const r = await call(method, url, token, body);
  if (r.status >= 300) throw new Error(`${method} ${url} -> ${r.status} ${r.body?.error?.code ?? ''} ${r.body?.error?.message ?? ''}`);
  return r;
}

// ---------------------------------------------------------------- the people
interface F { idx: number; village: VillageCode; name: string; nameBn: string; gender: 'F' | 'M'; phone: string; crops: Commodity[]; key: ReturnType<typeof deviceKey>; id?: string; token?: string; plotId?: string; username: string; lots: number }
const NAMED: { village: VillageCode; en: string; bn: string; g: 'F' | 'M'; crops: Commodity[]; user?: string }[] = [
  { village: 'CHANGUAL', en: 'Anima Das', bn: 'অনিমা দাস', g: 'F', crops: ['POTATO', 'PADDY'], user: 'anima.das' }, { village: 'CHANGUAL', en: 'Haradhan Mahato', bn: 'হরধন মাহাতো', g: 'M', crops: ['POTATO', 'PADDY'] },
  { village: 'CHANGUAL', en: 'Parul Samanta', bn: 'পারুল সামন্ত', g: 'F', crops: ['POTATO'] }, { village: 'CHANGUAL', en: 'Kalyani Giri', bn: 'কল্যাণী গিরি', g: 'F', crops: ['BRINJAL', 'CAULIFLOWER', 'POTATO'] },
  { village: 'GOLGRAM', en: 'Sabita Pal', bn: 'সবিতা পাল', g: 'F', crops: ['POTATO'] }, { village: 'GOLGRAM', en: 'Gobinda Bera', bn: 'গোবিন্দ বেরা', g: 'M', crops: ['POTATO', 'PADDY'] }, { village: 'GOLGRAM', en: 'Dulal Jana', bn: 'দুলাল জানা', g: 'M', crops: ['POTATO'] },
  { village: 'GOPALPUR', en: 'Sukumar Murmu', bn: 'সুকুমার মুর্মু', g: 'M', crops: ['PADDY'] }, { village: 'GOPALPUR', en: 'Budhni Hembram', bn: 'বুধনি হেমব্রম', g: 'F', crops: ['PADDY', 'BRINJAL'] },
];
function buildFarmers(total: number): F[] {
  const per: Record<string, number> = { CHANGUAL: Math.ceil(total / 3), GOLGRAM: Math.ceil(total / 3), GOPALPUR: total - 2 * Math.ceil(total / 3) };
  const out: F[] = []; const seen = new Set<string>();
  const add = (village: VillageCode, en: string, bn: string, g: 'F' | 'M', crops: Commodity[], user?: string) => {
    const idx = out.length; const phone = String(9000000001 + idx);
    out.push({ idx, village, name: en, nameBn: bn, gender: g, phone, crops, key: deviceKey(idx), username: user ?? '', lots: 0 }); seen.add(en);
  };
  for (const n of NAMED.slice(0, Math.min(NAMED.length, total))) { add(n.village, n.en, n.bn, n.g, n.crops, n.user); per[n.village]!--; }
  for (const v of ['CHANGUAL', 'GOLGRAM', 'GOPALPUR'] as VillageCode[]) {
    while (per[v]! > 0) {
      const santali = v === 'GOPALPUR' && R() < 0.6, female = R() < 0.43;
      const first: N = santali ? pick(female ? SANTALI_FEMALE : SANTALI_MALE) : pick(female ? FEMALE : MALE), last: N = santali ? pick(SANTALI_SURNAME) : pick(SURNAME);
      const en = `${first.en} ${last.en}`; if (seen.has(en)) continue;
      const crops: Commodity[] = v === 'GOPALPUR' ? (R() < 0.3 ? ['PADDY', 'BRINJAL'] : ['PADDY']) : v === 'CHANGUAL' ? (R() < 0.2 ? ['POTATO', 'BRINJAL', 'CAULIFLOWER'] : R() < 0.7 ? ['POTATO', 'PADDY'] : ['POTATO']) : (R() < 0.35 ? ['POTATO', 'PADDY'] : ['POTATO']);
      add(v, en, `${first.bn} ${last.bn}`, female ? 'F' : 'M', crops); per[v]!--;
    }
  }
  return out;
}
const member = async (f: F): Promise<string> => signSession(cfg.JWT_SECRET, { id: f.id!, username: f.username || `member.${f.token!.slice(3, 11)}`, role: 'member', org: 'FpoOrgMSP', displayName: f.name, portal: 'farmer' } as SessionUser);
const villageOf = (c: VillageCode) => (villages as { code: string; lat: number; lon: number }[]).find((v) => v.code === c)!;

async function registerFarmer(f: F) {
  const v = villageOf(f.village); const lat = v.lat + (R() - 0.5) * 0.03, lon = v.lon + (R() - 0.5) * 0.03, d = 0.0005 + R() * 0.0005;
  const r = await retry(`farmer ${f.name}`, async () => ok('POST', '/farmers', await tok.vle(), {
    name: f.name, nameLocal: f.nameBn, gender: f.gender, phone: f.phone, village: f.village,
    plot: { geojson: { type: 'Polygon', coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]] }, areaHa: Math.round((0.3 + R() * 1.4) * 10) / 10, crops: f.crops },
    consent: { version: 'v1', lang: 'bn', acceptedAt: new Date().toISOString() }, devicePublicKeyHex: f.key.pubHex,
  }));
  f.id = r.body.resource.id; f.token = r.body.resource.farmerToken; f.plotId = r.body.resource.plots[0].plotId;
}

// ---------------------------------------------------------------- the lots
type Stage = 'COMMISSIONED' | 'GRADED' | 'IN_STORAGE' | 'PLEDGED' | 'LISTED' | 'SOLD' | 'IN_TRANSIT' | 'DELIVERED' | 'REJECTED' | 'SETTLED' | 'CLOSED' | 'TRANSFORMED';
const ORDERED: Stage[] = ['COMMISSIONED', 'GRADED', 'IN_STORAGE', 'PLEDGED', 'LISTED', 'SOLD', 'IN_TRANSIT', 'DELIVERED', 'REJECTED', 'SETTLED', 'CLOSED', 'TRANSFORMED'];
const FULL: Record<string, Partial<Record<Stage, number>>> = {
  POTATO: { COMMISSIONED: 12, GRADED: 58, IN_STORAGE: 99, PLEDGED: 40, LISTED: 25, SOLD: 30, IN_TRANSIT: 12, DELIVERED: 9, REJECTED: 3, SETTLED: 20, CLOSED: 80, TRANSFORMED: 12 },
  PADDY: { GRADED: 8, IN_STORAGE: 17, PLEDGED: 20, SOLD: 5, CLOSED: 10 },
  BRINJAL: { COMMISSIONED: 15, GRADED: 15, SOLD: 5, DELIVERED: 5, CLOSED: 10 },
  CAULIFLOWER: { COMMISSIONED: 5, GRADED: 10, LISTED: 5, CLOSED: 10 },
};
const MINI: Record<string, Partial<Record<Stage, number>>> = {
  POTATO: { COMMISSIONED: 1, GRADED: 2, IN_STORAGE: 2, PLEDGED: 2, LISTED: 1, SOLD: 2, IN_TRANSIT: 1, DELIVERED: 1, REJECTED: 1, SETTLED: 1, CLOSED: 3, TRANSFORMED: 1 },
  PADDY: { GRADED: 1, IN_STORAGE: 1, PLEDGED: 1, CLOSED: 1 }, BRINJAL: { COMMISSIONED: 1, CLOSED: 1 }, CAULIFLOWER: { GRADED: 1 },
};
const VARIETY: Record<Commodity, string[]> = { POTATO: ['Kufri Jyoti', 'Kufri Pukhraj', 'Kufri Chipsona'], PADDY: ['Swarna (MTU 7029)'], BRINJAL: ['Round green (local)'], CAULIFLOWER: ['Snowball (local)'] };
interface Lot { commodity: Commodity; stage: Stage; farmer: F; bags: number; variety: string; sscc?: string; netKg?: number; depositId?: string; enwr?: string; loanId?: string; orderId?: string; breach: boolean; pledgeFirst: boolean; keepLien: boolean; grade: 'A' | 'B' | 'C' }
const eligibleFarmers = (fs: F[], c: Commodity) => fs.filter((f) => f.crops.includes(c));

function plan(fs: F[]): Lot[] {
  const table = scale === 'mini' ? MINI : FULL; const lots: Lot[] = [];
  for (const [c, stages] of Object.entries(table)) for (const st of ORDERED) for (let i = 0; i < (stages[st] ?? 0); i++) {
    const elig = eligibleFarmers(fs, c as Commodity); const farmer = pick(elig.length ? elig : fs);
    const bags = c === 'POTATO' ? between(20, 90) : c === 'PADDY' ? between(30, 120) : between(10, 40);
    const grade: 'A' | 'B' | 'C' = st === 'TRANSFORMED' ? 'C' : R() < 0.62 ? 'A' : 'B';
    lots.push({ commodity: c as Commodity, stage: st, farmer, bags, variety: pick(VARIETY[c as Commodity]), breach: false, pledgeFirst: false, keepLien: false, grade });
    farmer.lots++;
  }
  for (const l of lots) if (unpriced.has(l.commodity) && !['COMMISSIONED', 'GRADED'].includes(l.stage)) l.stage = 'GRADED';
  // mark which lots touch which branches (deterministic, by position)
  const sold = lots.filter((l) => ['SOLD', 'IN_TRANSIT', 'DELIVERED', 'SETTLED', 'CLOSED', 'REJECTED'].includes(l.stage) && l.commodity !== 'BRINJAL' && l.commodity !== 'CAULIFLOWER');
  sold.forEach((l, i) => { if (i % 4 === 1) { l.pledgeFirst = true; l.keepLien = l.stage === 'SOLD' && i % 8 === 1; } });
  lots.filter((l) => ['IN_TRANSIT', 'DELIVERED', 'SETTLED', 'CLOSED'].includes(l.stage)).forEach((l, i) => { l.breach = i % 11 === 3; });
  return lots;
}

// ---------------------------------------------------------------- one lot, step by step (the same calls a portal makes)
async function draftSignGrade(l: Lot, toGrade: boolean) {
  const f = l.farmer;
  const d = await retry('draft', async () => ok('POST', '/lots/drafts', await tok.vle(), { farmerId: f.id, plotId: f.plotId, commodity: l.commodity, variety: l.variety, bagCount: l.bags, estWeightKg: l.bags * 50, harvestOrUnloadDate: today }));
  l.sscc = d.body.sscc;
  await retry('sign', async () => ok('POST', `/lots/${l.sscc}/farmer-sign`, await member(f), { signatureHex: f.key.sign(d.body.payloadToSign) }));
  if (!toGrade) return;
  const wb = (await ok('POST', '/devices/WB-CHG-01/read', await tok.op(), { sscc: l.sscc })).body, qm = (await ok('POST', '/devices/QM-CHG-01/read', await tok.op(), { sscc: l.sscc })).body;
  const g = await retry('grade', async () => ok('POST', `/lots/${l.sscc}/quality`, await tok.op(), { weighbridgeReading: wb, qualityReading: qm, grade: l.grade }));
  l.netKg = g.body.resource.netKg;
}
async function store(l: Lot) {
  const fac = l.commodity === 'PADDY' ? { facility: 'WAREHOUSE', facilityName: 'Kansai Agri Warehouse (demo)' } : { facility: 'COLD_STORAGE', facilityName: 'Rupnarayan Cold Storage (demo)' };
  const d = await retry('deposit', async () => ok('POST', '/storage/deposits', await tok.wh(), { sscc: l.sscc, ...fac, bags: l.bags, depositedAt: today }));
  l.depositId = d.body.resource.depositId;
  const e = await retry('enwr', async () => ok('POST', `/storage/deposits/${l.depositId}/enwr`, await tok.wh()));
  l.enwr = e.body.resource.enwr;
}
let loanNo = 40;
const nextLoan = () => `LN-${new Date().getFullYear()}-${String(loanNo++).padStart(5, '0')}`;
async function pledge(l: Lot) {
  const col = (await ok('GET', `/collateral?enwr=${l.enwr}`, await tok.bank())).body.items[0];
  if (!col || col.eligibleLoan <= 0) throw new Error(`no collateral value for ${l.enwr}`);
  l.loanId = nextLoan();
  await retry('lien', async () => ok('POST', `/collateral/${l.enwr}/lien`, await tok.bank(), { loanId: l.loanId, amount: Math.floor(col.eligibleLoan * 0.9), tenureDays: l.commodity === 'PADDY' ? 150 : 180, ratePct: 9.5 }));
  await retry('disburse', async () => ok('POST', `/loans/${l.loanId}/disburse`, await tok.bank()));
}
async function releaseLien(l: Lot) {
  const loan = (await ok('GET', `/loans/${l.loanId}`, await tok.bank())).body;
  await retry('repay', async () => ok('POST', `/loans/${l.loanId}/repay`, await tok.bank(), { amount: Math.ceil(loan.amount * 1.03) }));
  await retry('release', async () => ok('POST', `/loans/${l.loanId}/release`, await tok.bank()));
}
/** Order price: a real market basis plus a small deterministic premium. Paddy is priced off the MSP. There is no fallback: no price, no order. */
const priceFor = async (c: Commodity) => {
  if (c === 'PADDY') return Math.round(2441 * (1 + R() * 0.03));
  if (c === 'POTATO') return Math.round(basePotato * (1 + R() * 0.12));
  const own = await ctx.adapters.agmarknet.basisFor(c === 'BRINJAL' ? 'Brinjal' : 'Cauliflower', today);
  if (!own) throw new Error(`no AGMARKNET price loaded for ${c}`);
  return Math.round(own.modalPrice * (1 + R() * 0.12));
};

/** Takes a group of lots (already stored or graded) through the order and onward to `stage`. */
async function tradeGroup(group: Lot[]) {
  const stage = group[0]!.stage; const ssccs = group.map((l) => l.sscc!);
  const o = await retry('order', async () => ok('POST', '/orders', await tok.ceo(), { ssccs, channel: 'DIRECT', deliveryBy: today }));
  const orderId = o.body.resource.orderId as string; group.forEach((l) => (l.orderId = orderId));
  if (stage === 'LISTED') return;
  const price = await priceFor(group[0]!.commodity);
  await retry('price 1', async () => ok('POST', `/orders/${orderId}/agree-price`, await tok.ceo(), { pricePerQtl: price }));
  await retry('price 2', async () => ok('POST', `/orders/${orderId}/agree-price`, await tok.buyer(), { pricePerQtl: price }));
  if (stage === 'SOLD') { for (const l of group) if (l.pledgeFirst && !l.keepLien && l.loanId) await releaseLien(l); return; }
  for (const l of group) if (l.loanId && !l.keepLien) await releaseLien(l);
  for (const l of group) {
    await retry('propose', async () => ok('POST', `/lots/${l.sscc}/custody/propose`, await tok.op(), { toOrg: 'BuyerOrgMSP', vehicleNo: `WB74${between(1000, 9999)}`, loggerId: `BLE-${between(1, 20)}` }));
    if (stage === 'IN_TRANSIT') { await retry('digest', async () => ok('POST', `/lots/${l.sscc}/condition-digest`, await tok.op(), { window: `${today}T06:00Z/${today}T18:00Z`, minC: 3.1, maxC: l.breach ? 9.4 : 5.9, avgC: l.breach ? 6.8 : 4.3, breaches: l.breach ? 1 : 0, digestHash: sha(`log-${l.sscc}`).toString('hex') })); }
  }
  if (stage === 'IN_TRANSIT') return;
  for (const l of group) {
    await retry('digest', async () => ok('POST', `/lots/${l.sscc}/condition-digest`, await tok.op(), { window: `${today}T06:00Z/${today}T18:00Z`, minC: 3.1, maxC: l.breach ? 9.4 : 5.9, avgC: l.breach ? 6.8 : 4.3, breaches: l.breach ? 1 : 0, digestHash: sha(`log-${l.sscc}`).toString('hex') }));
    await retry('accept', async () => ok('POST', `/lots/${l.sscc}/custody/accept`, await tok.buyer()));
  }
  if (stage === 'DELIVERED') return;
  await retry('quality', async () => ok('POST', `/orders/${orderId}/accept-quality`, await tok.buyer(), { accepted: stage !== 'REJECTED', notes: stage === 'REJECTED' ? 'Rot above the agreed limit on opening three bags.' : 'Matches the sample.' }));
  if (stage === 'REJECTED') return;
  const amount = group.reduce((a, l) => a + Math.round((l.netKg! / 100) * price), 0);
  await retry('settle', async () => ok('POST', `/orders/${orderId}/settle`, await tok.ceo(), { amount, upiRef: String(600000000000 + between(1, 99999999999)) }));
  if (stage === 'SETTLED') return;
  await retry('patronage', async () => ok('POST', '/patronage/runs', await tok.ceo(), { orderId }));
}

// ---------------------------------------------------------------- the golden journey of the named personas (first, so Anima's lot is serial 451)
async function golden(fs: F[]) {
  const anima = fs[0]!;
  log('golden journey: Anima Das');
  for (const [product, ai, phi, daysAgo] of [['Mancozeb 75% WP', 'Mancozeb', 7, 40], ['Metalaxyl + Mancozeb', 'Metalaxyl 8% + Mancozeb 64%', 7, 31]] as const) {
    const on = new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
    await ok('POST', '/diary/inputs', await member(anima), { product, activeIngredient: ai, dose: '2.5 g/L', appliedOn: on, phiDays: phi, crop: 'POTATO' }); // illustrative entries, see docs/DATA_SOURCES.md
  }
  const g: Lot = { commodity: 'POTATO', stage: 'CLOSED', farmer: anima, bags: 40, variety: 'Kufri Jyoti', breach: false, pledgeFirst: true, keepLien: false, grade: 'A' };
  await draftSignGrade(g, true); await store(g); await pledge(g); await tradeGroup([g]);
  const second: Lot = { commodity: 'POTATO', stage: 'PLEDGED', farmer: anima, bags: 30, variety: 'Kufri Jyoti', breach: false, pledgeFirst: true, keepLien: true, grade: 'A' };
  await draftSignGrade(second, true); await store(second); await pledge(second);
  await ok('POST', '/lots/drafts', await tok.vle(), { farmerId: anima.id, plotId: anima.plotId, commodity: 'POTATO', variety: 'Kufri Jyoti', bagCount: 40, estWeightKg: 2000, harvestOrUnloadDate: today }); // left unsigned: the live demo signs it on the phone
  await ok('GET', '/statements/me', await member(anima)); // her statement has been opened once (telemetry)
  log(`golden: lot ${g.sscc} CLOSED (order ${g.orderId}), lot ${second.sscc} PLEDGED, one draft waiting for her signature`);
  anima.lots += 3;
}

// ---------------------------------------------------------------- main
const total = scale === 'full' ? 150 : scale === 'mini' ? 12 : NAMED.length;
const fs = buildFarmers(total);
log(`registering ${fs.length} members`);
await pool(fs.slice(0, 1), 1, registerFarmer);          // Anima first
await pool(fs.slice(1), Math.ceil(CONC / 2), async (f) => registerFarmer(f));
log('members registered:', fs.length, '| women:', fs.filter((f) => f.gender === 'F').length);

await golden(fs);
let lots: Lot[] = [];
if (scale !== 'golden') {
  lots = plan(fs);
  log(`planned ${lots.length} lots`);
  await pool(lots, CONC, async (l, i) => { await draftSignGrade(l, l.stage !== 'COMMISSIONED'); if (i % 40 === 0) log(`  commissioned ${i + 1}/${lots.length}`); });
  const needStore = lots.filter((l) => l.commodity !== 'BRINJAL' && l.commodity !== 'CAULIFLOWER' && !['COMMISSIONED', 'GRADED', 'TRANSFORMED'].includes(l.stage));
  await pool(needStore, CONC, async (l) => { await store(l); });
  log('stored', needStore.length);
  const toPledge = lots.filter((l) => l.stage === 'PLEDGED' || l.pledgeFirst);
  await pool(toPledge, Math.ceil(CONC / 2), async (l) => { await pledge(l); });
  log('liens', toPledge.length);
  const transform = lots.filter((l) => l.stage === 'TRANSFORMED');
  await pool(transform, Math.ceil(CONC / 2), async (l) => { await ok('POST', `/lots/${l.sscc}/transform`, await tok.ceo(), { toProcessing: true, reason: 'Grade C: sent to the processing channel' }); });
  // orders: group by stage and commodity, up to three lots each
  const groups: Lot[][] = [];
  for (const st of ['LISTED', 'SOLD', 'IN_TRANSIT', 'DELIVERED', 'REJECTED', 'SETTLED', 'CLOSED'] as Stage[]) for (const c of ['POTATO', 'PADDY', 'BRINJAL', 'CAULIFLOWER'] as Commodity[]) {
    const ls = lots.filter((l) => l.stage === st && l.commodity === c);
    for (let i = 0; i < ls.length; i += 3) groups.push(ls.slice(i, i + 3));
  }
  log(`orders: ${groups.length}`);
  await pool(groups, Math.ceil(CONC * 0.75), async (g, i) => { await tradeGroup(g); if (i % 10 === 0) log(`  orders ${i + 1}/${groups.length}`); });

  // simulated first-mile re-inspections (5% sample): a few divergences, as the contract's seed asks
  const graded = lots.filter((l) => l.sscc && l.stage !== 'COMMISSIONED');
  const sample = graded.filter((_, i) => i % 20 === 7).slice(0, Math.max(3, Math.round(graded.length * 0.05)));
  for (const [i, l] of sample.entries()) await ctx.db.insert(audits).values({ sscc: l.sscc!, drawnOn: today, status: i === 2 ? 'DIVERGENT' : i % 5 === 4 ? 'PENDING' : 'MATCH', auditedOn: i % 5 === 4 ? null : today, note: i === 2 ? 'Re-inspection grade B, attested grade A (simulated re-inspection)' : i % 5 === 4 ? null : 'Re-weighed within tolerance (simulated re-inspection)' }).onConflictDoNothing();
  log('audit sample drawn:', sample.length);

  // DPDP: one member erases their data
  const erasable = fs.find((f) => f.idx > 0 && lots.some((l) => l.farmer === f) && lots.filter((l) => l.farmer === f).every((l) => ['COMMISSIONED', 'GRADED', 'IN_STORAGE'].includes(l.stage) && !l.pledgeFirst));
  if (erasable) { await ok('DELETE', `/farmers/${erasable.id}/personal-data`, await member(erasable)); log(`DPDP erasure: ${erasable.token}`); }

  // one rejected double-financing attempt, recorded as telemetry (a refused attempt writes nothing to the ledger)
  const target = lots.find((l) => l.stage === 'PLEDGED' && l.enwr);
  if (target) {
    const r = await call('POST', `/collateral/${target.enwr}/lien`, await tok.bank(), { loanId: nextLoan(), amount: 1000, tenureDays: 30, ratePct: 9 });
    log(`double-financing attempt: HTTP ${r.status} ${r.body?.error?.code}`);
    if (r.status === 409) await ctx.db.insert(telemetry).values({ kind: 'DoubleFinancingRejected', subject: target.enwr!, detail: { code: r.body.error.code, message: r.body.error.message, firstLienTx: r.body.error.txId } });
  }
}

// ---------------------------------------------------------------- report
await new Promise((r) => setTimeout(r, 3000));
const byStatus = (await ctx.db.select({ s: lotsView.status, n: sql<number>`count(*)::int` }).from(lotsView).groupBy(lotsView.status)).sort((a, b) => b.n - a.n);
const byCommodity = (await ctx.db.select({ c: lotsView.commodity, n: sql<number>`count(*)::int` }).from(lotsView).groupBy(lotsView.commodity));
const members = (await ctx.db.select({ n: sql<number>`count(*)::int` }).from(farmers))[0]!.n;
const pending = (await ctx.db.execute(sql`select count(*)::int as n from mirror_queue where done = false`)) as unknown as { n: number }[];
log('lots by status:', Object.fromEntries(byStatus.map((x) => [x.s, x.n])));
log('lots by commodity:', Object.fromEntries(byCommodity.map((x) => [x.c, x.n])), '| members:', members, '| pending mirrors:', pending[0]?.n);
const kp = (await ok('GET', '/kpis', await tok.ceo())).body.items;
log('month-12 gate:', JSON.stringify(kp.find((k: { key: string }) => k.key === 'month12_gate').criteria.map((c: { key: string; met: boolean | null }) => [c.key, c.met])));
log(`seed finished in ${((Date.now() - started) / 1000 / 60).toFixed(1)} minutes`);
await server.stop();
