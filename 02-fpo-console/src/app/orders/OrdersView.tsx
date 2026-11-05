'use client';
import { useState } from 'react';
import Link from 'next/link';
import { formatDateIST, type Order, type Receipted, type SalesChannel } from '@/contract/contract';
import { api, asApiError } from '@/lib/api';
import { RequireAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { useReloadOnLedger } from '@/lib/ledgerEvents';
import { useAllLots } from '@/lib/useAllLots';
import { Boundary, Skeleton, StateShell } from '@/components/states';
import { Chip, Hash, Notice, PageHeader, ReceiptNote, Section, SimulatedChip } from '@/components/ui';
import { WriteButton } from '@/components/actions';
import { ProofButton } from '@/components/ProofDrawer';

export const ORDER_TONE: Record<Order['status'], 'ok' | 'warn' | 'accent' | undefined> = { OPEN: 'warn', PRICE_AGREED: 'accent', IN_TRANSIT: 'accent', DELIVERED: 'ok', SETTLED: 'ok' };
export const CHANNEL_LABEL: Record<SalesChannel, string> = { DIRECT: 'Direct', ONDC: 'ONDC', ENAM: 'e-NAM' };

export function OrdersView() {
  return <RequireAuth>{() => <Orders />}</RequireAuth>;
}

function Orders() {
  const orders = useApi((s) => api.orders(undefined, s), []);
  useReloadOnLedger(orders.reload, (e) => e.orderId !== undefined);
  return (
    <>
      <PageHeader eyebrow="Orders" title="Orders on the trade channel">
        The price of an order is shared only with the buyer. This list shows the hash the shared ledger stores, never the price.
      </PageHeader>
      <CreateOrder onCreated={orders.reload} />
      <Boundary state={orders} skeleton={<Skeleton className="h-40 w-full" />}>
        {(page) => page.items.length === 0 ? (
          <StateShell kind="empty" title="No orders yet" body="Create an order above for lots that are graded, in storage or pledged." />
        ) : (
          <div className="card scroll-x" data-testid="orders-table">
            <table className="dtable">
              <caption className="sr-only">Orders</caption>
              <thead><tr><th>Order</th><th>Channel</th><th>Status</th><th className="num">Lots</th><th>Deliver by</th><th>Price hash</th><th>Proof</th></tr></thead>
              <tbody>
                {page.items.map((o) => (
                  <tr key={o.orderId}>
                    <td><Link className="mono font-medium" href={`/orders/${o.orderId}`}>{o.orderId}</Link></td>
                    <td>{CHANNEL_LABEL[o.channel]}{o.channel !== 'DIRECT' && <> <SimulatedChip what={CHANNEL_LABEL[o.channel]} /></>}</td>
                    <td><Chip tone={ORDER_TONE[o.status]}>{o.status.replace(/_/g, ' ').toLowerCase()}</Chip></td>
                    <td className="num">{o.ssccs.length}</td>
                    <td>{formatDateIST(o.deliveryBy)}</td>
                    <td>{o.priceHash ? <Hash value={o.priceHash} full={false} label="Copy price hash" /> : <span className="text-ink-3">not agreed</span>}</td>
                    <td><ProofButton proof={o.proofs[o.proofs.length - 1]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Boundary>
    </>
  );
}

const LISTABLE = ['GRADED', 'IN_STORAGE', 'PLEDGED'];

function CreateOrder({ onCreated }: { onCreated: () => void }) {
  const lots = useAllLots();
  const [picked, setPicked] = useState<string[]>([]);
  const [channel, setChannel] = useState<SalesChannel>('DIRECT');
  const [deliveryBy, setDeliveryBy] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipted<Order> | null>(null);
  const available = (lots.data?.items ?? []).filter((l) => LISTABLE.includes(l.status));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setReceipt(null);
    try {
      const r = await api.createOrder({ ssccs: picked, channel, deliveryBy });
      setReceipt(r.data); setPicked([]); onCreated();
    } catch (err) { setError(asApiError(err).message); } finally { setBusy(false); }
  }
  return (
    <Section title="Create an order" aside="Lists the lots for the buyer">
      <form onSubmit={submit} className="grid gap-3 py-3" data-testid="create-order">
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Lots to include</legend>
          {available.length === 0 ? <p className="text-sm text-ink-2">No lot is graded, in storage or pledged right now.</p> : (
            <div className="grid max-h-40 gap-1 overflow-y-auto sm:grid-cols-2">
              {available.map((l) => (
                <label key={l.sscc} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={picked.includes(l.sscc)} onChange={(e) => setPicked((p) => e.target.checked ? [...p, l.sscc] : p.filter((x) => x !== l.sscc))} />
                  <span className="mono">{l.humanRef}</span><span className="text-ink-3">{l.grade ? `grade ${l.grade}` : ''} {l.status === 'PLEDGED' ? ', pledged' : ''}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-[14rem_14rem_auto]">
          <div><label className="mb-1 block text-sm font-medium" htmlFor="ch">Channel</label>
            <select id="ch" className="field" value={channel} onChange={(e) => setChannel(e.target.value as SalesChannel)}>
              <option value="DIRECT">Direct</option><option value="ONDC">ONDC (simulated adapter)</option><option value="ENAM">e-NAM (simulated adapter)</option>
            </select></div>
          <div><label className="mb-1 block text-sm font-medium" htmlFor="by">Deliver by</label><input id="by" type="date" className="field" required value={deliveryBy} onChange={(e) => setDeliveryBy(e.target.value)} /></div>
          <div className="self-end"><WriteButton className="btn" data-variant="primary" disabled={busy || picked.length === 0}>{busy ? 'Creating…' : 'Create order'}</WriteButton></div>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
        {receipt && <ReceiptNote r={receipt}>Order <Link className="mono" href={`/orders/${receipt.resource.orderId}`}>{receipt.resource.orderId}</Link> is open. Agree the price on its page.</ReceiptNote>}
      </form>
    </Section>
  );
}
