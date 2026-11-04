'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import type { Collateral, Loan, Receipted } from '@/contract/contract';
import { api, asApiError, type ApiClientError } from '@/lib/api';
import { DEMO_MODE } from '@/lib/portals';
import { DoubleFinancingNotice, ReceiptCard, WriteError, inr } from './finance';
import { Term } from './ui';
import { WRITES_PAUSED_REASON, useWritesEnabled } from './AppShell';

/** Loan ID format LN-YYYY-NNNNN (contract 3.1). Generated here because the gateway takes it in the request body. */
export function newLoanId(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 100000;
  return `LN-${new Date().getFullYear()}-${String(n).padStart(5, '0')}`;
}

type Outcome = { kind: 'ok'; receipt: Receipted<Loan> } | { kind: 'double'; error: ApiClientError } | { kind: 'error'; error: ApiClientError };

/** Demo only (NEXT_PUBLIC_DEMO_MODE=true): submit a second lien on a receipt that already has one and show the chaincode's refusal. */
export function DuplicatePledgeButton({ collateral, terms }: { collateral: Collateral; terms?: { amount: number; tenureDays: number; ratePct: number } }) {
  const writes = useWritesEnabled();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  if (!DEMO_MODE) return null;

  async function attempt() {
    setBusy(true); setOutcome(null);
    try {
      // Only offered while the lien is active, so the chaincode refuses on the double-financing check before it looks at the terms.
      const t = terms ?? { amount: collateral.eligibleLoan, tenureDays: 180, ratePct: 0 };
      const { data } = await api.markLien(collateral.enwr, { loanId: newLoanId(), ...t });
      setOutcome({ kind: 'ok', receipt: data });
    } catch (e) {
      const err = asApiError(e);
      setOutcome(err.code === 'ERR_DOUBLE_FINANCING' ? { kind: 'double', error: err } : { kind: 'error', error: err });
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-4" data-testid="duplicate-demo">
      <button className="btn" onClick={attempt} disabled={busy || !writes} title={writes ? undefined : WRITES_PAUSED_REASON} data-testid="duplicate-btn">
        {busy ? 'Submitting to the ledger…' : 'Attempt duplicate pledge (demo)'}
      </button>
      <div className="mt-3" aria-live="polite">
        {outcome?.kind === 'double' && <DoubleFinancingNotice error={outcome.error} />}
        {outcome?.kind === 'error' && <WriteError error={outcome.error} />}
        {outcome?.kind === 'ok' && <ReceiptCard receipt={outcome.receipt} title="The ledger accepted a second lien" />}
      </div>
    </div>
  );
}

export function LienDialog({ collateral, onClose, onDone }: { collateral: Collateral; onClose: () => void; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const writes = useWritesEnabled();
  const [loanId] = useState(newLoanId);
  const [amount, setAmount] = useState(String(collateral.eligibleLoan));
  const [tenure, setTenure] = useState('180');
  const [rate, setRate] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => { ref.current?.showModal(); }, []);

  const amt = Number(amount), ten = Number(tenure), rt = Number(rate);
  const problems = [
    !(amt > 0) ? 'Enter an amount above zero.' : amt > collateral.eligibleLoan ? `The amount cannot exceed the eligible loan of ${inr(collateral.eligibleLoan)}.` : !Number.isInteger(amt) ? 'Enter the amount in whole rupees.' : null,
    !(Number.isInteger(ten) && ten > 0) ? 'Tenure must be a whole number of days above zero.' : null,
    rate.trim() === '' || !(rt >= 0 && rt <= 60) ? 'Enter an interest rate between 0 and 60 percent a year.' : null,
  ].filter(Boolean) as string[];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (problems.length) return;
    setBusy(true); setOutcome(null);
    try {
      const { data } = await api.markLien(collateral.enwr, { loanId, amount: amt, tenureDays: ten, ratePct: rt });
      setOutcome({ kind: 'ok', receipt: data });
      onDone();
    } catch (err) {
      const e2 = asApiError(err);
      setOutcome(e2.code === 'ERR_DOUBLE_FINANCING' ? { kind: 'double', error: e2 } : { kind: 'error', error: e2 });
    } finally { setBusy(false); }
  }

  const done = outcome?.kind === 'ok';
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
      className="m-auto w-[min(40rem,calc(100vw-2rem))] rounded-md border border-line bg-surface p-0 text-ink backdrop:bg-black/40" aria-labelledby="lien-title" data-testid="lien-dialog">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 id="lien-title" className="text-lg font-semibold">{done ? 'Lien recorded on the ledger' : 'Mark lien'}</h2>
          <p className="mono mt-0.5 text-xs text-ink-2">{collateral.enwr}</p>
        </div>
        <button className="btn !min-h-8 !px-2" onClick={() => ref.current?.close()} aria-label="Close"><X className="h-4 w-4" aria-hidden /></button>
      </div>

      <div className="px-5 py-4">
        {!done && (
          <form onSubmit={submit} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium" htmlFor="loan-id">Loan ID</label>
                <input id="loan-id" className="field mono mt-1" value={loanId} readOnly aria-describedby="loan-id-help" />
                <p id="loan-id-help" className="mt-1 text-xs text-ink-3">Generated. The lien ID takes the same number.</p>
              </div>
              <div>
                <label className="text-sm font-medium" htmlFor="amount">Amount (₹)</label>
                <input id="amount" className="field num mt-1" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} aria-describedby="amount-help" />
                <p id="amount-help" className="mt-1 text-xs text-ink-3">At most the <Term tip="Assessed value x 70% LTV, from the valuation on this page.">eligible loan</Term> of {inr(collateral.eligibleLoan)}.</p>
              </div>
              <div>
                <label className="text-sm font-medium" htmlFor="tenure">Tenure (days)</label>
                <input id="tenure" className="field num mt-1" inputMode="numeric" value={tenure} onChange={(e) => setTenure(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium" htmlFor="rate">Interest rate (% a year)</label>
                <input id="rate" className="field num mt-1" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
              </div>
            </div>
            <p className="mt-4 text-sm text-ink-2">Loan terms are stored privately between the bank and the FPO.</p>
            {touched && problems.length > 0 && (
              <ul className="mt-3 list-disc pl-5 text-sm text-danger" role="alert">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
            )}
            {outcome?.kind === 'double' && <div className="mt-4"><DoubleFinancingNotice error={outcome.error} /></div>}
            {outcome?.kind === 'error' && <div className="mt-4"><WriteError error={outcome.error} /></div>}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button className="btn" data-variant="primary" disabled={busy || !writes} title={writes ? undefined : WRITES_PAUSED_REASON} data-testid="lien-submit">
                {busy ? 'Waiting for the endorsing peers…' : 'Mark lien'}
              </button>
              {!writes && <span className="text-sm text-warn">{WRITES_PAUSED_REASON}</span>}
            </div>
          </form>
        )}

        {outcome?.kind === 'ok' && (
          <div className="grid gap-4">
            <ReceiptCard receipt={outcome.receipt} title={`Lien marked on ${collateral.enwr}`} />
            <p className="text-sm text-ink-2">
              Loan <span className="mono">{outcome.receipt.resource.loanId}</span> is sanctioned for {inr(outcome.receipt.resource.amount)}. Money moves only when you record the disbursement.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link className="btn no-underline" data-variant="primary" href={`/loans/${outcome.receipt.resource.loanId}`} data-testid="go-disburse">Go to the loan to disburse</Link>
              <button className="btn" onClick={() => ref.current?.close()}>Close</button>
            </div>
            <DuplicatePledgeButton collateral={collateral} terms={{ amount: amt, tenureDays: ten, ratePct: rt }} />
          </div>
        )}
      </div>
    </dialog>
  );
}
