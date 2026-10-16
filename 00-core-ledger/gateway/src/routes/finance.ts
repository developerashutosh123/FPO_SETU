import { randomBytes } from 'node:crypto';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Collateral, Deposit, EnwrIssued, FacilityType, Loan, LotStatus, Proof, VillageCode, Channel, OrgMsp } from '../contract/contract.js';
import type { Ctx } from '../context.js';
import { HttpError, invalid, notFound } from '../errors.js';
import { depositsView, ledgerEvents, liensView, loanTerms } from '../db/schema.js';
import { refreshDeposit, refreshLien, refreshLot } from '../indexer/refresh.js';
import { ENDORSE } from '../fabric/topology.js';
import { depositId, lienIdOfLoan, nextSequence } from '../services/ids.js';
import { istDate } from '../services/dates.js';
import { drainMirrorQueue, mirror, submit, withLock } from '../services/chain.js';
import { loadChainLot, type ChainLot } from '../services/passport.js';
import { assess, priceBasis } from '../services/valuation.js';
import type { Rates } from '../services/rates.js';
import { fabricUserOf, nextCursor, pageParams, parse, receipted, reply, user, type EndpointId, type Handler } from './helpers.js';

const depositBody = z.object({ sscc: z.string().regex(/^\d{18}$/), facility: z.enum(['COLD_STORAGE', 'WAREHOUSE']), facilityName: z.string().min(2).max(120), bags: z.number().int().positive(), depositedAt: z.string().min(8) });
const lienBody = z.object({ loanId: z.string().regex(/^LN-\d{4}-\d{5}$/, 'must look like LN-2026-00041'), amount: z.number().int().positive(), tenureDays: z.number().int().min(1).max(720), ratePct: z.number().min(0).max(60) });
const repayBody = z.object({ amount: z.number().int().positive() });

interface DepositRow { depositId: string; sscc: string; facility: FacilityType; facilityName: string; bags: number; depositedAt: string; enwr?: string; repository?: 'NERL' | 'CCRL'; txId: string }
interface LienRow { lienId: string; enwr: string; sscc: string; loanId: string; bank: OrgMsp; active: boolean; txId: string }
interface ChainLoan { loanId: string; enwr: string; sscc: string; lienId: string; status: Loan['status'] | 'SANCTIONED' }

export function financeRoutes(ctx: Ctx, rates: Rates): Partial<Record<EndpointId, Handler>> {
  const today = () => istDate(ctx.now());

  async function proofOfTx(txId: string): Promise<Proof | undefined> {
    const e = (await ctx.db.select({ txId: ledgerEvents.txId, blockNumber: ledgerEvents.blockNumber, channel: ledgerEvents.channel }).from(ledgerEvents).where(eq(ledgerEvents.txId, txId)).limit(1))[0];
    return e ? { txId: e.txId, blockNumber: e.blockNumber, channel: e.channel as Channel } : undefined;
  }
  async function depositBodyOf(d: DepositRow): Promise<Deposit> {
    const proof = await proofOfTx(d.txId);
    return { depositId: d.depositId, sscc: d.sscc, facility: d.facility, facilityName: d.facilityName, bags: d.bags, depositedAt: d.depositedAt, ...(d.enwr ? { enwr: d.enwr, repository: d.repository } : {}), ...(proof ? { proof } : {}) };
  }

  async function reputationFor(attestors: string[]) {
    const rows = await ctx.db.execute<{ attestor: string; audited: number; divergent: number }>(sql`
      select d.deposit->>'facilityName' as attestor,
             count(*) filter (where a.status <> 'PENDING')::int as audited, count(*) filter (where a.status = 'DIVERGENT')::int as divergent
      from audits a join deposits_view d on d.sscc = a.sscc group by 1`);
    return (rows as unknown as { attestor: string; audited: number; divergent: number }[]).filter((r) => attestors.includes(r.attestor) && r.audited > 0)
      .map((r) => ({ attestor: r.attestor, score: Math.round(100 * (r.audited - r.divergent) / r.audited) }));
  }

  async function collateralOf(d: DepositRow, lot: ChainLot): Promise<Collateral> {
    const basis = await priceBasis(ctx, lot.commodity, today());
    const qtl = lot.netKg / 100;
    const a = assess(rates, lot.commodity, qtl, basis);
    const lienRow = (await ctx.db.select().from(liensView).where(eq(liensView.enwr, d.enwr!)))[0];
    const lien = lienRow?.lien as LienRow | undefined;
    const lienProof = lien ? await proofOfTx(lien.txId) : undefined;
    const cgs = ctx.adapters.ncgtc.eligibility({ commodity: lot.commodity, facility: d.facility, repository: d.repository!, loanAmount: a.eligibleLoan });
    return {
      lot: { sscc: lot.sscc, humanRef: lot.humanRef, commodity: lot.commodity, grade: (lot.grade || undefined) as Collateral['lot']['grade'], village: lot.village as VillageCode, status: lot.status as LotStatus },
      enwr: d.enwr!, repository: d.repository!, facilityName: d.facilityName, quantityQtl: qtl, assessedValue: a.assessedValue,
      priceBasis: basis ?? { source: 'No price available: no AGMARKNET row or MSP is loaded for this commodity', market: '', date: '', modalPerQtl: 0 },
      haircutPct: a.haircutPct, ltvPct: 70, eligibleLoan: a.eligibleLoan,
      lien: !lien ? { status: 'NONE' } : lien.active ? { status: 'ACTIVE', lienId: lien.lienId, bank: lien.bank, ...(lienProof ? { proof: lienProof } : {}) } : { status: 'RELEASED', lienId: lien.lienId, bank: lien.bank },
      storageConditionHistory: [{ at: d.depositedAt, note: `Deposit recorded at ${d.facilityName}` }, ...lot.digests.map((g) => ({ at: g.at, avgC: g.avgC, note: `Cold-chain digest, ${g.breaches} breach(es), hash anchored` }))],
      attestorReputation: await reputationFor([d.facilityName]),
      cgsNpfEligible: cgs.eligible, cgsNpfReason: cgs.reason,
    };
  }

  async function loanOf(l: ChainLoan, withTerms: boolean): Promise<Loan> {
    const terms = (await ctx.db.select().from(loanTerms).where(eq(loanTerms.loanId, l.loanId)))[0];
    const proofs = (await ctx.db.select({ txId: ledgerEvents.txId, blockNumber: ledgerEvents.blockNumber, channel: ledgerEvents.channel }).from(ledgerEvents).where(and(eq(ledgerEvents.channel, 'finance-channel'), eq(ledgerEvents.enwr, l.enwr))).orderBy(asc(ledgerEvents.id)))
      .filter((x, i, a) => a.findIndex((y) => y.txId === x.txId) === i).map((x): Proof => ({ txId: x.txId, blockNumber: x.blockNumber, channel: x.channel as Channel }));
    return {
      loanId: l.loanId, enwr: l.enwr, sscc: l.sscc, amount: terms?.amount ?? 0, status: l.status as Loan['status'], proofs,
      ...(withTerms && terms ? { tenureDays: terms.tenureDays, ratePct: terms.ratePct, repaidAmount: terms.repaidAmount } : {}),
    };
  }
  const chainLoan = async (loanId: string): Promise<ChainLoan> => {
    const r = (await ctx.db.select().from(liensView).where(eq(liensView.loanId, loanId)))[0];
    if (!r) throw notFound(`Loan ${loanId}`);
    return r.loan as ChainLoan;
  };

  return {
    async recordDeposit(req) {
      const b = parse(depositBody, req.body, 'deposit');
      return withLock(b.sscc, async () => {
        const lot = await loadChainLot(ctx.db, b.sscc);
        if (!lot) throw notFound(`Lot ${b.sscc}`);
        const year = Number(today().slice(0, 4));
        const id = depositId(year, await nextSequence(ctx.db, `deposit-${year}`, 201));
        const { receipt } = await submit(ctx, fabricUserOf(user(req)), 'finance-channel', 'pledge-lien', 'RecordDeposit', [id, b.sscc, b.facility, b.facilityName, String(b.bags), b.depositedAt], ENDORSE.finance);
        const m = await mirror(ctx, 'SetInStorage', b.sscc, [b.sscc, b.facility, id], receipt.txId);
        await refreshDeposit(ctx, id); await refreshLot(ctx, b.sscc);
        const d = (await ctx.db.select().from(depositsView).where(eq(depositsView.depositId, id)))[0]!;
        return reply(receipted(receipt, await depositBodyOf(d.deposit as DepositRow)), 201, m.pending ? { 'X-Mirror-Pending': 'SetInStorage' } : undefined);
      });
    },

    async listDeposits(req) {
      const q = req.query as { facility?: string; cursor?: string; limit?: string };
      const { limit, offset } = pageParams(q);
      const rows = await ctx.db.select().from(depositsView).orderBy(asc(depositsView.depositId)).limit(limit + 1).offset(offset);
      const filtered = rows.slice(0, limit).map((r) => r.deposit as DepositRow).filter((d) => !q.facility || d.facility === q.facility);
      return { items: await Promise.all(filtered.map(depositBodyOf)), nextCursor: nextCursor(offset, limit, rows.length) };
    },

    async issueEnwr(req) {
      const { id } = req.params as { id: string };
      const row = (await ctx.db.select().from(depositsView).where(eq(depositsView.depositId, id)))[0];
      if (!row) throw notFound(`Deposit ${id}`);
      const d = row.deposit as DepositRow;
      return withLock(d.sscc, async () => {
        if (d.enwr) throw new HttpError('ERR_INVALID_STATE', `Deposit ${id} already has e-NWR ${d.enwr}.`);
        await drainMirrorQueue(ctx, { warn: () => {} }); // a pending SetInStorage must land first
        const lot = await refreshLot(ctx, d.sscc);
        const issued = await ctx.adapters.enwr.issue({ depositId: id, sscc: d.sscc, facility: d.facility, commodity: lot.commodity, quantityKg: lot.netKg, year: Number(today().slice(0, 4)) });
        const { receipt } = await submit(ctx, fabricUserOf(user(req)), 'finance-channel', 'pledge-lien', 'IssueENWRRef', [id, issued.enwr, issued.repository], ENDORSE.finance);
        await refreshDeposit(ctx, id);
        return receipted(receipt, { depositId: id, enwr: issued.enwr, repository: issued.repository, simulatedAdapter: true } satisfies EnwrIssued);
      });
    },

    async listCollateral(req) {
      const q = req.query as { enwr?: string; sscc?: string; cursor?: string; limit?: string };
      const { limit, offset } = pageParams(q);
      const rows = await ctx.db.select().from(depositsView).where(and(isNotNull(sql`${depositsView.deposit}->>'enwr'`), q.enwr ? sql`${depositsView.deposit}->>'enwr' = ${q.enwr}` : undefined, q.sscc ? eq(depositsView.sscc, q.sscc) : undefined)).orderBy(asc(depositsView.depositId)).limit(limit + 1).offset(offset);
      const items: Collateral[] = [];
      for (const r of rows.slice(0, limit)) { const lot = await loadChainLot(ctx.db, r.sscc); if (lot) items.push(await collateralOf(r.deposit as DepositRow, lot)); }
      return { items, nextCursor: nextCursor(offset, limit, rows.length) };
    },

    async markLien(req) {
      const u = user(req);
      const { enwr } = req.params as { enwr: string };
      const b = parse(lienBody, req.body, 'lien');
      const dep = (await ctx.db.select().from(depositsView).where(sql`${depositsView.deposit}->>'enwr' = ${enwr}`))[0];
      if (!dep) throw notFound(`e-NWR ${enwr}`);
      const d = dep.deposit as DepositRow;
      return withLock(d.sscc, async () => {
        const lot = await refreshLot(ctx, d.sscc);
        const col = await collateralOf(d, lot);
        if (col.priceBasis.modalPerQtl === 0) throw invalid('This lot has no price basis, so it cannot be valued. Load AGMARKNET prices (or the MSP for paddy) first.');
        if (b.amount > col.eligibleLoan) throw invalid(`The loan amount is above the eligible loan of ${col.eligibleLoan} (70% of the assessed value ${col.assessedValue}).`);
        const salt = randomBytes(16).toString('hex');
        const lienId = lienIdOfLoan(b.loanId);
        const { receipt } = await submit(ctx, fabricUserOf(u), 'finance-channel', 'pledge-lien', 'MarkLien', [lienId, enwr, b.loanId], ENDORSE.finance,
          { loanTerms: JSON.stringify({ amount: b.amount, tenureDays: b.tenureDays, ratePct: b.ratePct, salt }) });
        await ctx.db.insert(loanTerms).values({ loanId: b.loanId, enwr, sscc: d.sscc, amount: b.amount, tenureDays: b.tenureDays, ratePct: b.ratePct, salt }).onConflictDoNothing();
        const m = await mirror(ctx, 'SetPledged', d.sscc, [d.sscc, 'true', lienId], receipt.txId);
        await refreshLien(ctx, enwr, b.loanId); await refreshLot(ctx, d.sscc);
        return reply(receipted(receipt, await loanOf(await chainLoan(b.loanId), true)), 201, m.pending ? { 'X-Mirror-Pending': 'SetPledged' } : undefined);
      });
    },

    async disburseLoan(req) {
      const { loanId } = req.params as { loanId: string };
      const l = await chainLoan(loanId);
      return withLock(l.sscc, async () => {
        const { receipt } = await submit(ctx, fabricUserOf(user(req)), 'finance-channel', 'pledge-lien', 'RecordDisbursement', [loanId], ENDORSE.finance);
        await refreshLien(ctx, l.enwr, loanId);
        return receipted(receipt, await loanOf(await chainLoan(loanId), true));
      });
    },

    async repayLoan(req) {
      const { loanId } = req.params as { loanId: string };
      const b = parse(repayBody, req.body, 'repayment');
      const l = await chainLoan(loanId);
      return withLock(l.sscc, async () => {
        const { receipt } = await submit(ctx, fabricUserOf(user(req)), 'finance-channel', 'pledge-lien', 'RecordRepayment', [loanId], ENDORSE.finance, { repayment: JSON.stringify({ amount: b.amount }) });
        await ctx.db.update(loanTerms).set({ repaidAmount: sql`${loanTerms.repaidAmount} + ${b.amount}` }).where(eq(loanTerms.loanId, loanId));
        await refreshLien(ctx, l.enwr, loanId);
        return receipted(receipt, await loanOf(await chainLoan(loanId), true));
      });
    },

    async releaseLien(req) {
      const { loanId } = req.params as { loanId: string };
      const l = await chainLoan(loanId);
      return withLock(l.sscc, async () => {
        const { receipt } = await submit(ctx, fabricUserOf(user(req)), 'finance-channel', 'pledge-lien', 'ReleaseLien', [loanId], ENDORSE.finance);
        const m = await mirror(ctx, 'SetPledged', l.sscc, [l.sscc, 'false', ''], receipt.txId);
        await refreshLien(ctx, l.enwr, loanId); await refreshLot(ctx, l.sscc);
        return reply(receipted(receipt, await loanOf(await chainLoan(loanId), true)), 200, m.pending ? { 'X-Mirror-Pending': 'SetPledged' } : undefined);
      });
    },

    async listLoans(req) {
      const q = req.query as { status?: string; cursor?: string; limit?: string };
      const { limit, offset } = pageParams(q);
      const rows = await ctx.db.select().from(liensView).where(q.status ? sql`${liensView.loan}->>'status' = ${q.status}` : undefined).orderBy(asc(liensView.loanId)).limit(limit + 1).offset(offset);
      return { items: await Promise.all(rows.slice(0, limit).map((r) => loanOf(r.loan as ChainLoan, true))), nextCursor: nextCursor(offset, limit, rows.length) };
    },

    async getLoan(req) { return loanOf(await chainLoan((req.params as { loanId: string }).loanId), true); },
  };
}
