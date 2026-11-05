import type { Proof, TxDetail } from '../contract/contract';
import { api } from './api';

/** A committed transaction never changes, so each is fetched once per page load. */
const cache = new Map<string, Promise<TxDetail | null>>();
export function getTx(txId: string): Promise<TxDetail | null> {
  let p = cache.get(txId);
  if (!p) {
    p = api.tx(txId).catch(() => { cache.delete(txId); return null; });
    cache.set(txId, p);
  }
  return p;
}
/** Fetches many with at most `limit` in flight. Missing ones are simply absent from the map. */
export async function getTxs(proofs: Proof[], limit = 6): Promise<Map<string, TxDetail>> {
  const out = new Map<string, TxDetail>();
  const queue = [...new Set(proofs.map((p) => p.txId))];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      const tx = await getTx(id);
      if (tx) out.set(id, tx);
    }
  }));
  return out;
}
