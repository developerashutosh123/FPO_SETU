import { and, eq } from 'drizzle-orm';
import type { Ctx } from '../context.js';
import { HttpError } from '../errors.js';
import { loadIdentity, publicKeyHexOfCert } from '../fabric/identities.js';
import { ENDORSE } from '../fabric/topology.js';
import { DEVICES, type DeviceId } from './devices.js';
import { serviceUser } from '../routes/helpers.js';
import { ensureMsp } from './msp.js';
import { submit } from './chain.js';
import { mirrorQueue } from '../db/schema.js';

/** Registers the two simulated devices' public keys on-chain (F3 verifies readings against them). Idempotent. */
export async function ensureDevicesRegistered(ctx: Ctx): Promise<string[]> {
  const done: string[] = [];
  for (const id of Object.keys(DEVICES) as DeviceId[]) {
    const pub = publicKeyHexOfCert(loadIdentity(ctx.cfg.walletDir, { username: id, msp: 'FpoOrgMSP' }).certPem);
    try {
      const d = JSON.parse(await ctx.ledger.evaluate(serviceUser('ceo'), 'trace-channel', 'lot-lifecycle', 'GetDevice', [id])) as { pubKeyHex: string };
      if (d.pubKeyHex === pub) continue;
    } catch (e) { if (!(e instanceof HttpError) || e.code !== 'ERR_NOT_FOUND') throw e; }
    await submit(ctx, serviceUser('ceo'), 'trace-channel', 'lot-lifecycle', 'RegisterDevice', [id, pub, DEVICES[id].kind], ENDORSE.trace);
    done.push(id);
  }
  return done;
}

export async function pendingMirrors(ctx: Ctx): Promise<number> {
  const rows = await ctx.db.select({ id: mirrorQueue.id }).from(mirrorQueue).where(and(eq(mirrorQueue.done, false)));
  return rows.length;
}

export { ensureMsp };
