'use client';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { formatINR, type LedgerReceipt, type LienStatus, type Loan } from '@/contract/contract';
import { ApiClientError } from '@/lib/api';
import { formatDateTimeIST } from '@/lib/format';
import { govTxUrl } from '@/lib/portals';
import { ProofButton } from './ProofDrawer';
import { ChannelChip, Hash, OrgBadge } from './ui';

export const inr = (n: number) => formatINR(n);

export function LienChip({ status }: { status: LienStatus }) {
  const map = { NONE: { tone: undefined, text: 'No lien' }, ACTIVE: { tone: 'danger', text: 'Lien active' }, RELEASED: { tone: 'ok', text: 'Lien released' } } as const;
  const m = map[status];
  return <span className="chip" data-tone={m.tone} data-testid="lien-chip">{m.text}</span>;
}

export function LoanStatusChip({ status }: { status: Loan['status'] }) {
  const tone = status === 'RELEASED' ? 'ok' : status === 'REPAID' ? 'accent' : status === 'DISBURSED' ? 'warn' : undefined;
  return <span className="chip" data-tone={tone} data-testid="loan-status">{status.charAt(0) + status.slice(1).toLowerCase()}</span>;
}

/** loanId and lienId share the number part (contract 3.1), so a lien links to its loan. */
export const loanIdFromLien = (lienId?: string) => (lienId ? lienId.replace(/^LIEN-/, 'LN-') : undefined);

/** What the ledger returned for a write: tx, block, channel, endorsers (contract 8, LedgerReceipt). */
export function ReceiptCard({ receipt, title }: { receipt: LedgerReceipt; title: string }) {
  return (
    <div className="card border-ok/50 p-4" role="status" data-testid="receipt">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="chip" data-tone="ok">{receipt.validationCode}</span>
      </div>
      <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="text-ink-2">Transaction</dt>
        <dd><Hash value={receipt.txId} href={govTxUrl(receipt.txId)} external label="Copy transaction ID" /></dd>
        <dt className="text-ink-2">Function</dt>
        <dd className="mono">{receipt.chaincode}.{receipt.fn}</dd>
        <dt className="text-ink-2">Channel and block</dt>
        <dd className="flex flex-wrap items-center gap-2"><ChannelChip channel={receipt.channel} /><span className="mono">block #{receipt.blockNumber}</span></dd>
        <dt className="text-ink-2">Endorsed by</dt>
        <dd className="flex flex-wrap gap-1.5" data-testid="endorsers">{receipt.endorsers.map((o) => <OrgBadge key={o} org={o} />)}</dd>
        <dt className="text-ink-2">Committed</dt>
        <dd>{formatDateTimeIST(receipt.committedAt, true)}</dd>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <ProofButton proof={{ txId: receipt.txId, blockNumber: receipt.blockNumber, channel: receipt.channel }} />
        <a className="btn !min-h-8 no-underline" href={govTxUrl(receipt.txId)} target="_blank" rel="noreferrer">Open in the Gov explorer <ExternalLink className="h-4 w-4" aria-hidden /></a>
      </div>
    </div>
  );
}

/** A failed write. Shows the gateway's own message and code, not a paraphrase. */
export function WriteError({ error }: { error: ApiClientError }) {
  return (
    <div className="card border-danger/50 p-4" role="alert" data-testid="write-error">
      <p className="text-sm font-semibold text-danger">{error.message}</p>
      {error.serverMessage && <p className="mt-1 text-sm text-ink-2">Ledger said: {error.serverMessage}</p>}
      <p className="mt-1 text-xs text-ink-3"><span className="mono">{error.code}</span></p>
    </div>
  );
}

/**
 * ERR_DOUBLE_FINANCING, shown the way the chaincode returned it: code, message verbatim, and the tx ID of the lien that is already on the ledger.
 * Contract 8: the error body carries `txId` for the existing lien.
 */
export function DoubleFinancingNotice({ error }: { error: ApiClientError }) {
  return (
    <div className="card p-4" style={{ borderColor: 'var(--danger-text)' }} role="alert" data-testid="double-financing">
      <p className="text-sm font-semibold text-danger">The ledger rejected this lien</p>
      <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[9rem_1fr]">
        <dt className="text-ink-2">Error code</dt>
        <dd><span className="mono font-semibold" data-testid="error-code">{error.code}</span></dd>
        <dt className="text-ink-2">Message</dt>
        <dd className="mono break-words" data-testid="error-message">{error.serverMessage}</dd>
        {error.txId && (
          <>
            <dt className="text-ink-2">Existing lien tx</dt>
            <dd data-testid="existing-lien-tx"><Hash value={error.txId} href={govTxUrl(error.txId)} external label="Copy transaction ID" /></dd>
          </>
        )}
      </dl>
      <p className="mt-3 text-sm">The ledger already records an active lien on this receipt. No bank on this network can lend against it again until it is released.</p>
    </div>
  );
}

export const LoanLink = ({ loanId }: { loanId: string }) => <Link href={`/loans/${loanId}`} className="mono">{loanId}</Link>;
