'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { RequireAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { Boundary, StateShell } from '@/components/states';
import { LoanLink, LoanStatusChip, inr } from '@/components/finance';
import { ProofButton } from '@/components/ProofDrawer';
import { PageHeader } from '@/components/ui';

const STATUSES = ['', 'SANCTIONED', 'DISBURSED', 'REPAID', 'RELEASED'] as const;

export function LoanList() {
  return <RequireAuth>{() => <Inner />}</RequireAuth>;
}

function Inner() {
  const [status, setStatus] = useState<string>('');
  const state = useApi((s) => api.loans(status || undefined, s), [status]);
  return (
    <>
      <PageHeader eyebrow="Loans" title="Disburse, record repayments, release the lien">
        Each action is a ledger transaction endorsed by the FPO and this bank. Loan terms are stored privately between the two.
      </PageHeader>
      <div className="mb-4 flex items-center gap-2">
        <label htmlFor="status" className="text-sm text-ink-2">Status</label>
        <select id="status" className="field !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s} value={s}>{s ? s.charAt(0) + s.slice(1).toLowerCase() : 'All'}</option>)}
        </select>
      </div>
      <Boundary state={state} skeleton={<StateShell kind="loading" title="Loading loans" />}>
        {(page) =>
          page.items.length === 0 ? (
            <StateShell kind="empty" title="No loans with this status" body="A loan appears here after you mark a lien on a receipt." action={<Link className="btn no-underline" href="/collateral">Find collateral</Link>} />
          ) : (
            <div className="card scroll-x">
              <table className="dtable" data-testid="loan-table">
                <thead>
                  <tr><th>Loan</th><th>e-NWR</th><th className="num">Amount</th><th className="num">Repaid</th><th className="num">Tenure (days)</th><th className="num">Rate (%)</th><th>Status</th><th>Proof</th></tr>
                </thead>
                <tbody>
                  {page.items.map((l) => (
                    <tr key={l.loanId}>
                      <td><LoanLink loanId={l.loanId} /></td>
                      <td><Link href={`/collateral/${l.enwr}`} className="mono">{l.enwr}</Link></td>
                      <td className="num">{inr(l.amount)}</td>
                      <td className="num">{l.repaidAmount !== undefined ? inr(l.repaidAmount) : ''}</td>
                      <td className="num">{l.tenureDays ?? ''}</td>
                      <td className="num">{l.ratePct ?? ''}</td>
                      <td><LoanStatusChip status={l.status} /></td>
                      <td><ProofButton proof={l.proofs[l.proofs.length - 1]} label="Latest" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Boundary>
    </>
  );
}
