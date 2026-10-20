// One-off, safe to repeat: fills blocks_view.config_txs for blocks indexed before that column existed. Blocks that hold fewer
// indexed invocations than their transaction count are read again from a peer and their configuration transactions stored.
import { and, eq, sql } from 'drizzle-orm';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/client.js';
import { blocksView } from '../src/db/schema.js';
import { FabricLedger } from '../src/fabric/client.js';
import { configTxsOf } from '../src/indexer/indexer.js';
import { userNamed } from '../src/routes/helpers.js';
import type { Channel } from '../src/contract/contract.js';

const cfg = loadConfig();
const dbh = createDb(cfg.DATABASE_URL, { max: 4 });
const ledger = new FabricLedger(cfg);
// the Regulator is not a member of trade-channel, so ask the FPO's peer there
const whoFor = (c: Channel) => userNamed(c === 'trade-channel' ? 'sujata.ceo' : 'observer.gov');
const rows = await dbh.db.execute<{ channel: string; number: number }>(sql`
  select b.channel, b.number from blocks_view b
  where b.config_txs = '[]'::jsonb and b.tx_count > (select count(*) from tx_view t where t.channel = b.channel and t.block_number = b.number)
  order by b.channel, b.number`);
let n = 0;
for (const r of rows as unknown as { channel: Channel; number: number | string }[]) {
  const num = Number(r.number);
  const blk = await ledger.getBlock(r.channel, num, whoFor(r.channel));
  await dbh.db.update(blocksView).set({ configTxs: configTxsOf(blk) }).where(and(eq(blocksView.channel, r.channel), eq(blocksView.number, num)));
  n++;
}
console.log(`config transactions stored for ${n} blocks`);
ledger.close();
await dbh.close();
