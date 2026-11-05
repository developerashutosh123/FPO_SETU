'use client';
import { ExternalLink } from 'lucide-react';
import type { Grade, LedgerReceipt, LotStatus, Order } from '@/contract/contract';
import { ApiClientError } from '@/lib/api';
import { formatDateTimeIST } from '@/lib/format';
import { govTxUrl } from '@/lib/portals';
import { ProofButton } from './ProofDrawer';
import { ChannelChip, Chip, Hash, OrgBadge } from './ui';

export function GradeChip({ grade }: { grade?: Grade }) {
  if (!grade) return <Chip title="Not graded yet">Ungraded</Chip>;
  return <Chip tone={grade === 'A' ? 'ok' : grade === 'B' ? 'warn' : undefined} title={`Grade ${grade}`}>Grade {grade}</Chip>;
}

const LOT_STATUS_LABEL: Partial<Record<LotStatus, string>> = {
  GRADED: 'Graded', IN_STORAGE: 'In storage', LISTED: 'Listed', SOLD: 'Sold', IN_TRANSIT: 'In transit', DELIVERED: 'Delivered',
  SETTLED: 'Settled', CLOSED: 'Closed', TRANSFORMED: 'Sent to processing', REJECTED: 'Rejected', UNVERIFIABLE: 'Origin unverifiable',
  PLEDGED: 'Pledged', COMMISSIONED: 'Commissioned',
};
export const lotStatusLabel = (s: LotStatus) => LOT_STATUS_LABEL[s] ?? s;
export function LotStatusChip({ status }: { status: LotStatus }) {
  const tone = status === 'DELIVERED' || status === 'SETTLED' || status === 'CLOSED' ? 'ok' : status === 'IN_TRANSIT' ? 'accent' : status === 'REJECTED' || status === 'UNVERIFIABLE' ? 'danger' : undefined;
  return <span className="chip" data-tone={tone} data-testid="lot-status">{lotStatusLabel(status)}</span>;
}

const ORDER_STATUS_LABEL: Record<Order['status'], string> = {
  OPEN: 'Open: price not agreed', PRICE_AGREED: 'Price agreed', IN_TRANSIT: 'In transit', DELIVERED: 'Delivered', SETTLED: 'Settled',
};
export function OrderStatusChip({ status }: { status: Order['status'] }) {
  const tone = status === 'OPEN' ? 'warn' : status === 'PRICE_AGREED' || status === 'IN_TRANSIT' ? 'accent' : 'ok';
  return <span className="chip" data-tone={tone} data-testid="order-status">{ORDER_STATUS_LABEL[status]}</span>;
}

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

/** A failed write. Shows this portal's action-phrased message first, then the gateway's own message and the code. */
export function WriteError({ error, title }: { error: ApiClientError; title?: string }) {
  return (
    <div className="card p-4" style={{ borderColor: 'var(--danger-text)' }} role="alert" data-testid="write-error">
      {title && <p className="text-sm font-semibold text-danger">{title}</p>}
      <dl className="mt-2 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="text-ink-2">Error code</dt>
        <dd><span className="mono font-semibold" data-testid="error-code">{error.code}</span></dd>
        <dt className="text-ink-2">What to do</dt>
        <dd data-testid="error-action">{error.message}</dd>
        {error.serverMessage && (
          <>
            <dt className="text-ink-2">Ledger said</dt>
            <dd className="mono break-words" data-testid="error-message">{error.serverMessage}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
