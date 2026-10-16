// Quick live check of the Fabric layer: heights, a block, a transaction with endorsers. Needs the network running.
import { FabricLedger } from '../src/fabric/client.js';
import { loadConfig } from '../src/config.js';
const cfg = loadConfig({ ...process.env, DATABASE_URL: 'x', JWT_SECRET: 'x'.repeat(32), FARMER_TOKEN_SECRET: 'x'.repeat(32), PRICE_SALT_SECRET: 'x'.repeat(32) });
const ledger = new FabricLedger(cfg);
const me = { username: 'observer.gov', msp: 'RegulatorOrgMSP' as const };
for (const ch of ['trace-channel', 'finance-channel'] as const) {
  const h = await ledger.chainHeight(ch, me);
  const b = await ledger.getBlock(ch, h - 1, me);
  console.log(ch, 'height', h, 'last block', b.number, b.blockHash.slice(0, 12), b.txs.map((t) => `${t.chaincode}.${t.fn} ${t.validationCode} endorsed by ${t.endorsers.join('+')} keys ${t.writes.slice(0, 2).join(',')}`));
  const tx = await ledger.getTransaction(ch, b.txs[0]!.txId, me);
  console.log('  tx', tx.txId.slice(0, 12), tx.creatorMsp, tx.events.map((e) => e.name));
}
console.log(await ledger.peerStatus());
ledger.close();
