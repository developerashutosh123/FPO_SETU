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
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
            <StateShell kind="empty" title="No loans with this status" body="A loan appears here after you mark a lien on a receipt." action={<Button asChild variant="outline"><Link href="/collateral">Find collateral</Link></Button>} />
          ) : (
            <div className="card scroll-x">
              <Table data-testid="loan-table">
                <TableHeader>
                  <TableRow><TableHead>Loan</TableHead><TableHead>e-NWR</TableHead><TableHead className="num">Amount</TableHead><TableHead className="num">Repaid</TableHead><TableHead className="num">Tenure (days)</TableHead><TableHead className="num">Rate (%)</TableHead><TableHead>Status</TableHead><TableHead>Proof</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {page.items.map((l) => (
                    <TableRow key={l.loanId}>
                      <TableCell><LoanLink loanId={l.loanId} /></TableCell>
                      <TableCell><Link href={`/collateral/${l.enwr}`} className="mono">{l.enwr}</Link></TableCell>
                      <TableCell className="num">{inr(l.amount)}</TableCell>
                      <TableCell className="num">{l.repaidAmount !== undefined ? inr(l.repaidAmount) : ''}</TableCell>
                      <TableCell className="num">{l.tenureDays ?? ''}</TableCell>
                      <TableCell className="num">{l.ratePct ?? ''}</TableCell>
                      <TableCell><LoanStatusChip status={l.status} /></TableCell>
                      <TableCell><ProofButton proof={l.proofs[l.proofs.length - 1]} label="Latest" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        }
      </Boundary>
    </>
  );
}
