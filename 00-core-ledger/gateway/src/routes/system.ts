import { eq, or } from 'drizzle-orm';
import { z } from 'zod';
import { CONTRACT_VERSION, type BlockDetail, type BlockSummary, type Channel, type HealthResponse, type LedgerStatus, type LoginResponse, type OrgMsp, type PublicConfig, type SearchHit, type SessionUser, type TxDetail, type Village } from '../contract/contract.js';
import villages from '../contract/villages.json' with { type: 'json' };
import type { Ctx } from '../context.js';
import { HttpError, invalid, notFound } from '../errors.js';
import { PERSONAS, personaByUsername, sessionUserOf } from '../auth/personas.js';
import { signSession } from '../auth/jwt.js';
import { farmers, liensView, lotsView, ordersView, depositsView } from '../db/schema.js';
import type { DecodedBlock, DecodedTx } from '../fabric/decode.js';
import { CHANNEL_MEMBERS, CHANNELS } from '../fabric/topology.js';
import { parse, type EndpointId, type Handler, userNamed } from './helpers.js';
import { safeEqual } from '../services/crypto.js';

const loginBody = z.object({ username: z.string().min(1), password: z.string().min(1), portal: z.enum(['farmer', 'fpo', 'bank', 'buyer', 'consumer', 'gov']) });
const otpReq = z.object({ phone: z.string().regex(/^\d{10}$/, 'must be 10 digits') });
const otpVerify = z.object({ phone: z.string().regex(/^\d{10}$/), otp: z.string().min(4).max(8) });

/** Any signed-in user of the org can read the public ledger through that org's peer; these are the read-only explorer identities. */
const EXPLORER_USER: Record<OrgMsp, string> = { FpoOrgMSP: 'sujata.ceo', BankOrgMSP: 'arindam.bank', BuyerOrgMSP: 'rahul.buyer', RegulatorOrgMSP: 'observer.gov' };
const explorerFor = (channel: Channel) => userNamed(EXPLORER_USER[CHANNEL_MEMBERS[channel].includes('RegulatorOrgMSP') ? 'RegulatorOrgMSP' : 'FpoOrgMSP']);

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new HttpError('ERR_LEDGER_UNAVAILABLE', 'The ledger did not answer in time.')), ms))]);

/** Composite keys contain NUL separators: show them as ~ so they are readable and safe in JSON. */
const printable = (k: string) => k.replace(/\u0000/g, '~').replace(/^~+|~+$/g, '');

function txDetail(tx: DecodedTx, block: DecodedBlock): TxDetail {
  return {
    txId: tx.txId, channel: tx.channel as Channel, chaincode: tx.chaincode, fn: tx.fn, blockNumber: block.number, blockHash: block.blockHash, validationCode: tx.validationCode,
    timestamp: tx.timestamp, creatorMsp: tx.creatorMsp as OrgMsp, endorsers: [...new Set(tx.endorsers)] as OrgMsp[],
    rwset: { reads: [...new Set(tx.reads)].map(printable), writes: [...new Set(tx.writes)].map(printable) },
  };
}
const summary = (channel: Channel, b: DecodedBlock): BlockSummary => ({ channel, number: b.number, dataHash: b.dataHash, previousHash: b.previousHash, txCount: b.txs.length, time: b.time });

export async function memberLogin(ctx: Ctx, phone: string): Promise<SessionUser | undefined> {
  const f = (await ctx.db.select().from(farmers).where(eq(farmers.phone, phone)))[0];
  if (!f || f.erased) return undefined;
  const persona = PERSONAS.find((p) => p.phone === phone);
  return { id: f.id, username: persona?.username ?? `member.${f.token.slice(3, 11)}`, role: 'member', org: 'FpoOrgMSP', displayName: f.name || 'Member', portal: 'farmer' };
}

export function systemRoutes(ctx: Ctx): Partial<Record<EndpointId, Handler>> {
  let healthCache: { at: number; body: HealthResponse } | undefined;

  async function heights(): Promise<Partial<Record<Channel, { height: number }>>> {
    const out: Partial<Record<Channel, { height: number }>> = {};
    const results = await Promise.allSettled(CHANNELS.map((c) => withTimeout(ctx.ledger.chainHeight(c, explorerFor(c)), 2000)));
    results.forEach((r, i) => { if (r.status === 'fulfilled') out[CHANNELS[i]!] = { height: r.value }; });
    return out;
  }

  async function raftLeaders(): Promise<{ name: string; up: boolean; leaderOf: Channel[] }[]> {
    const out: { name: string; up: boolean; leaderOf: Channel[] }[] = [];
    for (const part of ctx.cfg.ORDERER_OPS.split(',').map((s) => s.trim()).filter(Boolean)) {
      const [name, url] = part.split('=');
      if (!name || !url) continue;
      try {
        const res = await fetch(`${url}/metrics`, { signal: AbortSignal.timeout(1500) });
        const text = await res.text();
        const leaderOf = [...text.matchAll(/^consensus_etcdraft_is_leader\{channel="([^"]+)"\}\s+1/gm)].map((m) => m[1] as Channel);
        out.push({ name, up: res.ok, leaderOf });
      } catch { out.push({ name, up: false, leaderOf: [] }); }
    }
    return out;
  }

  async function findTx(txId: string): Promise<{ tx: DecodedTx; block: DecodedBlock }> {
    for (const c of CHANNELS) {
      try {
        const block = await ctx.ledger.getBlockByTxId(c, txId, explorerFor(c));
        const tx = block.txs.find((t) => t.txId === txId);
        if (tx) return { tx, block };
      } catch (e) { if (!(e instanceof HttpError) || e.code !== 'ERR_NOT_FOUND') throw e; }
    }
    throw notFound(`Transaction ${txId}`);
  }

  return {
    async login(req) {
      const b = parse(loginBody, req.body, 'login');
      const p = personaByUsername(b.username);
      if (!p || !safeEqual(b.password, ctx.cfg.DEMO_PASSWORD)) throw new HttpError('ERR_UNAUTHENTICATED', 'Wrong username or password. The demo password is shown in the portal footer notes.');
      if (!p.portals.includes(b.portal)) throw new HttpError('ERR_FORBIDDEN_ROLE', `${p.displayName} cannot sign in to the ${b.portal} portal.`);
      let u = sessionUserOf(p, b.portal);
      if (p.phone) { const m = await memberLogin(ctx, p.phone); if (m) u = { ...m, username: p.username, portal: b.portal }; }
      return { token: await signSession(ctx.cfg.JWT_SECRET, u), user: u } satisfies LoginResponse;
    },
    async otpRequest(req) {
      const b = parse(otpReq, req.body, 'OTP request');
      if (!(await memberLogin(ctx, b.phone))) throw notFound('A member with this phone number');
      return { sent: true as const, demoOtp: ctx.cfg.DEMO_OTP };
    },
    async otpVerify(req) {
      const b = parse(otpVerify, req.body, 'OTP');
      const u = await memberLogin(ctx, b.phone);
      if (!u || !safeEqual(b.otp, ctx.cfg.DEMO_OTP)) throw new HttpError('ERR_UNAUTHENTICATED', 'Wrong OTP. The demo OTP is shown on screen.');
      return { token: await signSession(ctx.cfg.JWT_SECRET, u), user: u } satisfies LoginResponse;
    },
    async health() {
      if (healthCache && Date.now() - healthCache.at < 1000) return healthCache.body;
      const channels = await heights();
      const ok = CHANNELS.every((c) => channels[c]);
      const body: HealthResponse = { ok, ledgerMode: 'live', contractVersion: CONTRACT_VERSION, channels };
      if (!ok) throw new HttpError('ERR_LEDGER_UNAVAILABLE', `The ledger is not fully reachable (${Object.keys(channels).length} of ${CHANNELS.length} channels answered).`, { details: body });
      healthCache = { at: Date.now(), body };
      return body;
    },
    async configPublic() {
      const c = ctx.cfg;
      return { portalUrls: { farmerWeb: c.URL_FARMER_WEB, fpo: c.URL_FPO, bank: c.URL_BANK, buyer: c.URL_BUYER, consumer: c.URL_CONSUMER, gov: c.URL_GOV }, contractVersion: CONTRACT_VERSION, adapterModes: ctx.adapters.modes() } satisfies PublicConfig;
    },
    async villages() { return villages as Village[]; },

    // ---- ledger explorer (public, read-only)
    async ledgerStatus() {
      const orgs: OrgMsp[] = ['FpoOrgMSP', 'BankOrgMSP', 'BuyerOrgMSP', 'RegulatorOrgMSP'];
      const peers = await ctx.ledger.peerStatus();
      const rows = await Promise.all(orgs.map(async (org) => {
        const hs: Partial<Record<Channel, number>> = {};
        await Promise.all(CHANNELS.filter((c) => CHANNEL_MEMBERS[c].includes(org)).map(async (c) => { try { hs[c] = await withTimeout(ctx.ledger.chainHeight(c, userNamed(EXPLORER_USER[org])), 2000); } catch { /* peer down: no height */ } }));
        const p = peers.find((x) => x.org === org);
        return { name: p?.name ?? `peer0.${org}`, org, up: !!p?.up && Object.keys(hs).length > 0, heights: hs };
      }));
      const leaders = await raftLeaders();
      const channelHeights = await heights();
      return {
        mode: 'live', peers: rows,
        orderers: leaders.map((o) => ({ name: o.name, up: o.up, raftLeader: o.leaderOf.includes('trace-channel'), leaderOf: o.leaderOf })),
        channels: CHANNELS.map((c) => ({ name: c, height: channelHeights[c]?.height ?? 0, members: CHANNEL_MEMBERS[c] })),
      } satisfies LedgerStatus;
    },
    async ledgerBlocks(req) {
      const q = req.query as { channel?: string; limit?: string };
      const limit = Math.min(Math.max(Number(q.limit ?? 10) || 10, 1), 50);
      const chans = q.channel ? (CHANNELS.includes(q.channel as Channel) ? [q.channel as Channel] : (() => { throw invalid(`Unknown channel ${q.channel}.`); })()) : CHANNELS;
      const all: BlockSummary[] = [];
      for (const c of chans) {
        const h = await ctx.ledger.chainHeight(c, explorerFor(c));
        for (let n = h - 1; n >= Math.max(0, h - limit); n--) all.push(summary(c, await ctx.ledger.getBlock(c, n, explorerFor(c))));
      }
      return all.sort((a, b) => b.time.localeCompare(a.time) || b.number - a.number).slice(0, limit);
    },
    async ledgerBlock(req) {
      const { channel, number } = req.params as { channel: string; number: string };
      if (!CHANNELS.includes(channel as Channel) || !/^\d+$/.test(number)) throw invalid('Use a channel name and a block number.');
      const b = await ctx.ledger.getBlock(channel as Channel, Number(number), explorerFor(channel as Channel));
      return { ...summary(channel as Channel, b), txs: b.txs.map((t) => ({ txId: t.txId, chaincode: t.chaincode, fn: t.fn, validationCode: t.validationCode, creatorMsp: t.creatorMsp as OrgMsp, timestamp: t.timestamp })) } satisfies BlockDetail;
    },
    async ledgerTx(req) {
      const { txId } = req.params as { txId: string };
      if (!/^[0-9a-f]{64}$/.test(txId)) throw invalid('A transaction ID is 64 hex characters.');
      const { tx, block } = await findTx(txId);
      return txDetail(tx, block);
    },
    async ledgerSearch(req) {
      const q = String((req.query as { q?: string }).q ?? '').trim();
      if (!q) return [];
      const hits: SearchHit[] = [];
      if (/^[0-9a-f]{64}$/.test(q)) { try { const { tx } = await findTx(q); hits.push({ kind: 'tx', id: q, channel: tx.channel as Channel, label: `${tx.fn} on ${tx.channel}` }); } catch { /* none */ } }
      if (/^\d{18}$/.test(q)) { const r = await ctx.db.select({ sscc: lotsView.sscc, humanRef: lotsView.humanRef }).from(lotsView).where(eq(lotsView.sscc, q)); r.forEach((x) => hits.push({ kind: 'lot', id: x.sscc, label: x.humanRef, channel: 'trace-channel' })); }
      if (/^WB-PSM-/.test(q)) { const r = await ctx.db.select({ sscc: lotsView.sscc, humanRef: lotsView.humanRef }).from(lotsView).where(eq(lotsView.humanRef, q)); r.forEach((x) => hits.push({ kind: 'lot', id: x.sscc, label: x.humanRef, channel: 'trace-channel' })); }
      if (/^ENWR-/.test(q)) { const r = await ctx.db.select({ enwr: liensView.enwr }).from(liensView).where(eq(liensView.enwr, q)); const d = await ctx.db.select({ id: depositsView.depositId }).from(depositsView).where(or(eq(depositsView.depositId, q))); if (r.length || d.length) hits.push({ kind: 'enwr', id: q, label: `e-NWR ${q}`, channel: 'finance-channel' }); }
      if (/^ORD-/.test(q)) { const r = await ctx.db.select({ id: ordersView.orderId }).from(ordersView).where(eq(ordersView.orderId, q)); if (r.length) hits.push({ kind: 'order', id: q, label: `Order ${q}`, channel: 'trade-channel' }); }
      return hits;
    },
  };
}
