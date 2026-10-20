#!/usr/bin/env node
// FPO-SETU mock gateway. Zero dependencies. Development only: portals use it before the real gateway is public.
//   node ../shared/mock/server.mjs [--port 4010] [--index-only] [--no-auth] [--quiet]
// Serves shared/fixtures/*.json for every GET, mints FIXTURE- receipts for writes, streams SSE, and enforces the roles in endpoints.mjs.
// Test hooks: header `X-Mock-Error: ERR_...` (or ?simulate=ERR_...) forces that error. `--index-only` mimics the read-only fallback API.
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENDPOINTS } from './endpoints.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PORT = Number(process.env.PORT ?? opt('port', 4010));
const INDEX_ONLY = flag('index-only') || process.env.MOCK_LEDGER_MODE === 'index-only';
const AUTH_ON = !(flag('no-auth') || process.env.MOCK_AUTH === 'off');
const QUIET = flag('quiet');
const FIXTURE_DIR = process.env.FIXTURE_DIR ?? join(here, '..', 'fixtures');

// Same rule as contract.ts canonicalJson (copied so the mock stays dependency-free).
const canon = (v) => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canon).join(',')}]` : `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
const sha = (s) => createHash('sha256').update(s).digest('hex');
const ERROR_STATUS = { ERR_UNAUTHENTICATED: 401, ERR_FORBIDDEN_ROLE: 403, ERR_FORBIDDEN_ORG: 403, ERR_VALIDATION: 400, ERR_NOT_FOUND: 404, ERR_INVALID_STATE: 409, ERR_BAD_FARMER_SIGNATURE: 422, ERR_BAD_DEVICE_SIGNATURE: 422, ERR_DOUBLE_FINANCING: 409, ERR_LOT_PLEDGED: 409, ERR_UNILATERAL_CUSTODY: 403, ERR_PRICE_HASH_MISMATCH: 409, ERR_PATRONAGE_UNBALANCED: 422, ERR_LEDGER_UNAVAILABLE: 503 };

// ---- fixtures
const examples = [];
let meta = {};
for (const f of readdirSync(FIXTURE_DIR).filter((x) => x.endsWith('.json'))) {
  const j = JSON.parse(readFileSync(join(FIXTURE_DIR, f), 'utf8'));
  meta = { ...meta, [f]: j._meta };
  examples.push(...j.examples);
}
const CONTRACT_VERSION = examples.find((e) => e.endpoint === 'health').body.contractVersion;
const byEndpoint = (id) => examples.filter((e) => e.endpoint === id);
const ok = (e) => !e.status || e.status < 400;
const deepClone = (x) => JSON.parse(JSON.stringify(x));

// ---- routes
const routes = ENDPOINTS.map((e) => {
  const names = [];
  const re = new RegExp('^' + e.path.replace(/\{(\w+)\}/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '/?$');
  return { ...e, re, names };
});
const matchRoute = (method, path) => {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.re.exec(path);
    if (m) return { route: r, params: Object.fromEntries(r.names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
  }
  return null;
};

// ---- mutable state (reset with POST /__mock/reset)
let state;
function resetState() {
  state = { block: { 'trace-channel': 0, 'finance-channel': 0, 'trade-channel': 0 }, minted: new Map(), liens: new Map(), firstPrice: new Map(), clients: new Set(), pool: 0, seq: 0 };
  for (const e of byEndpoint('listCollateral').filter((x) => !x.query)) for (const c of e.body.items) if (c.lien.status === 'ACTIVE') state.liens.set(c.enwr, c.lien.proof);
}
resetState();
const heights = () => byEndpoint('health')[0].body.channels;

// ---- helpers
const send = (res, status, body, extra = {}) => {
  const buf = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...extra });
  res.end(buf);
};
const err = (res, code, message, extra = {}) => send(res, ERROR_STATUS[code] ?? 500, { error: { code, message, ...extra } });
const decodeJwt = (h) => {
  const m = /^Bearer\s+(.+)$/i.exec(h ?? '');
  if (!m) return null;
  try { return JSON.parse(Buffer.from(m[1].split('.')[1], 'base64url').toString('utf8')); } catch { return null; }
};
const readBody = (req) => new Promise((resolve) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve(null); } }); });
const matchParams = (ex, params) => Object.entries(ex.params ?? {}).every(([k, v]) => params[k] === v);
const matchQuery = (ex, q) => Object.entries(ex.query ?? {}).every(([k, v]) => q.get(k) === v);

function paginate(body, q) {
  if (!body || !Array.isArray(body.items)) return body;
  let items = body.items;
  for (const [k, v] of q) {
    if (['cursor', 'limit', 'simulate', 'q', 'channel', 'from', 'to', 'minQtl', 'crop'].includes(k)) continue;
    if (items.length && items.some((i) => k in i)) items = items.filter((i) => String(i[k]).toLowerCase() === v.toLowerCase());
  }
  if (q.get('minQtl')) items = items.filter((i) => (i.quantityQtl ?? 0) >= Number(q.get('minQtl')));
  if (q.get('from')) items = items.filter((i) => !i.date || i.date >= q.get('from'));
  if (q.get('to')) items = items.filter((i) => !i.date || i.date <= q.get('to'));
  const limit = Math.min(Number(q.get('limit') ?? 50) || 50, 200);
  const start = Number(q.get('cursor') ?? 0) || 0;
  const page = items.slice(start, start + limit);
  const out = { ...body, items: page };
  if (start + limit < items.length) out.nextCursor = String(start + limit); else delete out.nextCursor;
  return out;
}

// role-based field filtering for the Lot Passport (contract Section 9.4, simplified)
function filterPassport(p, role) {
  const out = deepClone(p);
  if (role === 'buyer_manager') { delete out.lien; if (out.storage) delete out.storage.enwr; }
  if (role === 'observer' && out.order) delete out.order.priceHash;
  return out;
}

// ---- receipts and SSE
function mint(example, resourcePatch) {
  const body = deepClone(example.body);
  const ch = body.channel;
  state.block[ch] = (state.block[ch] || 0) + 1;
  const txId = `FIXTURE-${randomBytes(6).toString('hex')}`;
  body.txId = txId; body.blockNumber = heights()[ch].height + state.block[ch] - 1; body.committedAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  if (resourcePatch) body.resource = { ...body.resource, ...resourcePatch };
  state.minted.set(txId, { ...body });
  const ev = receiptEvent(body);
  if (ev) broadcast(ev);
  return body;
}
const FN_EVENT = { commissionLot: 'LotCommissioned', attestQuality: 'LotGraded', recordDeposit: 'DepositRecorded', issueENWRRef: 'ENWRIssued', markLien: 'LienMarked', recordDisbursement: 'LoanDisbursed', recordRepayment: 'LoanRepaid', releaseLien: 'LienReleased', createOrder: 'OrderCreated', agreePrice: 'PriceAgreed', proposeTransfer: 'CustodyProposed', acceptTransfer: 'CustodyAccepted', anchorConditionDigest: 'ConditionDigestAnchored', acceptQuality: 'QualityAccepted', recordSettlement: 'SettlementExecuted', distributePatronage: 'PatronageDistributed', registerFarmerAndPlot: 'FarmerOnboarded', recordInputEvent: 'InputApplied', recordTransformation: 'LotTransformed', markUnverifiable: 'PersonalDataErased' };
function receiptEvent(r) {
  const event = FN_EVENT[r.fn]; if (!event) return null;
  const res = r.resource ?? {};
  return { event, ...(res.sscc ? { sscc: res.sscc } : {}), ...(res.orderId ? { orderId: res.orderId } : {}), ...(res.enwr ? { enwr: res.enwr } : {}), txId: r.txId, blockNumber: r.blockNumber, channel: r.channel, at: r.committedAt };
}
function broadcast(ev) { const line = `event: ledger\nid: ${++state.seq}\ndata: ${JSON.stringify(ev)}\n\n`; for (const c of state.clients) c.write(line); }
const replayPool = () => byEndpoint('eventsStream').map((e) => e.body);
setInterval(() => {
  if (!state.clients.size || INDEX_ONLY) return;
  const pool = replayPool(); if (!pool.length) return;
  const ev = { ...pool[state.pool++ % pool.length], at: new Date().toISOString().replace(/\.\d+Z$/, 'Z') };
  broadcast(ev);
}, 4000).unref();

// minimal one-page PDF, 100 x 50 mm (283.46 x 141.73 pt), Helvetica text; no QR in the mock
function labelPdf(sscc, humanRef) {
  const esc = (s) => s.replace(/[()\\]/g, '\\$&');
  const content = `BT /F1 9 Tf 12 112 Td (${esc(humanRef)}) Tj 0 -16 Td (SSCC ${esc(sscc)}) Tj 0 -16 Td (MOCK LABEL: fixture only, no QR) Tj ET`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 283.46 141.73] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let pdf = '%PDF-1.4\n'; const off = [];
  objs.forEach((o, i) => { off.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

// ---- request handling
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, x-mock-error', 'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS', 'access-control-expose-headers': 'X-Ledger-Mode, X-Data-Source' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const hdr = { ...CORS, 'x-ledger-mode': INDEX_ONLY ? 'index-only' : 'live', 'x-data-source': 'fixture' };
  const origWrite = res.writeHead.bind(res);
  res.writeHead = (s, h) => origWrite(s, { ...hdr, ...h });
  if (!QUIET) res.on('finish', () => console.log(`${new Date().toISOString().slice(11, 19)} ${req.method} ${url.pathname}${url.search} -> ${res.statusCode}`));
  if (req.method === 'OPTIONS') return send(res, 204, '');

  if (url.pathname === '/__mock' ) return send(res, 200, { name: 'FPO-SETU mock gateway', contractVersion: CONTRACT_VERSION, ledgerMode: INDEX_ONLY ? 'index-only' : 'live', auth: AUTH_ON, endpoints: ENDPOINTS.length, fixtures: meta, hooks: ['X-Mock-Error: ERR_*', '?simulate=ERR_*', 'POST /__mock/reset'] });
  if (url.pathname === '/__mock/reset' && req.method === 'POST') { resetState(); return send(res, 200, { reset: true }); }

  const hit = matchRoute(req.method, url.pathname);
  if (!hit) return err(res, 'ERR_NOT_FOUND', `No route ${req.method} ${url.pathname}. See /__mock and shared/openapi.yaml.`);
  const { route, params } = hit;
  const q = url.searchParams;

  // auth and roles
  const claims = decodeJwt(req.headers.authorization);
  if (AUTH_ON && !route.roles.includes('public')) {
    if (!claims) return err(res, 'ERR_UNAUTHENTICATED', 'Sign in first. Send Authorization: Bearer <token> from POST /auth/login.');
    if (!route.roles.includes('authenticated') && !route.roles.includes(claims.role)) return err(res, route.id === 'getOrderPrice' ? 'ERR_FORBIDDEN_ORG' : 'ERR_FORBIDDEN_ROLE', route.id === 'getOrderPrice' ? 'Only the FPO and the Buyer can read this price.' : `Role ${claims.role} cannot call ${route.method} ${route.path}.`);
  }
  const role = claims?.role;

  // forced errors
  const forced = req.headers['x-mock-error'] ?? q.get('simulate');
  if (forced && ERROR_STATUS[forced]) {
    const canned = examples.find((e) => e.endpoint === route.id && e.status >= 400 && (e.query?.simulate === forced));
    if (canned) return send(res, canned.status, canned.body);
    return err(res, forced, `Simulated ${forced} (X-Mock-Error).`);
  }

  // writes in index-only mode
  const isWrite = route.method !== 'GET' && !['login', 'otpRequest', 'otpVerify'].includes(route.id);
  if (INDEX_ONLY && isWrite) return err(res, 'ERR_LEDGER_UNAVAILABLE', 'The ledger node is asleep. You are seeing the last indexed state. Actions that write to the ledger are paused.');

  const body = route.method === 'GET' ? {} : await readBody(req);
  if (body === null) return err(res, 'ERR_VALIDATION', 'Request body is not valid JSON.');

  // ---- special handlers
  if (route.id === 'eventsStream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write(`: connected, ledger ${INDEX_ONLY ? 'index-only' : 'live'}. Mock events are replayed fixtures plus receipts minted by POSTs.\nretry: 3000\n\n`);
    state.clients.add(res); req.on('close', () => state.clients.delete(res));
    return;
  }
  if (route.id === 'login') {
    const cands = byEndpoint('login');
    const user = cands.find((e) => e.query.username === body.username);
    if (!user || body.password !== 'Setu@2026') return err(res, 'ERR_UNAUTHENTICATED', 'Wrong username or password. Demo password is Setu@2026.');
    const ex = cands.find((e) => e.query.username === body.username && e.query.portal === body.portal);
    if (!ex) return err(res, 'ERR_FORBIDDEN_ROLE', `${body.username} cannot sign in to the ${body.portal} portal.`);
    return send(res, 200, ex.body);
  }
  if (route.id === 'otpRequest') return /^\d{10}$/.test(body.phone ?? '') ? send(res, 200, byEndpoint('otpRequest')[0].body) : err(res, 'ERR_VALIDATION', 'Phone must be 10 digits.');
  if (route.id === 'otpVerify') return body.phone === '9000000001' && body.otp === '123456' ? send(res, 200, byEndpoint('otpVerify')[0].body) : err(res, 'ERR_UNAUTHENTICATED', 'Wrong OTP. The demo OTP is 123456 and works for phone 9000000001.');
  if (route.id === 'health') { const b = deepClone(byEndpoint('health')[0].body); b.ledgerMode = INDEX_ONLY ? 'index-only' : 'live'; return send(res, 200, b); }
  if (route.id === 'ledgerStatus') { const b = deepClone(byEndpoint('ledgerStatus')[0].body); if (INDEX_ONLY) { b.mode = 'index-only'; b.lastIndexedAt = '2026-11-14T12:32:00Z'; b.note = 'Index-only: this is the last indexed chain state, not a live query of a peer. The ledger node is asleep.'; b.peers.forEach((p) => (p.up = false)); b.orderers.forEach((o) => { o.up = false; o.raftLeader = false; }); } return send(res, 200, b); }
  if (route.id === 'ledgerTx') {
    const m = state.minted.get(params.txId);
    const fx = byEndpoint('ledgerTx').find((e) => e.params.txId === params.txId);
    if (fx) return send(res, 200, fx.body);
    if (m) return send(res, 200, { txId: m.txId, channel: m.channel, chaincode: m.chaincode, fn: m.fn, blockNumber: m.blockNumber, blockHash: `FIXTURE-${sha(m.txId).slice(0, 12)}`, validationCode: 'VALID', timestamp: m.committedAt, creatorMsp: m.endorsers[0], endorsers: m.endorsers, rwset: { reads: [], writes: [] } });
    return err(res, 'ERR_NOT_FOUND', `No transaction ${params.txId} in the fixtures.`);
  }
  if (route.id === 'ledgerSearch') {
    const term = (q.get('q') ?? '').trim();
    const tx = byEndpoint('ledgerTx').find((e) => e.params.txId === term);
    if (tx) return send(res, 200, [{ kind: 'tx', id: term, channel: tx.body.channel, label: `${tx.body.fn} in block ${tx.body.blockNumber}` }]);
    const s = byEndpoint('ledgerSearch').find((e) => e.query.q === term);
    return send(res, 200, s ? s.body : []);
  }
  if (route.id === 'lotLabel') {
    const p = byEndpoint('getLot').find((e) => e.params.sscc === params.sscc);
    if (!p) return err(res, 'ERR_NOT_FOUND', `No lot ${params.sscc}.`);
    return send(res, 200, labelPdf(p.body.sscc, p.body.humanRef), { 'content-type': 'application/pdf' });
  }
  if (route.id === 'getLot') {
    const ex = byEndpoint('getLot').find((e) => e.params.sscc === params.sscc);
    if (!ex) return err(res, 'ERR_NOT_FOUND', `No lot ${params.sscc}.`);
    const mine = byEndpoint('getMyFarmer')[0].body.farmerToken;
    if (AUTH_ON && role === 'member' && ex.body.farmerToken !== mine) return err(res, 'ERR_FORBIDDEN_ROLE', 'Members can open only their own lots.');
    return send(res, 200, filterPassport(ex.body, role));
  }
  if (route.id === 'markLien') {
    const enwr = params.enwr;
    if (state.liens.has(enwr)) { const pr = state.liens.get(enwr); return err(res, 'ERR_DOUBLE_FINANCING', `This lot already has an active lien (tx ${pr.txId}). Release it before pledging again.`, { txId: pr.txId }); }
    const col = byEndpoint('listCollateral').flatMap((e) => e.body.items).find((c) => c.enwr === enwr);
    if (!col) return err(res, 'ERR_NOT_FOUND', `No e-NWR ${enwr}.`);
    if (!body.loanId || !body.amount) return err(res, 'ERR_VALIDATION', 'loanId and amount are required.');
    const r = mint(byEndpoint('markLien').find(ok), { loanId: body.loanId, enwr, sscc: col.lot.sscc, amount: body.amount, status: 'SANCTIONED', tenureDays: body.tenureDays, ratePct: body.ratePct, proofs: [] });
    state.liens.set(enwr, { txId: r.txId, blockNumber: r.blockNumber, channel: r.channel });
    r.resource.proofs = [{ txId: r.txId, blockNumber: r.blockNumber, channel: r.channel }];
    return send(res, 201, r);
  }
  if (route.id === 'agreePrice') {
    const od = byEndpoint('getOrder').find((e) => e.params.orderId === params.orderId);
    if (!od) return err(res, 'ERR_NOT_FOUND', `No order ${params.orderId}.`);
    if (od.body.status !== 'OPEN') return err(res, 'ERR_INVALID_STATE', `Order ${params.orderId} is ${od.body.status}; a price is already agreed.`);
    if (typeof body.pricePerQtl !== 'number' || body.pricePerQtl <= 0) return err(res, 'ERR_VALIDATION', 'pricePerQtl must be a positive number.');
    const salt = body.salt ?? sha(params.orderId).slice(0, 32);
    const priceHash = sha(canon({ orderId: params.orderId, pricePerQtl: body.pricePerQtl, salt }));
    const first = state.firstPrice.get(params.orderId);
    const tpl = byEndpoint('agreePrice').find((e) => ok(e) && !e.query);
    if (!first) { state.firstPrice.set(params.orderId, { role, priceHash }); return send(res, 200, mint(tpl, { orderId: params.orderId, priceHash, state: 'AWAITING_COUNTERPARTY' })); }
    if (first.priceHash !== priceHash) { state.firstPrice.delete(params.orderId); return err(res, 'ERR_PRICE_HASH_MISMATCH', 'The two submitted prices do not match. Both parties must submit the same price and salt. Start again.'); }
    state.firstPrice.delete(params.orderId);
    return send(res, 200, mint(byEndpoint('agreePrice').find((e) => e.query?.simulate === 'AGREED') ?? tpl, { orderId: params.orderId, priceHash, state: 'AGREED' }));
  }
  if (route.id === 'farmerSign') {
    if (!/^[0-9a-f]{128}$/.test(body.signatureHex ?? '')) return err(res, 'ERR_VALIDATION', 'signatureHex must be 128 lowercase hex chars (r || s). The mock does not verify the signature; use X-Mock-Error: ERR_BAD_FARMER_SIGNATURE to test that path.');
    const lot = byEndpoint('getLot').find((e) => e.params.sscc === params.sscc)?.body ?? byEndpoint('listPendingDrafts')[0].body.find((d) => d.sscc === params.sscc);
    if (!lot) return err(res, 'ERR_NOT_FOUND', `No lot or draft ${params.sscc}.`);
    const r = mint(byEndpoint('farmerSign')[0]);
    r.resource = { ...(byEndpoint('getLot').find((e) => e.params.sscc === params.sscc)?.body ?? byEndpoint('getLot')[0].body), sscc: params.sscc, status: 'COMMISSIONED' };
    return send(res, 200, r);
  }

  // ---- generic GET: choose the most specific matching example
  const cands = byEndpoint(route.id).filter(ok);
  if (route.method === 'GET') {
    const withParams = cands.filter((e) => matchParams(e, params));
    const exact = withParams.filter((e) => e.query && matchQuery(e, q)).sort((a, b) => Object.keys(b.query).length - Object.keys(a.query).length)[0];
    const base = withParams.find((e) => !e.query);
    const hit2 = exact ?? base ?? (Object.keys(params).length === 0 ? withParams[0] : undefined);
    if (!hit2) return err(res, 'ERR_NOT_FOUND', `No fixture for ${route.id} ${JSON.stringify(params)}.`);
    return send(res, 200, paginate(deepClone(hit2.body), exact ? new URLSearchParams([...q].filter(([k]) => !(k in (exact.query ?? {})))) : q));
  }

  // ---- generic writes: mint a receipt from the matching example (or the first one)
  const tpl = cands.find((e) => matchParams(e, params)) ?? cands[0];
  if (!tpl) return err(res, 'ERR_NOT_FOUND', `No fixture for ${route.id}.`);
  if (tpl.body && tpl.body.txId) {
    const patch = {};
    if (route.id === 'markLien') Object.assign(patch, {});
    return send(res, route.status ?? 200, mint(tpl, patch));
  }
  return send(res, route.status ?? 200, tpl.body);
});

server.listen(PORT, () => {
  if (!QUIET) console.log(`FPO-SETU mock gateway on http://localhost:${PORT}  contract ${CONTRACT_VERSION}  ledger ${INDEX_ONLY ? 'index-only' : 'live'}  auth ${AUTH_ON ? 'on (demo password Setu@2026)' : 'off'}\nFixture data only: every tx ID starts with FIXTURE-. Never ship this to production.`);
});
