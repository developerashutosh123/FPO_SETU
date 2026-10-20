// Fetches the same GETs, as every demo persona, from the live gateway and from the read-only API, and compares status and body
// byte for byte. Only the X-Ledger-Mode header (and the headers that vary per request) may differ, and in the /health body the
// ledgerMode value ("live" versus "index-only"), which is the point of that endpoint.
// Usage: node scripts/compare-with-gateway.mjs [GATEWAY_URL] [READ_API_URL]
const GW = process.argv[2] ?? 'http://localhost:8080', RA = process.argv[3] ?? 'http://localhost:8081';
const PASS = process.env.DEMO_PASSWORD ?? 'Setu@2026';
const PERSONAS = [['anima.das', 'farmer'], ['subhankar.vle', 'fpo'], ['sujata.ceo', 'fpo'], ['debasis.ops', 'fpo'], ['ratan.store', 'fpo'], ['arindam.bank', 'bank'], ['rahul.buyer', 'buyer'], ['observer.gov', 'gov'], ['board.fpo', 'gov']];

async function login(u, portal) {
  if (u === 'anima.das') { // members sign in by phone and OTP
    const r = await fetch(`${GW}/auth/otp/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: '9000000001', otp: '123456' }) });
    return (await r.json()).token;
  }
  const r = await fetch(`${GW}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: PASS, portal }) });
  return (await r.json()).token;
}
const tokens = { public: undefined };
for (const [u, p] of PERSONAS) tokens[u] = await login(u, p);
const get = async (base, path, tok) => {
  const r = await fetch(base + path, { headers: tok ? { authorization: `Bearer ${tok}` } : {} });
  return { status: r.status, mode: r.headers.get('x-ledger-mode'), type: r.headers.get('content-type'), body: Buffer.from(await r.arrayBuffer()) };
};
const j = async (path, as = 'sujata.ceo') => JSON.parse((await get(GW, path, tokens[as])).body.toString());

// ids to ask about, found through the gateway itself
const lots = (await j('/lots?limit=200')).items;
const sscc = lots[0].sscc, pledged = lots.find((l) => l.status === 'PLEDGED')?.sscc ?? sscc, sold = lots.find((l) => l.status === 'SETTLED')?.sscc ?? sscc;
const orders = (await j('/orders?limit=200')).items, orderId = orders[0].orderId, settledOrder = orders.find((o) => o.status === 'SETTLED')?.orderId ?? orderId;
const loans = (await j('/loans?limit=200', 'arindam.bank')).items, loanId = loans[0]?.loanId;
const deposits = (await j('/storage/deposits?limit=5', 'ratan.store')).items, enwr = deposits.find((d) => d.enwr)?.enwr;
const farmers = (await j('/farmers?limit=3')).items, farmerId = farmers[0].id;
const blocks = await j('/ledger/blocks?limit=3', 'observer.gov');
const finBlock = (await j('/ledger/blocks?channel=finance-channel&limit=1', 'observer.gov'))[0];
const txOf = async (b) => (await j(`/ledger/blocks/${b.channel}/${b.number}`, 'observer.gov')).txs.at(-1).txId;
const txTrace = await txOf(blocks.find((b) => b.channel === 'trace-channel') ?? blocks[0]);
const txFin = await txOf(finBlock), txTrade = await txOf((await j('/ledger/blocks?channel=trade-channel&limit=1', 'observer.gov'))[0]);

const paths = [
  '/health', '/villages', '/ledger/blocks?limit=10', '/ledger/blocks?channel=finance-channel&limit=5', `/ledger/blocks/trace-channel/${blocks[0].number}`, '/ledger/blocks/trace-channel/0', '/ledger/blocks/finance-channel/1', '/ledger/blocks/trade-channel/0',
  `/ledger/tx/${txTrace}`, `/ledger/tx/${txFin}`, `/ledger/tx/${txTrade}`, `/ledger/tx/${'ab'.repeat(32)}`, `/ledger/search?q=${txFin}`, `/ledger/search?q=${sscc}`, `/ledger/search?q=${orderId}`,
  '/lots?limit=200', '/lots?status=PLEDGED', '/lots?commodity=POTATO&grade=A', `/lots/${sscc}`, `/lots/${pledged}`, `/lots/${sold}`, `/lots/${sscc}/label.pdf`, '/lots/drafts/pending', '/catalogue', '/catalogue?commodity=POTATO&minQtl=10',
  `/public/provenance/${sscc}`, `/public/provenance/${sold}`,
  '/orders?limit=200', '/orders?status=SETTLED', `/orders/${orderId}`, `/orders/${settledOrder}`, `/orders/${settledOrder}/price`,
  '/loans?limit=200', loanId && `/loans/${loanId}`, '/storage/deposits', enwr && `/collateral?enwr=${enwr}`, `/collateral?sscc=${pledged}`,
  '/patronage/runs', '/statements/me', '/kpis', '/prices', '/prices?commodity=POTATO', '/prices/msp?crop=paddy', '/audit/sample', '/reputation/attestors',
  '/farmers?limit=50', `/farmers?village=${encodeURIComponent(farmers[0].village)}`, '/farmers/me', `/diary/inputs?farmerId=${farmerId}`, '/diary/inputs',
  '/lots/nonsense', '/orders/ORD-0000-00000', '/no/such/route',
].filter(Boolean);

let same = 0, diff = 0, modeBad = 0;
const rows = [];
for (const path of paths) {
  for (const who of ['public', ...PERSONAS.map((p) => p[0])]) {
    const [a, b] = await Promise.all([get(GW, path, tokens[who]), get(RA, path, tokens[who])]);
    if (a.mode !== 'live' || b.mode !== 'index-only') modeBad++;
    // /health is the one body that must differ: it names the mode. Everything else, byte for byte.
    const bodiesMatch = path === '/health' ? a.body.toString().replace('"ledgerMode":"live"', '"ledgerMode":"index-only"') === b.body.toString() : a.body.equals(b.body);
    const equal = a.status === b.status && a.type === b.type && bodiesMatch;
    if (equal) same++; else { diff++; rows.push(`${who} ${path}: gateway ${a.status} ${a.body.length}B / read-api ${b.status} ${b.body.length}B\n   gw: ${a.body.toString().slice(0, 160)}\n   ra: ${b.body.toString().slice(0, 160)}`); }
  }
}
console.log(`${paths.length} paths x ${PERSONAS.length + 1} callers = ${same + diff} comparisons: ${same} byte-identical, ${diff} different, ${modeBad} with a wrong X-Ledger-Mode header`);
rows.slice(0, 25).forEach((r) => console.log(r));
process.exit(diff || modeBad ? 1 : 0);
