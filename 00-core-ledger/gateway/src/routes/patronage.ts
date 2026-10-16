import { asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Channel, Deduction, Grade, PatronageLine, PatronagePreview, PatronageRun, Proof, StatementLine } from '../contract/contract.js';
import type { Ctx } from '../context.js';
import { HttpError, notFound } from '../errors.js';
import { farmers, ledgerEvents, lotsView, ordersView, patronageView, telemetry, tradePrices } from '../db/schema.js';
import { refreshLot, refreshPatronage } from '../indexer/refresh.js';
import { ENDORSE } from '../fabric/topology.js';
import { runId as makeRunId, nextSequence } from '../services/ids.js';
import { istDate } from '../services/dates.js';
import { submit, withLock } from '../services/chain.js';
import { computeDeductions, type Rates } from '../services/rates.js';
import type { ChainLot } from '../services/passport.js';
import { nextCursor, pageParams, parse, receipted, reply, serviceUser, user, type EndpointId, type Handler } from './helpers.js';

const orderBody = z.object({ orderId: z.string().regex(/^ORD-\d{4}-\d{5}$/) });
const sumDed = (d: Deduction[]) => d.reduce((a, x) => a + x.amount, 0);

export function patronageRoutes(ctx: Ctx, rates: Rates): Partial<Record<EndpointId, Handler>> {
  /**
   * One line per lot of the order: gross = delivered kg / 100 x agreed price (rounded to the rupee), deductions from config/rates.json,
   * net = gross - deductions. The settlement amount used for F7 is the sum of the lines' gross, so the vector reconciles exactly
   * (sum(net) + sum(all deductions) = settlement amount), the rule chaincode enforces within INR 1.
   */
  async function lines(orderId: string, needSettled: boolean): Promise<(PatronageLine & { token: string })[]> {
    const o = (await ctx.db.select().from(ordersView).where(eq(ordersView.orderId, orderId)))[0];
    if (!o) throw notFound(`Order ${orderId}`);
    const order = o.order as { ssccs: string[]; status: string };
    if (needSettled ? order.status !== 'SETTLED' : !['PRICE_AGREED', 'DELIVERED', 'SETTLED'].includes(order.status)) throw new HttpError('ERR_INVALID_STATE', `Order ${orderId} is ${order.status}; ${needSettled ? 'patronage runs after settlement' : 'a price must be agreed first'}.`);
    const price = (await ctx.db.select().from(tradePrices).where(eq(tradePrices.orderId, orderId)))[0];
    if (!price?.agreed) throw new HttpError('ERR_INVALID_STATE', `The agreed price of ${orderId} is not available on this gateway.`);
    const out: (PatronageLine & { token: string })[] = [];
    for (const sscc of order.ssccs) {
      const lot = (await ctx.db.select().from(lotsView).where(eq(lotsView.sscc, sscc)))[0]!.lot as ChainLot;
      const f = (await ctx.db.select().from(farmers).where(eq(farmers.token, lot.farmerToken)))[0];
      const gross = Math.round((lot.netKg / 100) * price.pricePerQtl);
      const deductions = computeDeductions(rates, { kg: lot.netKg, gross });
      out.push({ token: lot.farmerToken, farmerToken: lot.farmerToken, name: f?.name ?? '', sscc, kg: lot.netKg, gross, deductions, net: gross - sumDed(deductions) });
    }
    return out;
  }
  const totalsOf = (ls: PatronageLine[]) => ({
    gross: ls.reduce((a, l) => a + l.gross, 0), deductions: ls.reduce((a, l) => a + sumDed(l.deductions), 0),
    fpoMargin: ls.reduce((a, l) => a + l.deductions.filter((d) => d.type === 'FPO_MARGIN').reduce((b, d) => b + d.amount, 0), 0), net: ls.reduce((a, l) => a + l.net, 0),
  });
  const runBody = (r: { runId: string; orderId: string; settlementAmount: number; fpoMargin: number; lines: PatronageLine[]; distributedAt: string }, proofs: Proof[]): PatronageRun => {
    const t = totalsOf(r.lines);
    return { runId: r.runId, orderId: r.orderId, memberCount: r.lines.length, settlementAmount: r.settlementAmount, totals: { gross: t.gross, deductions: t.deductions, fpoMargin: r.fpoMargin, net: t.net }, distributedAt: r.distributedAt, proofs };
  };
  const proofsOfRun = async (orderId: string, runId: string): Promise<Proof[]> => {
    const ev = await ctx.db.select({ txId: ledgerEvents.txId, blockNumber: ledgerEvents.blockNumber, channel: ledgerEvents.channel }).from(ledgerEvents).where(sql`${ledgerEvents.payload}->'refs'->>'runId' = ${runId} and ${ledgerEvents.event} = 'PatronageDistributed'`);
    return ev.map((x) => ({ txId: x.txId, blockNumber: x.blockNumber, channel: x.channel as Channel }));
  };

  return {
    async patronagePreview(req) {
      const b = parse(orderBody, req.body, 'preview');
      const ls = await lines(b.orderId, false);
      const t = totalsOf(ls);
      return { orderId: b.orderId, settlementAmount: t.gross, lines: ls.map(({ token: _t, ...l }) => l), totals: t, reconciles: t.net + t.deductions === t.gross } satisfies PatronagePreview;
    },

    async patronageRun(req) {
      const b = parse(orderBody, req.body, 'patronage run');
      const o = (await ctx.db.select().from(ordersView).where(eq(ordersView.orderId, b.orderId)))[0];
      if (!o) throw notFound(`Order ${b.orderId}`);
      const ssccs = (o.order as { ssccs: string[] }).ssccs;
      return withLock([b.orderId, ...ssccs], async () => {
        const ls = await lines(b.orderId, true);
        const t = totalsOf(ls);
        const d = istDate(ctx.now());
        const id = makeRunId(Number(d.slice(0, 4)), Number(d.slice(5, 7)), await nextSequence(ctx.db, `run-${d.slice(0, 7)}`, 1));
        const wire = ls.map((l) => ({ farmerToken: l.farmerToken, sscc: l.sscc, kg: l.kg, gross: l.gross, deductions: l.deductions, net: l.net })); // no names on-chain
        const { receipt } = await submit(ctx, serviceUser('ceo'), 'trace-channel', 'lot-lifecycle', 'DistributePatronage', [id, b.orderId, String(t.gross), JSON.stringify(wire)], ENDORSE.trace);
        await refreshPatronage(ctx, id);
        for (const s of ssccs) await refreshLot(ctx, s).catch(() => undefined);
        const run = (await ctx.db.select().from(patronageView).where(eq(patronageView.runId, id)))[0]!;
        const proofs = await proofsOfRun(b.orderId, id);
        if (!proofs.some((p) => p.txId === receipt.txId)) proofs.push({ txId: receipt.txId, blockNumber: receipt.blockNumber, channel: receipt.channel });
        return reply(receipted(receipt, runBody(run.run as never, proofs)), 201);
      });
    },

    async listPatronageRuns(req) {
      const q = req.query as { cursor?: string; limit?: string };
      const { limit, offset } = pageParams(q);
      const rows = await ctx.db.select().from(patronageView).orderBy(desc(patronageView.distributedAt)).limit(limit + 1).offset(offset);
      const items = await Promise.all(rows.slice(0, limit).map(async (r) => runBody(r.run as never, await proofsOfRun(r.orderId, r.runId))));
      return { items, nextCursor: nextCursor(offset, limit, rows.length) };
    },

    async myStatements(req) {
      const u = user(req);
      const f = (await ctx.db.select().from(farmers).where(eq(farmers.id, u.id)))[0];
      if (!f) throw notFound('Member');
      const runs = await ctx.db.select().from(patronageView).orderBy(asc(patronageView.distributedAt));
      const items: StatementLine[] = [];
      for (const r of runs) {
        const run = r.run as { orderId: string; lines: PatronageLine[]; distributedAt: string };
        for (const l of run.lines.filter((x) => x.farmerToken === f.token)) {
          const lot = (await ctx.db.select().from(lotsView).where(eq(lotsView.sscc, l.sscc)))[0];
          const price = (await ctx.db.select().from(tradePrices).where(eq(tradePrices.orderId, run.orderId)))[0];
          const ev = await ctx.db.select({ txId: ledgerEvents.txId, blockNumber: ledgerEvents.blockNumber, channel: ledgerEvents.channel, event: ledgerEvents.event }).from(ledgerEvents)
            .where(sql`(${ledgerEvents.sscc} = ${l.sscc} and ${ledgerEvents.event} = 'LotCommissioned') or (${ledgerEvents.orderId} = ${run.orderId} and ${ledgerEvents.event} in ('PriceAgreed','SettlementExecuted','PatronageDistributed'))`).orderBy(asc(ledgerEvents.id));
          items.push({
            sscc: l.sscc, humanRef: lot?.humanRef ?? '', kg: l.kg, grade: (lot?.grade ?? 'A') as Grade, buyerType: 'Processor and organised retail (Kolkata)', gross: l.gross, deductions: l.deductions, net: l.net,
            ...(price?.upiRef ? { upiRef: price.upiRef } : {}), paidOn: istDate(new Date(run.distributedAt)),
            proofs: ev.map((x) => ({ txId: x.txId, blockNumber: x.blockNumber, channel: x.channel as Channel })),
          });
        }
      }
      await ctx.db.insert(telemetry).values({ kind: 'MemberStatementViewed', subject: f.token, detail: { lines: items.length } });
      const { limit, offset } = pageParams(req.query as Record<string, unknown>);
      return { items: items.slice(offset, offset + limit), nextCursor: items.length > offset + limit ? String(offset + limit) : undefined };
    },
  };
}
