// Saves a few real blocks from the running network as binary test fixtures for the decoder tests.
// Run after `make smoke`. The fixtures are committed; they contain only public ledger data (keys, hashes, events).
import { writeFileSync } from 'node:fs';
import { FabricLedger } from '../src/fabric/client.js';
import { decodeBlock } from '../src/fabric/decode.js';
import { loadConfig } from '../src/config.js';
import type { Channel } from '../src/contract/contract.js';

const cfg = loadConfig({ ...process.env, DATABASE_URL: 'x', JWT_SECRET: 'x'.repeat(32), FARMER_TOKEN_SECRET: 'x'.repeat(32), PRICE_SALT_SECRET: 'x'.repeat(32) });
const ledger = new FabricLedger(cfg);
const me = { username: 'sujata.ceo', msp: 'FpoOrgMSP' as const };
const want: Record<string, { channel: Channel; match: (b: ReturnType<typeof decodeBlock>) => boolean }> = {
  'config-genesis': { channel: 'trace-channel', match: (b) => b.number === 0 },
  'commission-lot': { channel: 'trace-channel', match: (b) => b.txs.some((t) => t.fn === 'CommissionLot' && t.validationCode === 'VALID') },
  'invalid-endorsement-policy': { channel: 'trace-channel', match: (b) => b.txs.some((t) => t.validationCode === 'ENDORSEMENT_POLICY_FAILURE') },
  'mark-lien-private-data': { channel: 'finance-channel', match: (b) => b.txs.some((t) => t.fn === 'MarkLien' && t.validationCode === 'VALID') },
  'agree-price-private-data': { channel: 'trade-channel', match: (b) => b.txs.some((t) => t.fn === 'AgreePrice' && t.events.length > 0) },
};
const found = new Set<string>();
for (const ch of ['trace-channel', 'finance-channel', 'trade-channel'] as Channel[]) {
  const h = await ledger.chainHeight(ch, me);
  for (let n = 0; n < h; n++) {
    const raw = await ledger.rawBlock(ch, n, me);
    const d = decodeBlock(raw);
    for (const [name, w] of Object.entries(want)) {
      if (w.channel === ch && !found.has(name) && w.match(d)) { writeFileSync(`test/fixtures/blocks/${name}.pb`, raw); found.add(name); if (name === 'commission-lot') writeFileSync('test/fixtures/blocks/commission-lot-next.pb', await ledger.rawBlock(ch, n + 1, me)); console.log('saved', name, ch, n, d.txs.map((t) => `${t.fn}:${t.validationCode}`).join(',')); }
    }
  }
}
const missing = Object.keys(want).filter((k) => !found.has(k));
if (missing.length) { console.error('not found:', missing); process.exitCode = 1; }
ledger.close();
