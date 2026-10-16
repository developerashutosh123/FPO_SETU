import { asc, desc, eq, sql } from 'drizzle-orm';
import type { AttestorReputation, AuditItem, AuditSample, KpisResponse, MspResponse, PricePoint, VillageCode } from '../contract/contract.js';
import type { Ctx } from '../context.js';
import { invalid } from '../errors.js';
import { audits, lotsView, mspEntries } from '../db/schema.js';
import { computeKpis } from '../services/kpis.js';
import { istDate } from '../services/dates.js';
import { pageParams, type EndpointId, type Handler } from './helpers.js';

export function analyticsRoutes(ctx: Ctx): Partial<Record<EndpointId, Handler>> {
  return {
    async kpis() { return (await computeKpis(ctx)) satisfies KpisResponse; },

    async prices(req) {
      const q = req.query as { commodity?: string; market?: string; from?: string; to?: string; cursor?: string; limit?: string };
      for (const d of [q.from, q.to]) if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw invalid('from and to are dates like 2026-11-14.');
      const rows = await ctx.adapters.agmarknet.series(q);
      const { limit, offset } = pageParams(q);
      const items: PricePoint[] = rows.slice(offset, offset + limit).map((r) => ({ date: r.date, market: r.market, commodity: r.commodity, min: r.minPrice, max: r.maxPrice, modal: r.modalPrice, source: r.source }));
      return { items, nextCursor: rows.length > offset + limit ? String(offset + limit) : undefined };
    },

    async pricesMsp(req) {
      const crop = String((req.query as { crop?: string }).crop ?? 'paddy');
      if (crop !== 'paddy') throw invalid('Only crop=paddy has an MSP in this prototype.');
      const rows = await ctx.db.select().from(mspEntries).where(eq(mspEntries.crop, 'paddy')).orderBy(asc(mspEntries.announcedOn), asc(mspEntries.grade));
      return { crop: 'paddy', items: rows.map((r) => ({ crop: 'paddy' as const, season: r.season, grade: r.grade as 'COMMON' | 'GRADE_A', pricePerQtl: r.pricePerQtl, announcedOn: r.announcedOn, source: r.source, ...(r.sourceUrl ? { sourceUrl: r.sourceUrl } : {}) })) } satisfies MspResponse;
    },

    async auditSample() {
      const rows = await ctx.db.select({ a: audits, humanRef: lotsView.humanRef, village: lotsView.village }).from(audits).innerJoin(lotsView, eq(lotsView.sscc, audits.sscc)).orderBy(desc(audits.drawnOn), asc(audits.sscc));
      const items: AuditItem[] = rows.map(({ a, humanRef, village }) => ({ sscc: a.sscc, humanRef, village: village as VillageCode, status: a.status as AuditItem['status'], ...(a.auditedOn ? { auditedOn: a.auditedOn } : {}), ...(a.note ? { note: a.note } : {}) }));
      const audited = items.filter((i) => i.status !== 'PENDING').length, divergent = items.filter((i) => i.status === 'DIVERGENT').length;
      return { drawnOn: rows[0]?.a.drawnOn ?? istDate(ctx.now()), sampleRatePct: 5, items, audited, divergent, divergenceRatePct: audited ? Math.round((divergent / audited) * 1000) / 10 : null } satisfies AuditSample;
    },

    async attestorReputation() {
      const rows = (await ctx.db.execute(sql`
        select d.deposit->>'facilityName' as attestor, d.deposit->>'facility' as facility,
               count(*) filter (where a.status <> 'PENDING')::int as audited, count(*) filter (where a.status = 'DIVERGENT')::int as divergent
        from audits a join deposits_view d on d.sscc = a.sscc group by 1, 2`)) as unknown as { attestor: string; facility: string; audited: number; divergent: number }[];
      // an attestor with no completed re-inspection has no score: showing one would be a made-up statistic
      return rows.filter((r) => r.audited > 0).map((r): AttestorReputation => ({ attestor: r.attestor, kind: 'FACILITY', score: Math.round((100 * (r.audited - r.divergent)) / r.audited), attestations: r.audited, divergences: r.divergent }));
    },
  };
}
