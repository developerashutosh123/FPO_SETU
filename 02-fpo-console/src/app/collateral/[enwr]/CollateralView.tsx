'use client';
import { formatDateIST, formatINR, type Collateral, type Loan } from '@/contract/contract';
import { api, type ApiResult } from '@/lib/api';
import { formatDateTimeIST } from '@/lib/format';
import { RequireAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { useReloadOnLedger } from '@/lib/ledgerEvents';
import { bankCollateralUrl, bankLoanUrl } from '@/lib/portals';
import { Boundary, Skeleton } from '@/components/states';
import { Chip, Field, Notice, PageHeader, Section, SimulatedChip } from '@/components/ui';
import { SsccLink } from '@/components/actions';
import { ProofButton } from '@/components/ProofDrawer';
import { LienChip } from '../CollateralList';

export function CollateralView({ enwr }: { enwr: string }) {
  return <RequireAuth>{() => <View enwr={enwr} />}</RequireAuth>;
}

interface Bundle { c: Collateral; loan?: Loan; disbursedAt?: string }

/** The collateral row, its loan (terms visible to the FPO through loanTermsPDC), and the disbursement time read from the ledger transaction. */
async function loadBundle(enwr: string, signal: AbortSignal): Promise<ApiResult<Bundle | null>> {
  const col = await api.collateral({ enwr }, signal, 30_000);
  const c = col.data.items.find((x) => x.enwr === enwr);
  if (!c) return { data: null, mode: col.mode };
  const loans = await api.loans({}, signal).catch(() => null);
  const loan = loans?.data.items.find((l) => l.enwr === enwr && l.status !== 'RELEASED') ?? loans?.data.items.find((l) => l.enwr === enwr);
  let disbursedAt: string | undefined;
  if (loan && (loan.status === 'DISBURSED' || loan.status === 'REPAID')) {
    const txs = await Promise.all(loan.proofs.map((p) => api.ledgerTx(p.txId, signal).then((r) => r.data).catch(() => null)));
    disbursedAt = txs.find((t) => t?.fn === 'recordDisbursement')?.timestamp;
  }
  return { data: { c, loan, disbursedAt }, mode: col.mode };
}

function View({ enwr }: { enwr: string }) {
  const state = useApi((s) => loadBundle(enwr, s), [enwr]);
  useReloadOnLedger(state.reload, (e) => e.enwr === enwr || e.event.startsWith('Loan') || e.event === 'LienReleased');
  if (state.data === null) return <NotFound enwr={enwr} />;
  return (
    <Boundary state={{ ...state, data: state.data }} skeleton={<Skeleton className="h-64 w-full" />} notFoundTitle={`No e-NWR ${enwr}`}>
      {(b) => <Detail b={b} />}
    </Boundary>
  );
}

const NotFound = ({ enwr }: { enwr: string }) => <Notice tone="warn" title={`No e-NWR ${enwr}`}>Check the reference for typing mistakes, or open the collateral list.</Notice>;

function Detail({ b }: { b: Bundle }) {
  const { c, loan, disbursedAt } = b;
  const maturity = disbursedAt && loan?.tenureDays ? new Date(new Date(disbursedAt).getTime() + loan.tenureDays * 86_400_000).toISOString() : undefined;
  return (
    <>
      <PageHeader eyebrow="Collateral position" title={<span className="mono">{c.enwr}</span>} actions={<LienChip status={c.lien.status} />}>
        <SimulatedChip what={`The ${c.repository} repository`} /> Issued for lot <SsccLink sscc={c.lot.sscc} humanRef={c.lot.humanRef} /> stored at {c.facilityName}.{' '}
        <a href={bankCollateralUrl(c.enwr)} target="_blank" rel="noreferrer">Open the bank&apos;s view of this e-NWR</a>
      </PageHeader>
      <div className="grid gap-x-5 lg:grid-cols-2">
        <Section title="Valuation" aside="Computed by the gateway">
          <dl data-testid="valuation">
            <Field label="Quantity">{c.quantityQtl} quintal</Field>
            <Field label="Price basis">{formatINR(c.priceBasis.modalPerQtl)} per quintal modal, {c.priceBasis.market}, {formatDateIST(c.priceBasis.date)}. <span className="text-ink-3">Source: {c.priceBasis.source}</span></Field>
            <Field label="Haircut">{c.haircutPct}%</Field>
            <Field label="Assessed value">{formatINR(c.assessedValue)}</Field>
            <Field label={`Eligible loan at ${c.ltvPct}%`}>{formatINR(c.eligibleLoan)}</Field>
          </dl>
        </Section>
        <Section title="Lien and loan" aside="Terms are visible to the FPO and the bank only">
          <dl data-testid="loan">
            <Field label="Lien"><span className="inline-flex flex-wrap items-center gap-2"><LienChip status={c.lien.status} />{c.lien.lienId && <span className="mono">{c.lien.lienId}</span>}<ProofButton proof={c.lien.proof} label="Lien proof" /></span></Field>
            {loan ? (
              <>
                <Field label="Loan"><a className="mono" href={bankLoanUrl(loan.loanId)} target="_blank" rel="noreferrer">{loan.loanId}</a> <Chip>{loan.status.toLowerCase()}</Chip></Field>
                <Field label="Outstanding">{formatINR(loan.amount - (loan.repaidAmount ?? 0))} <span className="text-ink-3">of {formatINR(loan.amount)} sanctioned{loan.repaidAmount ? `, ${formatINR(loan.repaidAmount)} repaid` : ''}</span></Field>
                <Field label="Rate and tenure">{loan.ratePct !== undefined ? `${loan.ratePct}% a year` : <span className="text-ink-3">not shown</span>}{loan.tenureDays !== undefined ? `, ${loan.tenureDays} days` : ''}</Field>
                <Field label="Maturity">{maturity ? `${formatDateIST(maturity)} (disbursed ${formatDateTimeIST(disbursedAt)} plus ${loan.tenureDays} days)` : <span className="text-ink-3">{loan.status === 'SANCTIONED' ? 'starts at disbursement' : 'not available'}</span>}</Field>
              </>
            ) : <Field label="Loan"><span className="text-ink-3">No loan against this receipt.</span></Field>}
          </dl>
          {c.lien.status === 'ACTIVE' && <p className="border-t border-line py-2 text-sm text-ink-2">While the lien is active the lot cannot be dispatched. The bank releases it after repayment.</p>}
        </Section>
      </div>
      <Section title="Storage conditions" aside="Attested by the facility">
        {c.storageConditionHistory.length === 0 ? <p className="py-3 text-sm text-ink-2">No condition entries yet.</p> : (
          <table className="dtable"><thead><tr><th>When</th><th className="num">Average</th><th>Note</th></tr></thead>
            <tbody>{c.storageConditionHistory.map((h, i) => <tr key={i}><td>{formatDateTimeIST(h.at)}</td><td className="num">{h.avgC !== undefined ? `${h.avgC} °C` : ''}</td><td>{h.note}</td></tr>)}</tbody></table>
        )}
      </Section>
    </>
  );
}
