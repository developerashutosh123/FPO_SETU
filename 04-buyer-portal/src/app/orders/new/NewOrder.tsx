'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import type { LedgerReceipt, Order, SalesChannel } from '@/contract/contract';
import { api, asApiError, type ApiClientError } from '@/lib/api';
import { RequireAuth } from '@/lib/auth';
import { formatDay, formatKg, formatQtl } from '@/lib/format';
import { commodityLabel } from '@/lib/labels';
import { useApi } from '@/lib/useApi';
import { Boundary, StateShell } from '@/components/states';
import { useWritesEnabled, WRITES_PAUSED_REASON } from '@/components/AppShell';
import { GradeChip, ReceiptCard, WriteError } from '@/components/trade';
import { PageHeader, Section } from '@/components/ui';

const CHANNELS: { value: SalesChannel; label: string }[] = [
  { value: 'DIRECT', label: 'Direct, between you and the FPO' },
  { value: 'ONDC', label: 'ONDC (simulated adapter)' },
  { value: 'ENAM', label: 'e-NAM (simulated adapter)' },
];
const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

export function NewOrder() {
  return <RequireAuth>{() => <Inner />}</RequireAuth>;
}

function Inner() {
  const wanted = useSearchParams().getAll('sscc');
  const catalogue = useApi((s) => api.catalogue({ limit: '200' }, s), []);
  const writes = useWritesEnabled();
  const [deliveryBy, setDeliveryBy] = useState('');
  const [channel, setChannel] = useState<SalesChannel>('DIRECT');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [done, setDone] = useState<{ receipt: LedgerReceipt; order: Order } | null>(null);

  if (wanted.length === 0) {
    return <StateShell kind="empty" title="No lots selected" body="Pick one or more lots in the catalogue, then choose Create order." action={<Link className="btn no-underline" href="/">Open the catalogue</Link>} />;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const { data } = await api.createOrder({ ssccs: wanted, channel, deliveryBy });
      const { resource, ...receipt } = data;
      setDone({ receipt, order: resource });
    } catch (err) { setError(asApiError(err)); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader eyebrow="New order" title="Order these lots">
        Creating the order records it on the trade channel between you and the FPO. You agree the price in the next step.
      </PageHeader>

      <Boundary state={catalogue} skeleton={<StateShell kind="loading" title="Loading the selected lots" />}>
        {(page) => {
          const lots = wanted.map((s) => ({ sscc: s, lot: page.items.find((i) => i.sscc === s) }));
          const missing = lots.filter((l) => !l.lot);
          return (
            <>
              <Section title="Lots in this order" aside={`${wanted.length} selected`}>
                <ul data-testid="order-lots">
                  {lots.map(({ sscc, lot }) => (
                    <li key={sscc} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-3 last:border-b-0">
                      {lot ? (
                        <>
                          <div>
                            <p className="font-medium">{commodityLabel(lot.commodity)}{lot.variety ? ` · ${lot.variety}` : ''} <GradeChip grade={lot.grade} /></p>
                            <p className="mono text-ink-2">{lot.humanRef}</p>
                          </div>
                          <p className="text-sm">{formatKg(lot.netKg)} <span className="text-ink-2">({formatQtl(lot.quantityQtl)})</span></p>
                        </>
                      ) : (
                        <p className="text-sm text-warn" role="alert">Lot <span className="mono">{sscc}</span> is no longer on offer. It may be listed, pledged or sold. Remove it by going back to the catalogue.</p>
                      )}
                    </li>
                  ))}
                </ul>
              </Section>

              {done ? (
                <div className="space-y-4" data-testid="order-created">
                  <ReceiptCard receipt={done.receipt} title={`Order ${done.order.orderId} created`} />
                  <Link className="btn no-underline" data-variant="primary" href={`/orders/${done.order.orderId}`} data-testid="open-order">Agree the price<ArrowRight className="h-4 w-4" aria-hidden /></Link>
                </div>
              ) : (
                <form onSubmit={submit} className="card p-4 sm:p-5" aria-describedby={error ? 'order-error' : undefined}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-medium">Deliver by
                      <input type="date" className="field mt-1" required min={todayIST()} value={deliveryBy} onChange={(e) => setDeliveryBy(e.target.value)} />
                    </label>
                    <label className="text-sm font-medium">Sales channel
                      <select className="field mt-1" value={channel} onChange={(e) => setChannel(e.target.value as SalesChannel)}>
                        {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </label>
                  </div>
                  {deliveryBy && <p className="mt-2 text-sm text-ink-2">Delivery by {formatDay(deliveryBy)}.</p>}
                  {error && <div id="order-error" className="mt-4"><WriteError error={error} title="The ledger did not create this order" /></div>}
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button className="btn" data-variant="primary" disabled={busy || !writes || missing.length > 0 || !deliveryBy} title={!writes ? WRITES_PAUSED_REASON : undefined} data-testid="create-order">
                      {busy ? 'Submitting…' : 'Create order'}
                    </button>
                    {!writes && <span className="text-sm text-warn">{WRITES_PAUSED_REASON}</span>}
                    {missing.length > 0 && <span className="text-sm text-warn">Remove the unavailable lot first.</span>}
                  </div>
                </form>
              )}
            </>
          );
        }}
      </Boundary>
    </>
  );
}
