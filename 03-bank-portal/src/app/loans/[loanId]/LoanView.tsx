'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import type { Loan, LedgerReceipt } from '@/contract/contract';
import { api, asApiError, type ApiClientError } from '@/lib/api';
import { RequireAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { fpoCollateralUrl } from '@/lib/portals';
import { Boundary, StateShell } from '@/components/states';
import { LoanStatusChip, ReceiptCard, WriteError, inr } from '@/components/finance';
import { ProofButton } from '@/components/ProofDrawer';
import { Field, Hash, PageHeader, Section } from '@/components/ui';
import { WRITES_PAUSED_REASON, useWritesEnabled } from '@/components/AppShell';
import { govTxUrl } from '@/lib/portals';

export function LoanView({ loanId }: { loanId: string }) {
  return <RequireAuth>{() => <Inner loanId={loanId} />}</RequireAuth>;
}

function Inner({ loanId }: { loanId: string }) {
  const state = useApi((s) => api.loan(loanId, s), [loanId]);
  return (
    <Boundary state={state} skeleton={<StateShell kind="loading" title="Loading loan" />} notFoundTitle="No loan with this ID">
      {(loan) => <View loan={loan} reload={state.reload} />}
    </Boundary>
  );
}

type Action = 'disburse' | 'repay' | 'release';
const ACTION_LABEL: Record<Action, string> = { disburse: 'Disbursement recorded', repay: 'Repayment recorded', release: 'Lien released' };

function View({ loan, reload }: { loan: Loan; reload: () => void }) {
  const writes = useWritesEnabled();
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [receipts, setReceipts] = useState<{ action: Action; receipt: LedgerReceipt }[]>([]);
  const [repayAmount, setRepayAmount] = useState('');
  const [repayTouched, setRepayTouched] = useState(false);

  const repay = Number(repayAmount);
  const repayProblem = !(repay > 0) || !Number.isInteger(repay) ? 'Enter the repayment in whole rupees, above zero.' : null;

  async function run(action: Action) {
    setBusy(action); setError(null);
    try {
      const { data } =
        action === 'disburse' ? await api.disburse(loan.loanId)
        : action === 'release' ? await api.release(loan.loanId)
        : await api.repay(loan.loanId, { amount: repay });
      setReceipts((r) => [{ action, receipt: data }, ...r]);
      if (action === 'repay') { setRepayAmount(''); setRepayTouched(false); }
      reload();
    } catch (e) { setError(asApiError(e)); } finally { setBusy(null); }
  }

  const why = (needs: string, ok: boolean) => (!writes ? WRITES_PAUSED_REASON : !ok ? needs : undefined);
  const canDisburse = loan.status === 'SANCTIONED';
  const canRepay = loan.status === 'DISBURSED';
  const canRelease = loan.status === 'REPAID';

  return (
    <>
      <nav className="mb-3 text-sm"><Link href="/loans">Loans</Link> <span className="text-ink-3">/</span> <span className="mono">{loan.loanId}</span></nav>
      <PageHeader eyebrow="Loan" title={<span className="mono">{loan.loanId}</span>}>
        <LoanStatusChip status={loan.status} />
      </PageHeader>

      <Section title="Loan" aside="Terms are private to the bank and the FPO">
        <dl>
          <Field label="e-NWR"><Link href={`/collateral/${loan.enwr}`} className="mono">{loan.enwr}</Link></Field>
          <Field label="Amount"><span className="num font-semibold">{inr(loan.amount)}</span></Field>
          <Field label="Repaid so far"><span className="num" data-testid="repaid">{loan.repaidAmount !== undefined ? inr(loan.repaidAmount) : 'Not available'}</span></Field>
          <Field label="Tenure"><span className="num">{loan.tenureDays !== undefined ? `${loan.tenureDays} days` : 'Not available'}</span></Field>
          <Field label="Interest rate"><span className="num">{loan.ratePct !== undefined ? `${loan.ratePct}% a year` : 'Not available'}</span></Field>
        </dl>
      </Section>

      <Section title="Actions" aside="Each one is a ledger transaction">
        <div className="grid gap-5 py-4 md:grid-cols-3">
          <div>
            <h3 className="text-sm font-semibold">1. Disburse</h3>
            <p className="mt-1 text-sm text-ink-2">Record that the sanctioned amount has been paid out.</p>
            <button className="btn mt-3" data-variant={canDisburse ? 'primary' : undefined} disabled={!writes || !canDisburse || busy !== null}
              title={why('Only a sanctioned loan can be disbursed.', canDisburse)} onClick={() => run('disburse')} data-testid="disburse">
              {busy === 'disburse' ? 'Waiting for the endorsing peers…' : 'Record disbursement'}
            </button>
          </div>
          <div>
            <h3 className="text-sm font-semibold">2. Record repayment</h3>
            <p className="mt-1 text-sm text-ink-2">The loan becomes repaid when the total reaches the principal.</p>
            <label htmlFor="repay" className="mt-3 block text-sm">Amount (₹)</label>
            <input id="repay" className="field num mt-1" inputMode="numeric" value={repayAmount} onChange={(e) => setRepayAmount(e.target.value)} disabled={!canRepay} />
            {repayTouched && repayProblem && <p className="mt-1 text-sm text-danger" role="alert">{repayProblem}</p>}
            <button className="btn mt-3" disabled={!writes || !canRepay || busy !== null} title={why('Repayments are recorded on a disbursed loan.', canRepay)}
              onClick={() => { setRepayTouched(true); if (!repayProblem) void run('repay'); }} data-testid="repay">
              {busy === 'repay' ? 'Waiting for the endorsing peers…' : 'Record repayment'}
            </button>
          </div>
          <div>
            <h3 className="text-sm font-semibold">3. Release the lien</h3>
            <p className="mt-1 text-sm text-ink-2">Available once the loan is repaid. Releasing unlocks dispatch in the FPO console.</p>
            <button className="btn mt-3" data-variant={canRelease ? 'primary' : undefined} disabled={!writes || !canRelease || busy !== null}
              title={why('The lien can be released after the loan is repaid.', canRelease)} onClick={() => run('release')} data-testid="release">
              {busy === 'release' ? 'Waiting for the endorsing peers…' : 'Release lien'}
            </button>
          </div>
        </div>
        {!writes && <p className="border-t border-line py-3 text-sm text-warn">{WRITES_PAUSED_REASON}</p>}
        {error && <div className="border-t border-line py-3"><WriteError error={error} /></div>}
      </Section>

      {receipts.length > 0 && (
        <section className="mb-6 grid gap-4" aria-label="Receipts from this session">
          {receipts.map((r) => (
            <div key={r.receipt.txId} className="grid gap-2">
              <ReceiptCard receipt={r.receipt} title={ACTION_LABEL[r.action]} />
              {r.action === 'release' && (
                <p className="text-sm">Dispatch is now unlocked. <a href={fpoCollateralUrl(loan.enwr)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">Open this receipt in the FPO console <ExternalLink className="h-4 w-4" aria-hidden /></a></p>
              )}
            </div>
          ))}
        </section>
      )}

      <Section title="Ledger history" aside="Oldest first">
        {loan.proofs.length === 0 ? <p className="py-3 text-sm text-ink-2">No transactions are indexed for this loan yet.</p> : (
          <table className="dtable"><thead><tr><th className="num">#</th><th>Transaction</th><th className="num">Block</th><th>Channel</th><th>Proof</th></tr></thead>
            <tbody>{loan.proofs.map((p, i) => (
              <tr key={p.txId}><td className="num">{i + 1}</td><td><Hash value={p.txId} full={false} href={govTxUrl(p.txId)} external label="Copy transaction ID" /></td><td className="num">{p.blockNumber}</td><td>{p.channel}</td><td><ProofButton proof={p} /></td></tr>
            ))}</tbody></table>
        )}
      </Section>

      <p className="mb-6 text-sm"><a href={fpoCollateralUrl(loan.enwr)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">This receipt in the FPO console <ExternalLink className="h-4 w-4" aria-hidden /></a></p>
    </>
  );
}
