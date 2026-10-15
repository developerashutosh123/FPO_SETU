import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { ENDPOINTS } from '../mock/endpoints.mjs';
import { validatorFor, resName, ajv } from './helpers.ts';

const PORT = 4300 + Math.floor(Math.random() * 400);
const base = `http://127.0.0.1:${PORT}`;
const procs: ChildProcess[] = [];
const start = async (port: number, extra: string[] = []) => {
  const p = spawn(process.execPath, ['mock/server.mjs', '--quiet', '--port', String(port), ...extra], { cwd: new URL('..', import.meta.url).pathname, stdio: 'inherit' });
  procs.push(p);
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${port}/__mock`); return; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  throw new Error('mock did not start');
};
before(async () => { await start(PORT); });
after(() => procs.forEach((p) => p.kill()));

const PERSONA: Record<string, [string, string]> = { member: ['anima.das', 'farmer'], vle: ['subhankar.vle', 'farmer'], ceo: ['sujata.ceo', 'fpo'], operator: ['debasis.ops', 'fpo'], warehouse: ['ratan.store', 'fpo'], board: ['board.fpo', 'gov'], credit_officer: ['arindam.bank', 'bank'], buyer_manager: ['rahul.buyer', 'buyer'], observer: ['observer.gov', 'gov'] };
const tokens: Record<string, string> = {};
const tokenFor = async (role: string, root = base) => {
  const key = `${root}|${role}`;
  if (tokens[key]) return tokens[key]!;
  const [username, portal] = PERSONA[role]!;
  const r = await fetch(`${root}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: 'Setu@2026', portal }) });
  assert.equal(r.status, 200, `login ${username}`);
  return (tokens[key] = ((await r.json()) as any).token);
};
const call = async (method: string, path: string, role?: string, body?: unknown, headers: Record<string, string> = {}, root = base) => {
  const h: Record<string, string> = { 'content-type': 'application/json', ...headers };
  if (role) h.authorization = `Bearer ${await tokenFor(role, root)}`;
  const r = await fetch(`${root}${path}`, { method, headers: h, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await r.text();
  let json: any; try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: r.status, json, headers: r.headers, text };
};

test('login: right password works for every persona; wrong password is ERR_UNAUTHENTICATED; wrong portal is ERR_FORBIDDEN_ROLE', async () => {
  for (const role of Object.keys(PERSONA)) await tokenFor(role);
  const bad = await call('POST', '/auth/login', undefined, { username: 'anima.das', password: 'nope', portal: 'farmer' });
  assert.equal(bad.status, 401); assert.equal(bad.json.error.code, 'ERR_UNAUTHENTICATED');
  const wrongPortal = await call('POST', '/auth/login', undefined, { username: 'arindam.bank', password: 'Setu@2026', portal: 'buyer' });
  assert.equal(wrongPortal.status, 403);
});
test('OTP login for the demo farmer', async () => {
  assert.equal((await call('POST', '/auth/otp/request', undefined, { phone: '9000000001' })).json.demoOtp, '123456');
  assert.equal((await call('POST', '/auth/otp/verify', undefined, { phone: '9000000001', otp: '123456' })).status, 200);
  assert.equal((await call('POST', '/auth/otp/verify', undefined, { phone: '9000000001', otp: '000000' })).status, 401);
});

test('every GET fixture example is served and matches the contract schema, for a role that may call it', async () => {
  const dir = new URL('../fixtures/', import.meta.url);
  const bad: string[] = [];
  let n = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const j = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    for (const ex of j.examples as any[]) {
      const e = ENDPOINTS.find((x) => x.id === ex.endpoint)!;
      if (e.method !== 'GET' || e.content || (ex.status ?? 200) >= 400) continue;
      let path = e.path.replace(/\{(\w+)\}/g, (_: string, k: string) => encodeURIComponent(ex.params?.[k] ?? 'x'));
      const qs = new URLSearchParams(ex.query ?? {}).toString();
      if (qs) path += `?${qs}`;
      const role = e.roles.includes('public') ? undefined : e.roles.includes('authenticated') ? 'ceo' : e.roles[0]!;
      const r = await call('GET', path, role);
      n++;
      if (r.status !== 200) { bad.push(`${path} as ${role}: ${r.status} ${r.text.slice(0, 120)}`); continue; }
      const v = validatorFor(resName(e.id));
      if (!v(r.json)) bad.push(`${path}: ${ajv.errorsText(v.errors).slice(0, 200)}`);
      assert.match(r.headers.get('x-ledger-mode')!, /^(live|index-only)$/);
    }
  }
  assert.ok(n > 150, `swept ${n} requests`);
  assert.deepEqual(bad.slice(0, 8), []);
});

test('roles: no token is 401, wrong role is 403, bank cannot read the crop diary, regulator cannot read prices', async () => {
  assert.equal((await call('GET', '/lots')).status, 401);
  assert.equal((await call('GET', '/lots', 'buyer_manager')).json.error.code, 'ERR_FORBIDDEN_ROLE');
  assert.equal((await call('GET', '/diary/inputs', 'credit_officer')).json.error.code, 'ERR_FORBIDDEN_ROLE');
  const p = await call('GET', '/orders/ORD-2026-00087/price', 'observer');
  assert.equal(p.status, 403); assert.equal(p.json.error.code, 'ERR_FORBIDDEN_ORG');
  assert.equal((await call('GET', '/orders/ORD-2026-00087/price', 'ceo')).status, 200);
  assert.equal((await call('GET', '/orders/ORD-2026-00087/price', 'buyer_manager')).status, 200);
});
test('lot passport: a buyer does not see the lien; a member sees only their own lots', async () => {
  const sscc = '089012340000004527'.slice(0, 17); // placeholder, replaced below
  void sscc;
  const list = (await call('GET', '/lots?status=PLEDGED', 'ceo')).json.items;
  assert.ok(list.length >= 2);
  const own = (await call('GET', `/lots/${list.find((x: any) => x.village === 'CHANGUAL').sscc}`, 'member'));
  assert.equal(own.status, 200); assert.equal(own.json.lien.status, 'ACTIVE');
  const other = await call('GET', `/lots/${list.find((x: any) => x.village === 'GOPALPUR').sscc}`, 'member');
  assert.equal(other.status, 403);
  const asBuyer = await call('GET', `/lots/${list[0].sscc}`, 'buyer_manager');
  assert.equal(asBuyer.json.lien, undefined);
});
test('list filters and pagination', async () => {
  const all = (await call('GET', '/lots?limit=5', 'ceo')).json;
  assert.equal(all.items.length, 5); assert.ok(all.nextCursor);
  const page2 = (await call('GET', `/lots?limit=5&cursor=${all.nextCursor}`, 'ceo')).json;
  assert.notEqual(page2.items[0].sscc, all.items[0].sscc);
  const goldens = (await call('GET', '/lots?village=GOLGRAM', 'ceo')).json.items;
  assert.ok(goldens.length > 0 && goldens.every((x: any) => x.village === 'GOLGRAM'));
  const cat = (await call('GET', '/catalogue', 'buyer_manager')).json.items;
  assert.ok(cat.length > 0); assert.ok(cat.every((x: any) => x.grade && x.quantityQtl > 0));
});

test('double financing: a second lien on a pledged e-NWR is rejected with the first lien tx; a new e-NWR succeeds, then is rejected', async () => {
  const dup = await call('POST', '/collateral/ENWR-NERL-2026-004212/lien', 'credit_officer', { loanId: 'LN-2026-00099', amount: 1000, tenureDays: 90, ratePct: 9 });
  assert.equal(dup.status, 409); assert.equal(dup.json.error.code, 'ERR_DOUBLE_FINANCING'); assert.match(dup.json.error.txId, /^FIXTURE-/);
  const first = await call('POST', '/collateral/ENWR-CCRL-2026-000119/lien', 'credit_officer', { loanId: 'LN-2026-00099', amount: 100000, tenureDays: 180, ratePct: 9.5 });
  assert.equal(first.status, 201); assert.match(first.json.txId, /^FIXTURE-/); assert.equal(first.json.resource.loanId, 'LN-2026-00099'); assert.equal(first.json.validationCode, 'VALID');
  const again = await call('POST', '/collateral/ENWR-CCRL-2026-000119/lien', 'credit_officer', { loanId: 'LN-2026-00100', amount: 1, tenureDays: 1, ratePct: 1 });
  assert.equal(again.json.error.code, 'ERR_DOUBLE_FINANCING'); assert.equal(again.json.error.txId, first.json.txId);
  const tx = await call('GET', `/ledger/tx/${first.json.txId}`);
  assert.equal(tx.status, 200, 'minted receipts are explorable');
});
test('private price: two-step agreement commits only when both hashes match; mismatch is ERR_PRICE_HASH_MISMATCH; the public order never shows the price', async () => {
  const a = await call('POST', '/orders/ORD-2026-00091/agree-price', 'ceo', { pricePerQtl: 1600 });
  assert.equal(a.json.resource.state, 'AWAITING_COUNTERPARTY');
  const bad = await call('POST', '/orders/ORD-2026-00091/agree-price', 'buyer_manager', { pricePerQtl: 1650 });
  assert.equal(bad.json.error.code, 'ERR_PRICE_HASH_MISMATCH');
  await call('POST', '/orders/ORD-2026-00091/agree-price', 'ceo', { pricePerQtl: 1600 });
  const b = await call('POST', '/orders/ORD-2026-00091/agree-price', 'buyer_manager', { pricePerQtl: 1600 });
  assert.equal(b.json.resource.state, 'AGREED'); assert.match(b.json.resource.priceHash, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(b.json).includes('1600'));
});
test('farmer signature: malformed hex is ERR_VALIDATION; forced bad signature is ERR_BAD_FARMER_SIGNATURE; valid shape returns a receipt', async () => {
  const draft = (await call('GET', '/lots/drafts/pending', 'member')).json[0];
  assert.equal((await call('POST', `/lots/${draft.sscc}/farmer-sign`, 'member', { signatureHex: 'zz' })).json.error.code, 'ERR_VALIDATION');
  assert.equal((await call('POST', `/lots/${draft.sscc}/farmer-sign`, 'member', { signatureHex: 'a'.repeat(128) }, { 'x-mock-error': 'ERR_BAD_FARMER_SIGNATURE' })).json.error.code, 'ERR_BAD_FARMER_SIGNATURE');
  const ok = await call('POST', `/lots/${draft.sscc}/farmer-sign`, 'member', { signatureHex: 'a'.repeat(128) });
  assert.equal(ok.status, 200); assert.equal(ok.json.resource.sscc, draft.sscc); assert.equal(ok.json.resource.status, 'COMMISSIONED');
});
test('every write endpoint returns a FIXTURE- receipt that validates against the contract', async () => {
  const bad: string[] = [];
  for (const e of ENDPOINTS.filter((x) => x.method !== 'GET' && x.res?.startsWith('Receipted<') )) {
    if (['markLien', 'agreePrice', 'farmerSign'].includes(e.id)) continue; // covered by stateful tests above
    const role = e.roles.includes('authenticated') ? 'ceo' : e.roles[0]!;
    const path = e.path.replace(/\{(\w+)\}/g, (_: string, k: string) => ({ sscc: '089012340000004517', id: 'DEP-2026-00201', enwr: 'ENWR-NERL-2026-004211', loanId: 'LN-2026-00041', orderId: 'ORD-2026-00087' } as Record<string, string>)[k] ?? 'x');
    const r = await call(e.method, path, role, { x: 1 });
    if (![200, 201].includes(r.status)) { bad.push(`${e.id}: ${r.status} ${r.text.slice(0, 100)}`); continue; }
    if (!/^FIXTURE-/.test(r.json.txId)) bad.push(`${e.id}: txId ${r.json.txId}`);
    const v = validatorFor(resName(e.id));
    if (!v(r.json)) bad.push(`${e.id}: ${ajv.errorsText(v.errors).slice(0, 160)}`);
  }
  assert.deepEqual(bad, []);
});
test('label.pdf is a PDF; SSE streams ledger events with no PII', async () => {
  const pdf = await fetch(`${base}/lots/089012340000004517/label.pdf`, { headers: { authorization: `Bearer ${await tokenFor('operator')}` } });
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
  const ctrl = new AbortController();
  const sse = await fetch(`${base}/events/stream`, { signal: ctrl.signal });
  assert.match(sse.headers.get('content-type')!, /text\/event-stream/);
  await call('POST', '/lots/089012340000004517/quality', 'operator', {}); // mints an event
  const reader = sse.body!.getReader(); let text = '';
  const t0 = Date.now();
  while (!text.includes('data:') && Date.now() - t0 < 3000) { const { value } = await reader.read(); text += Buffer.from(value!).toString(); }
  ctrl.abort();
  const data = JSON.parse(/data: (.*)/.exec(text)![1]!);
  assert.ok(data.event && data.txId.startsWith('FIXTURE-') && data.channel);
  assert.ok(!/name|phone/i.test(JSON.stringify(data)));
});

test('index-only mode: header on every response, GETs work, writes are 503 ERR_LEDGER_UNAVAILABLE, health says index-only', async () => {
  const port = PORT + 500; await start(port, ['--index-only']); const root = `http://127.0.0.1:${port}`;
  const h = await call('GET', '/health', undefined, undefined, {}, root);
  assert.equal(h.headers.get('x-ledger-mode'), 'index-only'); assert.equal(h.json.ledgerMode, 'index-only');
  const s = await call('GET', '/ledger/status', undefined, undefined, {}, root);
  assert.equal(s.json.mode, 'index-only'); assert.ok(s.json.lastIndexedAt);
  const w = await call('POST', '/collateral/ENWR-CCRL-2026-000119/lien', 'credit_officer', { loanId: 'LN-1', amount: 1, tenureDays: 1, ratePct: 1 }, {}, root);
  assert.equal(w.status, 503); assert.equal(w.json.error.code, 'ERR_LEDGER_UNAVAILABLE'); assert.equal(w.headers.get('x-ledger-mode'), 'index-only');
  assert.equal((await call('GET', '/lots?limit=1', 'ceo', undefined, {}, root)).status, 200);
});
