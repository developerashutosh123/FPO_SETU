// Demo stock: counts what is ready to use for the three one-shot write moments, and appends fresh batches of it.
// Everything goes through the RUNNING gateway's HTTP API, so each item is created by the same code paths and real Fabric transactions a
// portal uses. It only ever appends: there is no reset, delete or rebuild in here, and no direct database writes.
//
//   pnpm seed:demo-refresh                 append 15 of each of the three item types
//   pnpm seed:demo-refresh 20              append 20 of each
//   pnpm seed:demo-refresh 15 --top-up     append only what is missing so that 15 of each are ready
//   pnpm seed:demo-refresh --status        read-only: how many of each are ready now, with the IDs (up to 15 each; --all for every one)
//
// The three moments (a ledger write cannot be undone, so each item is used once):
//   confirm-and-sign  an unsigned DRAFT lot of the demo farmer 9000000001: the farmer app signs it (F2)
//   double-lien       an IN_STORAGE, graded, unpledged e-NWR receipt: mark a first lien, then the second attempt is rejected
//   price-hash        an OPEN order nobody has priced yet: the FPO and the buyer each submit the same price (F6)
//
// Options: --base <url> (default http://localhost:$PORT or 8080, or $GATEWAY_URL)   DEMO_CONCURRENCY (default 4)
// Needs: the gateway running with the ledger live (pnpm start). It refuses to write in index-only mode.
import { createECDH, createHash, createPrivateKey, sign } from 'node:crypto';
import postgres from 'postgres';

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string, d: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1]! : d; };
const N = Number(argv.find((a) => /^\d+$/.test(a)) ?? 15);
const STATUS_ONLY = flag('status');
const TOP_UP = flag('top-up');
const SHOW_ALL = flag('all');
const BASE = opt('base', process.env.GATEWAY_URL ?? `http://localhost:${process.env.PORT ?? 8080}`).replace(/\/+$/, '');
const CONC = Number(process.env.DEMO_CONCURRENCY ?? 4);
const PASSWORD = process.env.DEMO_PASSWORD ?? 'Setu@2026';
const DEMO_PHONE = '9000000001';
const started = Date.now();
const log = (...a: unknown[]) => console.log(`[${((Date.now() - started) / 1000).toFixed(0).padStart(4)}s]`, ...a);
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

// ---------------------------------------------------------------- HTTP
type R = { status: number; body: any };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function call(method: string, path: string, token?: string, body?: unknown): Promise<R> {
  for (let k = 1; ; k++) {
    try {
      const res = await fetch(BASE + path, {
        method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.status === 429 && k < 8) { await sleep(Math.min(Number(res.headers.get('retry-after') ?? 0) * 1000 || 2000 * k, 20_000)); continue; }
      const text = await res.text();
      let j: any; try { j = JSON.parse(text); } catch { j = undefined; }
      return { status: res.status, body: j };
    } catch (e) {
      if (k >= 4) throw new Error(`${method} ${path}: gateway not reachable at ${BASE} (${(e as Error).message})`);
      await sleep(500 * k);
    }
  }
}
async function ok(method: string, path: string, token?: string, body?: unknown): Promise<R> {
  const r = await call(method, path, token, body);
  if (r.status >= 300) { const e = new Error(`${method} ${path} -> ${r.status} ${r.body?.error?.code ?? ''} ${r.body?.error?.message ?? ''}`.trim()); (e as any).code = r.body?.error?.code; throw e; }
  return r;
}
const retryable = /MVCC|rejected the transaction when committing|ERR_LEDGER_UNAVAILABLE|timed? ?out|DEADLINE|ECONNRESET/i;
async function retry<T>(label: string, fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let k = 1; ; k++) {
    try { return await fn(); } catch (e) {
      if (k >= tries || !retryable.test(String((e as Error).message))) { const err = new Error(`${label}: ${(e as Error).message}`); (err as any).code = (e as any).code; throw err; }
      await sleep(500 * k);
    }
  }
}
async function pool<T>(items: T[], n: number, fn: (x: T, i: number) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k]!, k); } }));
}
async function pages(path: string, token: string): Promise<any[]> {
  const out: any[] = []; let cursor: string | undefined;
  do {
    const r = await ok('GET', `${path}${path.includes('?') ? '&' : '?'}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, token);
    out.push(...r.body.items); cursor = r.body.nextCursor;
  } while (cursor);
  return out;
}

// ---------------------------------------------------------------- sign-in (demo logins, CONTRACT.md Section 5)
const PORTAL: Record<string, string> = { 'subhankar.vle': 'farmer', 'sujata.ceo': 'fpo', 'debasis.ops': 'fpo', 'ratan.store': 'fpo', 'arindam.bank': 'bank', 'rahul.buyer': 'buyer' };
const staffTokens = new Map<string, string>();
async function staff(username: string): Promise<string> {
  if (!staffTokens.has(username)) staffTokens.set(username, (await ok('POST', '/auth/login', undefined, { username, password: PASSWORD, portal: PORTAL[username] })).body.token);
  return staffTokens.get(username)!;
}
const memberTokens = new Map<string, { token: string; id: string }>();
async function member(phone: string): Promise<{ token: string; id: string }> {
  if (!memberTokens.has(phone)) {
    const otp = (await ok('POST', '/auth/otp/request', undefined, { phone })).body.demoOtp as string;
    const r = (await ok('POST', '/auth/otp/verify', undefined, { phone, otp })).body;
    memberTokens.set(phone, { token: r.token, id: r.user.id });
  }
  return memberTokens.get(phone)!;
}

// ---------------------------------------------------------------- what is ready right now
interface Stock {
  drafts: { sscc: string; humanRef: string; bags: number; kg: number }[];
  receipts: { enwr: string; sscc: string; humanRef: string; grade: string; qtl: number; eligibleLoan: number }[];
  orders: { orderId: string; ssccs: string[] }[];
  halfPriced: string[];
  priceCheck: 'ok' | 'skipped';
}
async function readStock(): Promise<Stock> {
  const anima = await member(DEMO_PHONE);
  const drafts = ((await ok('GET', '/lots/drafts/pending', anima.token)).body as any[]).map((d) => ({ sscc: d.sscc, humanRef: d.humanRef, bags: d.bagCount, kg: d.estWeightKg }));

  // GET /collateral costs about 0.4 s per row (it rebuilds each from the chain), so the candidates are found with one read-only query on the
  // index, and each candidate is then confirmed through the API (still needed: it applies the valuation, and a lot with no price basis cannot be pledged).
  let halfPriced: string[] = []; let priceCheck: Stock['priceCheck'] = 'skipped';
  let candidates: { enwr: string; sscc: string }[] | null = null;
  if (process.env.DATABASE_URL) {
    const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
    try {
      halfPriced = (await sql`select order_id from trade_prices`).map((r) => r.order_id as string);
      priceCheck = 'ok';
      candidates = (await sql`
        select d.deposit->>'enwr' as enwr, l.sscc as sscc
        from lots_view l join deposits_view d on d.sscc = l.sscc
        where l.status = 'IN_STORAGE' and l.grade <> '' and d.deposit->>'enwr' is not null
          and not exists (select 1 from liens_view v where v.sscc = l.sscc)
        order by l.sscc`).map((r) => ({ enwr: r.enwr as string, sscc: r.sscc as string }));
    } finally { await sql.end({ timeout: 5 }); }
  }
  const bank = await staff('arindam.bank');
  const receipts: Stock['receipts'] = [];
  const toCheck = candidates ?? (await pages('/collateral', bank)).filter((c) => c.lot.status === 'IN_STORAGE' && c.lien.status === 'NONE').map((c) => ({ enwr: c.enwr as string, sscc: c.lot.sscc as string }));
  await pool(toCheck, 6, async (c) => {
    const col = (await ok('GET', `/collateral?enwr=${encodeURIComponent(c.enwr)}`, bank)).body.items[0];
    if (col && col.lot.status === 'IN_STORAGE' && col.lien.status === 'NONE' && col.lot.grade && col.eligibleLoan > 0)
      receipts.push({ enwr: col.enwr, sscc: col.lot.sscc, humanRef: col.lot.humanRef, grade: col.lot.grade, qtl: col.quantityQtl, eligibleLoan: col.eligibleLoan });
  });
  receipts.sort((a, b) => a.sscc.localeCompare(b.sscc));

  // an order is only usable for the price-hash moment if NO price has been submitted by either side: one half-submitted price makes the
  // second party's different price fail with ERR_PRICE_HASH_MISMATCH. The API cannot show that, so the gateway's own table is read (read-only).
  const orders = (await pages('/orders', await staff('sujata.ceo')))
    .filter((o) => o.status === 'OPEN' && !halfPriced.includes(o.orderId))
    .map((o) => ({ orderId: o.orderId as string, ssccs: o.ssccs as string[] }));
  return { drafts, receipts, orders, halfPriced, priceCheck };
}
function printStock(s: Stock, cap: number | null, title: string) {
  const cut = <T,>(xs: T[]) => (cap == null ? xs : xs.slice(0, cap));
  console.log(`\n${title}`);
  console.log(`\nConfirm-and-sign (farmer ${DEMO_PHONE}): ${s.drafts.length} unsigned drafts ready`);
  for (const d of cut(s.drafts)) console.log(`  ${d.sscc}  ${d.humanRef}  ${d.bags} bags, ${d.kg} kg`);
  console.log(`\nDouble-lien: ${s.receipts.length} unpledged IN_STORAGE graded receipts ready`);
  for (const r of cut(s.receipts)) console.log(`  ${r.enwr}  ${r.sscc}  grade ${r.grade}  ${r.qtl} qtl  eligible Rs ${r.eligibleLoan}`);
  console.log(`\nPrice-hash: ${s.orders.length} OPEN orders with no price submitted ready`);
  for (const o of cut(s.orders)) console.log(`  ${o.orderId}  (${o.ssccs.join(', ')})`);
  if (s.priceCheck === 'skipped') console.log('  (DATABASE_URL is not set here, so orders with a half-submitted price could not be excluded: check before relying on old ones)');
  else if (s.halfPriced.length) console.log(`  (excluded ${s.halfPriced.length} order(s) that already have a price submitted)`);
}

// ---------------------------------------------------------------- creating items
// Seed farmers hold deterministic device keys (scripts/seed-ledger.ts: SEED and index = phone - 9000000001), so this script can sign the
// F2 step for them. The demo farmer 9000000001 is NOT used for the lots built here: her key on the ledger is whatever her phone registered.
const SEED = 20261015;
const sha = (s: string) => createHash('sha256').update(s).digest();
function deviceKey(i: number) {
  const e = createECDH('prime256v1'); e.setPrivateKey(sha(`fposetu-seed-device-key-${SEED}-${i}`));
  const pub = e.getPublicKey(); const priv = e.getPrivateKey();
  const key = createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: priv.toString('base64url'), x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') }, format: 'jwk' });
  return (text: string) => sign('sha256', Buffer.from(text), { key, dsaEncoding: 'ieee-p1363' }).toString('hex');
}
const VARIETIES = ['Kufri Jyoti', 'Kufri Pukhraj', 'Kufri Chipsona'];
let counter = 0;
const nextSpec = () => { const i = counter++; return { variety: VARIETIES[i % 3]!, bags: 24 + ((i * 7) % 40) }; };

interface Pf { idx: number; id: string; phone: string; plotId: string; sign: (t: string) => string; bad: boolean }
async function lotFarmers(): Promise<Pf[]> {
  const all = await pages('/farmers', await staff('subhankar.vle'));
  return all
    .filter((f) => !f.erased && /^9\d{9}$/.test(f.phone ?? '') && f.phone !== DEMO_PHONE && f.plots?.[0] && f.plots.some((p: any) => p.crops.includes('POTATO')))
    .map((f) => ({ idx: Number(f.phone) - 9000000001, id: f.id as string, phone: f.phone as string, plotId: f.plots.find((p: any) => p.crops.includes('POTATO')).plotId as string, sign: deviceKey(Number(f.phone) - 9000000001), bad: false }))
    .filter((f) => f.idx >= 1)
    .slice(0, 8);
}

async function createDrafts(n: number) {
  const vle = await staff('subhankar.vle');
  const me = (await ok('GET', '/farmers/me', (await member(DEMO_PHONE)).token)).body;
  const plot = me.plots.find((p: any) => p.crops.includes('POTATO')) ?? me.plots[0];
  const made: string[] = [];
  await pool(Array.from({ length: n }), CONC, async () => {
    const { variety, bags } = nextSpec();
    const d = await retry('draft', () => ok('POST', '/lots/drafts', vle, { farmerId: me.id, plotId: plot.plotId, commodity: 'POTATO', variety, bagCount: bags, estWeightKg: bags * 50, harvestOrUnloadDate: today }));
    made.push(d.body.sscc);
    log(`DRAFT   ${d.body.sscc}  ${d.body.humanRef}  ${bags} bags`);
  });
  return made;
}

/** Commission (F2, signed with the farmer's key) and grade A. Returns the lot, or null if this farmer's key does not match the ledger. */
async function commissionAndGrade(pf: Pf): Promise<{ sscc: string; humanRef: string } | null> {
  const { variety, bags } = nextSpec();
  const d = await retry('draft', async () => ok('POST', '/lots/drafts', await staff('subhankar.vle'), { farmerId: pf.id, plotId: pf.plotId, commodity: 'POTATO', variety, bagCount: bags, estWeightKg: bags * 50, harvestOrUnloadDate: today }));
  const sscc = d.body.sscc as string;
  try {
    await retry('sign', async () => ok('POST', `/lots/${sscc}/farmer-sign`, (await member(pf.phone)).token, { signatureHex: pf.sign(d.body.payloadToSign) }));
  } catch (e) {
    if ((e as any).code === 'ERR_BAD_FARMER_SIGNATURE') { pf.bad = true; return null; } // key on the ledger is not the seed key: leave this farmer alone
    throw e;
  }
  const op = await staff('debasis.ops');
  const wb = (await ok('POST', '/devices/WB-CHG-01/read', op, { sscc })).body, qm = (await ok('POST', '/devices/QM-CHG-01/read', op, { sscc })).body;
  await retry('grade', () => ok('POST', `/lots/${sscc}/quality`, op, { weighbridgeReading: wb, qualityReading: qm, grade: 'A' }));
  return { sscc, humanRef: d.body.humanRef as string };
}
async function withFarmer<T>(farmers: Pf[], i: number, fn: (pf: Pf) => Promise<T | null>): Promise<T> {
  for (let k = 0; k < farmers.length; k++) {
    const pf = farmers[(i + k) % farmers.length]!;
    if (pf.bad) continue;
    const r = await fn(pf);
    if (r) return r;
  }
  throw new Error('no seed farmer has a device key this script can sign with');
}

async function createReceipts(n: number, farmers: Pf[]) {
  const wh = await staff('ratan.store');
  await pool(Array.from({ length: n }, (_, i) => i), CONC, async (i) => {
    const lot = await withFarmer(farmers, i, (pf) => commissionAndGrade(pf));
    const spec = (await ok('GET', `/lots/${lot.sscc}`, await staff('sujata.ceo'))).body;
    const dep = await retry('deposit', () => ok('POST', '/storage/deposits', wh, { sscc: lot.sscc, facility: 'COLD_STORAGE', facilityName: 'Rupnarayan Cold Storage (demo)', bags: spec.bagCount, depositedAt: today }));
    const enwr = (await retry('enwr', () => ok('POST', `/storage/deposits/${dep.body.resource.depositId}/enwr`, wh))).body.resource.enwr as string;
    log(`RECEIPT ${enwr}  ${lot.sscc}  ${lot.humanRef}`);
  });
}

async function createOrders(n: number, farmers: Pf[]) {
  const ceo = await staff('sujata.ceo');
  await pool(Array.from({ length: n }, (_, i) => i), CONC, async (i) => {
    const lot = await withFarmer(farmers, i + 3, (pf) => commissionAndGrade(pf)); // one graded lot per order
    const o = await retry('order', () => ok('POST', '/orders', ceo, { ssccs: [lot.sscc], channel: 'DIRECT', deliveryBy: today }));
    log(`ORDER   ${o.body.resource.orderId}  ${lot.sscc}  ${lot.humanRef}`);
  });
}

// ---------------------------------------------------------------- main
const h = await call('GET', '/health');
if (h.status !== 200 || h.body?.ledgerMode !== 'live') {
  console.error(`Gateway at ${BASE} is not live (${h.status} ${h.body?.ledgerMode ?? h.body?.error?.code ?? ''}). Start it with: cd gateway && pnpm start  (and make resume for the ledger).`);
  process.exit(1);
}
log(`gateway ${BASE}  ledger live  heights ${JSON.stringify(h.body.channels)}`);

const before = await readStock();
if (STATUS_ONLY) {
  printStock(before, SHOW_ALL ? null : 15, `Ready right now (read-only; up to ${SHOW_ALL ? 'all' : '15'} of each listed)`);
  process.exit(0);
}

const want = TOP_UP
  ? { drafts: Math.max(0, N - before.drafts.length), receipts: Math.max(0, N - before.receipts.length), orders: Math.max(0, N - before.orders.length) }
  : { drafts: N, receipts: N, orders: N };
log(`${TOP_UP ? 'topping up to' : 'appending'} ${N} of each. ready now: drafts ${before.drafts.length}, receipts ${before.receipts.length}, orders ${before.orders.length}. creating: drafts ${want.drafts}, receipts ${want.receipts}, orders ${want.orders}`);

const failures: string[] = [];
const guard = async (label: string, fn: () => Promise<unknown>) => { try { await fn(); } catch (e) { failures.push(`${label}: ${(e as Error).message}`); log(`FAILED ${label}: ${(e as Error).message}`); } };

const farmers = want.receipts + want.orders > 0 ? await lotFarmers() : [];
if (want.receipts + want.orders > 0 && !farmers.length) { console.error('No seed farmers with a potato plot were found to build lots for.'); process.exit(1); }
if (farmers.length) log(`building lots for ${farmers.length} seed farmers (idx ${farmers.map((f) => f.idx).join(', ')})`);

await guard('drafts', () => createDrafts(want.drafts));
await guard('receipts', () => createReceipts(want.receipts, farmers));
await guard('orders', () => createOrders(want.orders, farmers));

// the index follows the chain a moment behind: wait until everything new is visible
let after = await readStock();
for (let k = 0; k < 8 && (after.drafts.length < before.drafts.length + want.drafts || after.receipts.length < before.receipts.length + want.receipts || after.orders.length < before.orders.length + want.orders); k++) {
  await sleep(2000); after = await readStock();
}
const newOnes = {
  drafts: after.drafts.filter((d) => !before.drafts.some((b) => b.sscc === d.sscc)),
  receipts: after.receipts.filter((r) => !before.receipts.some((b) => b.enwr === r.enwr)),
  orders: after.orders.filter((o) => !before.orders.some((b) => b.orderId === o.orderId)),
};
printStock({ ...after, drafts: newOnes.drafts, receipts: newOnes.receipts, orders: newOnes.orders }, null, 'NEW this run');
console.log(`\nTotals ready now: drafts ${after.drafts.length}, receipts ${after.receipts.length}, orders ${after.orders.length}   (before: ${before.drafts.length}, ${before.receipts.length}, ${before.orders.length})`);
const h2 = (await call('GET', '/health')).body;
console.log(`Ledger heights ${JSON.stringify(h.body.channels)} -> ${JSON.stringify(h2?.channels)} (only ever grows: nothing was wiped)`);
if (failures.length) { console.log(`\n${failures.length} step(s) failed (the items created before the failure are listed above):\n - ${failures.join('\n - ')}`); process.exitCode = 1; }
log('done');
