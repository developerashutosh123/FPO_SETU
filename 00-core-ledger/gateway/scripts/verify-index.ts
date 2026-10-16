// Proves the index (Postgres) matches the ledger. Reads every block and every entity straight from the peers and compares:
// chain heights and checkpoints, block and transaction rows, the event rows, and each lot, deposit, lien, loan, order and patronage run
// against chaincode. Exit code 1 on any difference. Usage: pnpm verify:index
import { eq, sql } from 'drizzle-orm';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/client.js';
import { FabricLedger } from '../src/fabric/client.js';
import { CHANNELS } from '../src/fabric/topology.js';
import { expandEvents, } from '../src/indexer/indexer.js';
import { INDEXER_USER } from '../src/indexer/refresh.js';
import { blocksView, depositsView, indexerCheckpoints, ledgerEvents, liensView, lotsView, ordersView, patronageView, txView } from '../src/db/schema.js';
import { canonicalJson } from '../src/contract/contract.js';
import type { Channel } from '../src/contract/contract.js';

const cfg = loadConfig(); const dbh = createDb(cfg.DATABASE_URL, { max: 8 }); const db = dbh.db; const ledger = new FabricLedger(cfg);
let bad = 0, checks = 0;
const report = (ok: boolean, what: string, detail?: unknown) => { checks++; if (!ok) { bad++; console.log(`  MISMATCH ${what}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 300)); } };
const section = (s: string) => console.log(`\n== ${s}`);
const ev = (ch: Channel, cc: 'lot-lifecycle' | 'pledge-lien' | 'order-settlement', fn: string, ...a: string[]) => ledger.evaluate(INDEXER_USER[ch], ch, cc, fn, a);
const same = (a: unknown, b: unknown) => canonicalJson(JSON.parse(JSON.stringify(a))) === canonicalJson(JSON.parse(JSON.stringify(b)));

const seen = { lots: new Set<string>(), deposits: new Set<string>(), enwrs: new Set<string>(), orders: new Set<string>(), runs: new Set<string>() };
let chainTxs = 0, chainValidTxs = 0, chainEvents = 0;

for (const ch of CHANNELS) {
  section(`${ch}: blocks, transactions, events`);
  const u = INDEXER_USER[ch];
  const height = await ledger.chainHeight(ch, u);
  const cp = (await db.select().from(indexerCheckpoints).where(eq(indexerCheckpoints.channel, ch)))[0];
  report(cp?.nextBlock === height, `${ch} checkpoint equals chain height`, { chain: height, checkpoint: cp?.nextBlock });
  const stored = await db.select().from(blocksView).where(eq(blocksView.channel, ch));
  report(stored.length === height, `${ch} stored block count equals chain height`, { chain: height, stored: stored.length });
  const byNum = new Map(stored.map((b) => [b.number, b]));
  const txRows = new Map((await db.select().from(txView).where(eq(txView.channel, ch))).map((t) => [t.txId, t]));
  const evRows = await db.select().from(ledgerEvents).where(eq(ledgerEvents.channel, ch));
  let expectEvents = 0, prevHash = '';
  for (let n = 0; n < height; n++) {
    const b = await ledger.getBlock(ch, n, u);
    const s = byNum.get(n);
    report(!!s && s.blockHash === b.blockHash && s.dataHash === b.dataHash && s.previousHash === b.previousHash && s.txCount === b.txs.length, `${ch} block ${n} row matches the peer`, { stored: s?.blockHash.slice(0, 12), peer: b.blockHash.slice(0, 12) });
    if (n > 0) report(b.previousHash === prevHash, `${ch} block ${n} points at the hash of block ${n - 1}`);
    prevHash = b.blockHash;
    for (const t of b.txs) {
      if (t.type !== 3) continue;
      chainTxs++; if (t.validationCode === 'VALID') chainValidTxs++;
      const r = txRows.get(t.txId);
      report(!!r && r.fn === t.fn && r.chaincode === t.chaincode && r.validationCode === t.validationCode && r.creatorMsp === t.creatorMsp && r.blockNumber === n && same(r.endorsers, [...new Set(t.endorsers)]), `${ch} tx ${t.txId.slice(0, 12)} row matches`, { row: r && [r.fn, r.validationCode, r.endorsers], peer: [t.fn, t.validationCode, t.endorsers] });
      if (t.validationCode === 'VALID') {
        const rows = expandEvents(ch, n, t); expectEvents += rows.length; chainEvents += rows.length;
        if (t.fn === 'CommissionLot') seen.lots.add(t.args[0]!);
        if (t.fn === 'RecordDeposit') seen.deposits.add(t.args[0]!);
        if (t.fn === 'MarkLien') seen.enwrs.add(t.args[1]!);
        if (t.fn === 'CreateOrder') seen.orders.add(t.args[0]!);
        if (t.fn === 'DistributePatronage') seen.runs.add(t.args[0]!);
      } else report(!evRows.some((e) => e.txId === t.txId), `${ch} invalid tx ${t.txId.slice(0, 12)} has no event row`);
    }
  }
  report(evRows.length === expectEvents, `${ch} event rows equal the VALID events on the chain (alsoEmitted expanded)`, { chain: expectEvents, stored: evRows.length });
  report(txRows.size === [...txRows.values()].filter((t) => t.channel === ch).length, `${ch} no stray transaction rows`);
  console.log(`  ${height} blocks checked`);
}
const [txTotal] = await db.select({ n: sql<number>`count(*)::int` }).from(txView);
report(txTotal!.n === chainTxs, 'transaction rows equal endorser transactions on the chain', { chain: chainTxs, stored: txTotal!.n });

section('entities against chaincode');
const lots = await db.select().from(lotsView);
report(lots.length === seen.lots.size && lots.every((l) => seen.lots.has(l.sscc)), 'lots_view has exactly the lots that were commissioned', { chain: seen.lots.size, stored: lots.length });
let n = 0; for (const l of lots) { const c = JSON.parse(await ev('trace-channel', 'lot-lifecycle', 'GetLot', l.sscc)); report(same(c, l.lot) && c.status === l.status && c.lastTxId === l.lastTxId, `lot ${l.sscc} equals chaincode`, { index: (l.lot as { status: string }).status, chain: c.status }); n++; }
console.log(`  ${n} lots compared in full`);
const deps = await db.select().from(depositsView);
report(deps.length === seen.deposits.size, 'deposits_view count', { chain: seen.deposits.size, stored: deps.length });
for (const d of deps) report(same(JSON.parse(await ev('finance-channel', 'pledge-lien', 'GetDeposit', d.depositId)), d.deposit), `deposit ${d.depositId} equals chaincode`);
const liens = await db.select().from(liensView);
report(liens.length === seen.enwrs.size, 'liens_view count', { chain: seen.enwrs.size, stored: liens.length });
for (const l of liens) report(same(JSON.parse(await ev('finance-channel', 'pledge-lien', 'GetLien', l.enwr)), l.lien) && same(JSON.parse(await ev('finance-channel', 'pledge-lien', 'GetLoan', l.loanId)), l.loan), `lien and loan of ${l.enwr} equal chaincode`);
const orders = await db.select().from(ordersView);
report(orders.length === seen.orders.size, 'orders_view count', { chain: seen.orders.size, stored: orders.length });
for (const o of orders) report(same(JSON.parse(await ev('trade-channel', 'order-settlement', 'GetOrder', o.orderId)), o.order), `order ${o.orderId} equals chaincode`);
const runs = await db.select().from(patronageView);
report(runs.length === seen.runs.size, 'patronage_view count', { chain: seen.runs.size, stored: runs.length });
for (const r of runs) report(same(JSON.parse(await ev('trace-channel', 'lot-lifecycle', 'GetPatronageRun', r.runId)), r.run), `patronage run ${r.runId} equals chaincode`);
const [mq] = await db.execute(sql`select count(*)::int as n from mirror_queue where not done`) as unknown as { n: number }[];
report(mq!.n === 0, 'no status mirror is pending');

console.log(`\nindex vs ledger: ${checks} checks, ${bad} mismatches (${chainTxs} transactions, ${chainValidTxs} valid, ${chainEvents} events, ${lots.length} lots, ${orders.length} orders, ${liens.length} liens, ${runs.length} patronage runs)`);
ledger.close(); await dbh.close();
process.exit(bad ? 1 : 0);

