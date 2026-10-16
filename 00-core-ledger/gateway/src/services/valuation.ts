// Collateral valuation: assessedValue = quantityQtl x modal price x (1 - haircut), eligibleLoan = 70% of that.
// The modal price is a REAL AGMARKNET price from the index, or the paddy MSP. If neither exists the collateral is shown with no basis and no value.
import { and, desc, eq, lte, sql } from 'drizzle-orm';
import type { Collateral, Commodity } from '../contract/contract.js';
import type { Ctx } from '../context.js';
import { mspEntries, priceSeries } from '../db/schema.js';
import type { Rates } from './rates.js';

const AGMARKNET_NAME: Partial<Record<Commodity, string>> = { POTATO: 'Potato', BRINJAL: 'Brinjal', CAULIFLOWER: 'Cauliflower' };

export async function priceBasis(ctx: Ctx, commodity: Commodity, today: string): Promise<Collateral['priceBasis'] | undefined> {
  if (commodity === 'PADDY') {
    const e = (await ctx.db.select().from(mspEntries).where(and(eq(mspEntries.crop, 'paddy'), eq(mspEntries.grade, 'COMMON'), lte(mspEntries.announcedOn, today))).orderBy(desc(mspEntries.announcedOn)).limit(1))[0];
    return e ? { source: `MSP ${e.season}, common paddy (${e.source})`, market: 'All-India MSP', date: e.announcedOn, modalPerQtl: e.pricePerQtl } : undefined;
  }
  const name = AGMARKNET_NAME[commodity];
  if (!name) return undefined;
  const r = (await ctx.db.select().from(priceSeries).where(and(eq(priceSeries.commodity, name), lte(priceSeries.date, today), sql`lower(replace(${priceSeries.market}, ' ', '')) like 'medinipur(west)%'`)).orderBy(desc(priceSeries.date)).limit(1))[0];
  return r ? { source: `AGMARKNET (${r.source})`, market: r.market, date: r.date, modalPerQtl: r.modalPrice } : undefined;
}

export const haircutOf = (rates: Rates, commodity: Commodity) => rates.haircutPct[commodity].value;

export function assess(rates: Rates, commodity: Commodity, quantityQtl: number, basis: Collateral['priceBasis'] | undefined) {
  const haircutPct = haircutOf(rates, commodity);
  const assessedValue = basis ? Math.round(quantityQtl * basis.modalPerQtl * (1 - haircutPct / 100)) : 0;
  return { haircutPct, assessedValue, eligibleLoan: Math.round(assessedValue * (rates.ltvPct.value / 100)) };
}
