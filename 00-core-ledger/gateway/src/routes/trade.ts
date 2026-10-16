import { asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Channel, Order, OrderPrice, PriceAgreementState, Proof, SalesChannel } from '../contract/contract.js';
import type { Ctx } from '../context.js';
import { HttpError, invalid, notFound } from '../errors.js';
import { ledgerEvents, lotsView, ordersView, tradePrices } from '../db/schema.js';
import { refreshLot, refreshOrder } from '../indexer/refresh.js';
import { ENDORSE } from '../fabric/topology.js';
import { nextSequence, orderId as makeOrderId } from '../services/ids.js';
import { istDate } from '../services/dates.js';
import { mirror, submit, withLock } from '../services/chain.js';
import { derivedPriceSalt, priceHash as hashOf, sha256Hex } from '../services/crypto.js';
import { fabricUserOf, nextCursor, pageParams, parse, receipted, reply, user, type EndpointId, type Handler } from './helpers.js';

const createBody = z.object({ ssccs: z.array(z.string().regex(/^\d{18}$/)).min(1).max(50), channel: z.enum(['DIRECT', 'ONDC', 'ENAM']), deliveryBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const priceBody = z.object({ pricePerQtl: z.number().positive().max(1_000_000), salt: z.string().min(16).max(128).optional() });
const qualityBody = z.object({ accepted: z.boolean(), notes: z.string().max(500).optional() });
const settleBody = z.object({ amount: z.number().int().positive(), upiRef: z.string() });

interface ChainOrder { orderId: string; channel: SalesChannel; ssccs: string[]; status: 'OPEN' | 'PRICE_AGREED' | 'DELIVERED' | 'SETTLED'; deliveryBy: string; priceHash: string; agreedAt: string; qualityOutcome: string }

export function tradeRoutes(ctx: Ctx): Partial<Record<EndpointId, Handler>> {
  async function orderBody(orderId: string): Promise<Order> {
    const row = (await ctx.db.select().from(ordersView).where(eq(ordersView.orderId, orderId)))[0];
    if (!row) throw notFound(`Order ${orderId}`);
    const o = row.order as ChainOrder;
    const lots = o.ssccs.length ? await ctx.db.select({ status: lotsView.status }).from(lotsView).where(inArray(lotsView.sscc, o.ssccs)) : [];
    // IN_TRANSIT is not a chaincode order status: it is derived from the lots' custody status (DECISIONS D13)
    const status: Order['status'] = o.status === 'PRICE_AGREED' && lots.some((l) => l.status === 'IN_TRANSIT') ? 'IN_TRANSIT' : o.status;
    const ev = await ctx.db.select({ txId: ledgerEvents.txId, blockNumber: ledgerEvents.blockNumber, channel: ledgerEvents.channel }).from(ledgerEvents).where(eq(ledgerEvents.orderId, orderId)).orderBy(asc(ledgerEvents.id));
    const proofs = ev.filter((x, i, a) => a.findIndex((y) => y.txId === x.txId) === i).map((x): Proof => ({ txId: x.txId, blockNumber: x.blockNumber, channel: x.channel as Channel }));
    return { orderId, ssccs: o.ssccs, channel: o.channel, status, ...(o.priceHash ? { priceHash: o.priceHash } : {}), deliveryBy: o.deliveryBy, proofs };
  }
  const chainOrder = async (id: string) => { const r = (await ctx.db.select().from(ordersView).where(eq(ordersView.orderId, id)))[0]; if (!r) throw notFound(`Order ${id}`); return r.order as ChainOrder; };

  return {
    async createOrder(req) {
      const u = user(req);
      const b = parse(createBody, req.body, 'order');
      const year = Number(istDate(ctx.now()).slice(0, 4));
      const id = makeOrderId(year, await nextSequence(ctx.db, `order-${year}`, 87));
      return withLock([id, ...b.ssccs], async () => {
        const { receipt } = await submit(ctx, fabricUserOf(u), 'trade-channel', 'order-settlement', 'CreateOrder', [id, JSON.stringify(b.ssccs), b.channel, b.deliveryBy], ENDORSE.trade);
        if (b.channel !== 'DIRECT') await ctx.adapters.market.register({ orderId: id, channel: b.channel });
        let pending = false;
        for (const s of b.ssccs) { const m = await mirror(ctx, 'SetListed', s, [s, id], receipt.txId); pending ||= m.pending; await refreshLot(ctx, s).catch(() => undefined); }
        await refreshOrder(ctx, id);
        return reply(receipted(receipt, await orderBody(id)), 201, pending ? { 'X-Mirror-Pending': 'SetListed' } : undefined);
      });
    },

    async listOrders(req) {
      const q = req.query as { status?: string; cursor?: string; limit?: string };
      const { limit, offset } = pageParams(q);
      const rows = await ctx.db.select({ id: ordersView.orderId }).from(ordersView).orderBy(asc(ordersView.orderId)).limit(limit + 1).offset(offset);
      let items = await Promise.all(rows.slice(0, limit).map((r) => orderBody(r.id)));
      if (q.status) items = items.filter((o) => o.status === q.status);
      return { items, nextCursor: nextCursor(offset, limit, rows.length) };
    },

    async getOrder(req) { return orderBody((req.params as { orderId: string }).orderId); },

    async agreePrice(req) {
      const u = user(req);
      const { orderId } = req.params as { orderId: string };
      const b = parse(priceBody, req.body, 'price');
      const o = await chainOrder(orderId);
      return withLock([orderId, ...o.ssccs], async () => {
        const salt = b.salt ?? derivedPriceSalt(ctx.cfg.PRICE_SALT_SECRET, orderId);
        const hash = hashOf(orderId, b.pricePerQtl, salt);
        const { receipt, result } = await submit(ctx, fabricUserOf(u), 'trade-channel', 'order-settlement', 'AgreePrice', [orderId, hash], ENDORSE.trade, { price: JSON.stringify({ pricePerQtl: b.pricePerQtl, salt }) });
        const state = result.trim() === 'AGREED' ? 'AGREED' : 'AWAITING_COUNTERPARTY';
        // gateway copy of the private record (FPO and Buyer only); the ledger holds the authoritative copy in tradePricePDC
        await ctx.db.insert(tradePrices).values({ orderId, pricePerQtl: b.pricePerQtl, salt, priceHash: hash, proposedBy: u.org, agreed: state === 'AGREED' })
          .onConflictDoUpdate({ target: tradePrices.orderId, set: { pricePerQtl: b.pricePerQtl, salt, priceHash: hash, agreed: state === 'AGREED' } });
        let pending = false;
        if (state === 'AGREED') for (const s of o.ssccs) { const m = await mirror(ctx, 'SetSold', s, [s, orderId, hash], receipt.txId); pending ||= m.pending; await refreshLot(ctx, s).catch(() => undefined); }
        await refreshOrder(ctx, orderId);
        return reply(receipted(receipt, { orderId, priceHash: hash, state } satisfies PriceAgreementState), 200, pending ? { 'X-Mirror-Pending': 'SetSold' } : undefined);
      });
    },

    async getOrderPrice(req) {
      const u = user(req);
      const { orderId } = req.params as { orderId: string };
      const o = await chainOrder(orderId);
      // read from the private data collection through the caller's own peer: the peer enforces collection membership
      const raw = await ctx.ledger.evaluate(fabricUserOf(u), 'trade-channel', 'order-settlement', 'GetOrderPrice', [orderId]);
      const p = JSON.parse(raw) as { pricePerQtl: number; salt: string };
      const lots = await ctx.db.select({ netKg: lotsView.netKg }).from(lotsView).where(inArray(lotsView.sscc, o.ssccs));
      const quantityQtl = lots.reduce((a, l) => a + l.netKg, 0) / 100;
      const ev = (await ctx.db.select().from(ledgerEvents).where(sql`${ledgerEvents.orderId} = ${orderId} and ${ledgerEvents.event} = 'PriceAgreed'`))[0];
      if (!ev) throw new HttpError('ERR_NOT_FOUND', `No agreed price for ${orderId}.`);
      return { orderId, pricePerQtl: p.pricePerQtl, salt: p.salt, priceHash: o.priceHash, quantityQtl, totalAmount: Math.round(quantityQtl * p.pricePerQtl), agreedAt: o.agreedAt, proof: { txId: ev.txId, blockNumber: ev.blockNumber, channel: ev.channel as Channel } } satisfies OrderPrice;
    },

    async acceptQuality(req) {
      const u = user(req);
      const { orderId } = req.params as { orderId: string };
      const b = parse(qualityBody, req.body, 'quality decision');
      const o = await chainOrder(orderId);
      return withLock([orderId, ...o.ssccs], async () => {
        const { receipt } = await submit(ctx, fabricUserOf(u), 'trade-channel', 'order-settlement', 'AcceptQuality', [orderId, String(b.accepted), b.notes ? sha256Hex(b.notes) : ''], ENDORSE.trade);
        let pending = false;
        for (const s of o.ssccs) { const m = await mirror(ctx, 'RecordQualityOutcome', s, [s, String(b.accepted)], receipt.txId); pending ||= m.pending; await refreshLot(ctx, s).catch(() => undefined); }
        await refreshOrder(ctx, orderId);
        return reply(receipted(receipt, await orderBody(orderId)), 200, pending ? { 'X-Mirror-Pending': 'RecordQualityOutcome' } : undefined);
      });
    },

    async settleOrder(req) {
      const u = user(req);
      const { orderId } = req.params as { orderId: string };
      const b = parse(settleBody, req.body, 'settlement');
      if (!ctx.adapters.upi.validate(b.upiRef)) throw invalid('upiRef must be 12 digits (simulated UPI reference).');
      const o = await chainOrder(orderId);
      return withLock([orderId, ...o.ssccs], async () => {
        const { receipt } = await submit(ctx, fabricUserOf(u), 'trade-channel', 'order-settlement', 'RecordSettlement', [orderId], ENDORSE.trade, { settlement: JSON.stringify({ amount: b.amount, upiRef: b.upiRef }) });
        await ctx.adapters.upi.record({ orderId, amount: b.amount, upiRef: b.upiRef });
        await ctx.db.update(tradePrices).set({ settlementAmount: b.amount, upiRef: b.upiRef }).where(eq(tradePrices.orderId, orderId));
        let pending = false;
        for (const s of o.ssccs) { const m = await mirror(ctx, 'SetSettled', s, [s], receipt.txId); pending ||= m.pending; await refreshLot(ctx, s).catch(() => undefined); }
        await refreshOrder(ctx, orderId);
        return reply(receipted(receipt, await orderBody(orderId)), 200, pending ? { 'X-Mirror-Pending': 'SetSettled' } : undefined);
      });
    },
  };
}
