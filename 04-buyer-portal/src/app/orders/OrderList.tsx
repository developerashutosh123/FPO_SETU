'use client';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { RequireAuth } from '@/lib/auth';
import { formatDay } from '@/lib/format';
import { useApi } from '@/lib/useApi';
import { Boundary, StateShell } from '@/components/states';
import { OrderStatusChip } from '@/components/trade';
import { Hash, PageHeader } from '@/components/ui';

export function OrderList() {
  return <RequireAuth>{() => <Inner />}</RequireAuth>;
}

function Inner() {
  const orders = useApi((s) => api.orders(undefined, s), []);
  return (
    <>
      <PageHeader eyebrow="Orders" title="Your orders with the FPO">
        Prices are not listed here. Only you and the FPO can read a price; everyone else sees its hash.
      </PageHeader>
      <div className="mb-4"><Link className="btn no-underline" data-variant="primary" href="/"><Plus className="h-4 w-4" aria-hidden />Pick lots to order</Link></div>
      <Boundary state={orders} skeleton={<StateShell kind="loading" title="Loading orders" />}>
        {(page) => page.items.length === 0 ? (
          <StateShell kind="empty" title="No orders yet" body="Select lots in the catalogue and create an order. It will appear here." action={<Link className="btn no-underline" href="/">Open the catalogue</Link>} />
        ) : (
          <div className="card scroll-x">
            <table className="dtable" data-testid="order-table">
              <caption className="sr-only">Orders</caption>
              <thead><tr><th>Order</th><th className="num">Lots</th><th>Channel</th><th>Deliver by</th><th>Status</th><th>Price hash</th></tr></thead>
              <tbody>
                {page.items.map((o) => (
                  <tr key={o.orderId} data-testid="order-row">
                    <td><Link href={`/orders/${o.orderId}`} className="mono">{o.orderId}</Link></td>
                    <td className="num">{o.ssccs.length}</td>
                    <td>{o.channel}</td>
                    <td>{formatDay(o.deliveryBy)}</td>
                    <td><OrderStatusChip status={o.status} /></td>
                    <td>{o.priceHash ? <Hash value={o.priceHash} full={false} label="Copy price hash" /> : <span className="text-ink-3">not yet</span>}</td>
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
