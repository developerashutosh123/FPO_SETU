'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ExternalLink } from 'lucide-react';
import type { LedgerReceipt, Order, PriceAgreementState, StreamEvent } from '@/contract/contract';
import { api } from '@/lib/api';
import { RequireAuth } from '@/lib/auth';
import { formatDay } from '@/lib/format';
import { consumerUrl, fpoOrderUrl, govTxUrl } from '@/lib/portals';
import { useLedgerStream } from '@/lib/stream';
import { useApi } from '@/lib/useApi';
import { Boundary, StateShell } from '@/components/states';
import { ProofButton } from '@/components/ProofDrawer';
import { OrderStatusChip } from '@/components/trade';
import { ChannelChip, Hash, PageHeader, Section } from '@/components/ui';
import { PriceAgreement } from './PriceAgreement';

export function OrderView({ orderId }: { orderId: string }) {
  return <RequireAuth>{() => <Inner orderId={orderId} />}</RequireAuth>;
}

export interface Submitted { receipt: LedgerReceipt; state: PriceAgreementState['state']; priceHash: string }

function Inner({ orderId }: { orderId: string }) {
  const [submitted, setSubmitted] = useState<Submitted | null>(null);
  const [fpoSide, setFpoSide] = useState<StreamEvent[]>([]);
  // While the buyer's sealed price waits for the FPO, re-read the order every 6 s as well as on the live stream.
  const waiting = submitted?.state === 'AWAITING_COUNTERPARTY';
  const order = useApi((s) => api.order(orderId, s), [orderId], { refreshMs: waiting ? 6000 : undefined });

  // Live FPO-side status (SSE). Any trade-channel event for this order that is not our own transaction means the other side acted.
  // Our own event can reach the stream before our POST resolves, so it is also removed at render time, once we know our tx ID.
  useLedgerStream((e) => {
    if (e.orderId !== orderId || e.channel !== 'trade-channel') return;
    setFpoSide((prev) => (prev.some((p) => p.txId === e.txId) ? prev : [e, ...prev].slice(0, 5)));
    order.reload();
  });

  return (
    <Boundary state={order} skeleton={<StateShell kind="loading" title="Loading the order" />} notFoundTitle="No order with this ID">
      {(o) => <Detail order={o} submitted={submitted} onSubmitted={setSubmitted} fpoSide={fpoSide.filter((e) => e.txId !== submitted?.receipt.txId)} reload={order.reload} />}
    </Boundary>
  );
}

function Detail({ order, submitted, onSubmitted, fpoSide, reload }: { order: Order; submitted: Submitted | null; onSubmitted: (s: Submitted | null) => void; fpoSide: StreamEvent[]; reload: () => void }) {
  const inTransit = order.status === 'IN_TRANSIT';
  return (
    <>
      <PageHeader eyebrow="Order" title={<span className="mono" data-testid="order-id">{order.orderId}</span>}>
        <span className="flex flex-wrap items-center gap-2">
          <OrderStatusChip status={order.status} />
          <span className="chip">{order.channel}</span>
          <span className="text-sm">Deliver by {formatDay(order.deliveryBy)}</span>
        </span>
      </PageHeader>

      <div className="mb-6 flex flex-wrap gap-2" data-testid="open-in">
        <a className="btn no-underline" href={fpoOrderUrl(order.orderId)} target="_blank" rel="noreferrer">FPO console: this order <ExternalLink className="h-4 w-4" aria-hidden /></a>
        {inTransit && order.ssccs[0] && <Link className="btn no-underline" data-variant="primary" href={`/receive?sscc=${order.ssccs[0]}`}>Receive the shipment<ArrowRight className="h-4 w-4" aria-hidden /></Link>}
      </div>

      <Section title="Lots" aside={`${order.ssccs.length} in this order`}>
        <ul data-testid="order-ssccs">
          {order.ssccs.map((s) => (
            <li key={s} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-3 last:border-b-0">
              <Link href={`/lots/${s}`} className="mono">{s}</Link>
              <span className="flex gap-3 text-sm">
                <Link href={`/lots/${s}`}>Spec sheet</Link>
                <a href={consumerUrl(s)} target="_blank" rel="noreferrer">Consumer page <ExternalLink className="inline h-3 w-3" aria-hidden /></a>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <PriceAgreement order={order} submitted={submitted} onSubmitted={onSubmitted} fpoSide={fpoSide} reload={reload} />

      <Section title="Trade-channel proofs" aside={`${order.proofs.length} transactions`}>
        <div className="scroll-x py-2">
          <table className="dtable" data-testid="order-proofs">
            <caption className="sr-only">Transactions recorded for this order</caption>
            <thead><tr><th>#</th><th>Channel</th><th className="num">Block</th><th>Transaction</th><th><span className="sr-only">Details</span></th></tr></thead>
            <tbody>
              {order.proofs.map((p, i) => (
                <tr key={`${p.txId}-${i}`}>
                  <td>{i + 1}</td>
                  <td><ChannelChip channel={p.channel} /></td>
                  <td className="num mono">#{p.blockNumber}</td>
                  <td><Hash value={p.txId} full={false} href={govTxUrl(p.txId)} external label="Copy transaction ID" /></td>
                  <td><ProofButton proof={p} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
