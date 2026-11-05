'use client';
import { useState } from 'react';
import Link from 'next/link';
import { formatDateIST, formatINR, type Order, type PriceAgreementState, type Receipted } from '@/contract/contract';
import { api, asApiError } from '@/lib/api';
import { formatCount } from '@/lib/format';
import { RequireAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { useReloadOnLedger } from '@/lib/ledgerEvents';
import { parsePricePerQtl, parseUpiRef } from '@/lib/price';
import { buyerOrderUrl } from '@/lib/portals';
import { Boundary, Skeleton } from '@/components/states';
import { Chip, Field, Hash, Notice, PageHeader, ReceiptNote, Section, SimulatedChip } from '@/components/ui';
import { SsccLink, WriteButton } from '@/components/actions';
import { ProofButton } from '@/components/ProofDrawer';
import { CHANNEL_LABEL, ORDER_TONE } from '../OrdersView';

export function OrderView({ orderId }: { orderId: string }) {
  return <RequireAuth>{() => <OrderPage orderId={orderId} />}</RequireAuth>;
}

function OrderPage({ orderId }: { orderId: string }) {
  const [awaiting, setAwaiting] = useState(false);
  // while the buyer has not matched our price, re-read the order every 4 s as well as on ledger events
  const order = useApi((s) => api.order(orderId, s), [orderId], { refreshMs: awaiting ? 4000 : undefined });
  useReloadOnLedger(order.reload, (e) => e.orderId === orderId);
  return (
    <Boundary state={order} skeleton={<Skeleton className="h-64 w-full" />} notFoundTitle={`No order ${orderId}`}>
      {(o) => <Detail o={o} reload={order.reload} setAwaiting={setAwaiting} />}
    </Boundary>
  );
}

function Detail({ o, reload, setAwaiting }: { o: Order; reload: () => void; setAwaiting: (b: boolean) => void }) {
  return (
    <>
      <PageHeader eyebrow="Order" title={<span className="mono">{o.orderId}</span>} actions={<Chip tone={ORDER_TONE[o.status]}>{o.status.replace(/_/g, ' ').toLowerCase()}</Chip>}>
        {CHANNEL_LABEL[o.channel]}{o.channel !== 'DIRECT' && <> <SimulatedChip what={CHANNEL_LABEL[o.channel]} /></>}, deliver by {formatDateIST(o.deliveryBy)}.{' '}
        <a href={buyerOrderUrl(o.orderId)} target="_blank" rel="noreferrer">Open in the buyer portal</a>
      </PageHeader>
      {o.status === 'PRICE_AGREED' && <Notice tone="ok" title="Price agreed" testId="price-agreed">The buyer submitted the same price, so the two hashes matched and the ledger committed the agreement. The hash is under Ledger records.</Notice>}
      <div className="grid gap-x-5 lg:grid-cols-2">
        <div>
          <Section title="Lots in this order">
            <ul className="divide-y divide-line">{o.ssccs.map((s) => <li key={s} className="py-2"><SsccLink sscc={s} /></li>)}</ul>
            {(o.status === 'PRICE_AGREED') && <p className="border-t border-line py-2 text-sm text-ink-2">Price agreed. The operator dispatches each lot from its page.</p>}
          </Section>
          <Section title="Ledger records">
            <dl>
              <Field label="Price hash">{o.priceHash ? <Hash value={o.priceHash} label="Copy price hash" /> : <span className="text-ink-3">not agreed yet</span>}</Field>
              <Field label="Transactions"><span className="flex flex-wrap gap-2">{o.proofs.map((p) => <ProofButton key={p.txId} proof={p} label={`Block ${p.blockNumber}`} />)}</span></Field>
            </dl>
          </Section>
        </div>
        <div>
          {o.status === 'OPEN' ? <AgreePrice orderId={o.orderId} onChange={reload} setAwaiting={setAwaiting} /> : <AgreedPrice orderId={o.orderId} />}
          {o.status === 'DELIVERED' && <Settle orderId={o.orderId} onDone={reload} />}
          {o.status === 'SETTLED' && <Notice tone="ok">Settled. Patronage is paid out from the settlement; that step is not in this build of the console.</Notice>}
        </div>
      </div>
    </>
  );
}

function AgreedPrice({ orderId }: { orderId: string }) {
  const price = useApi((s) => api.orderPrice(orderId, s), [orderId]);
  return (
    <Section title="Agreed price" aside="Visible to the FPO and the buyer only">
      <Boundary state={price} skeleton={<Skeleton className="my-3 h-16 w-full" />}>
        {(p) => (
          <dl>
            <Field label="Price">{formatINR(p.pricePerQtl)} per quintal</Field>
            <Field label="Quantity">{p.quantityQtl} quintal</Field>
            <Field label="Total">{formatINR(p.totalAmount)}</Field>
            <Field label="Agreed">{formatDateIST(p.agreedAt)} <ProofButton proof={p.proof} /></Field>
          </dl>
        )}
      </Boundary>
      <p className="border-t border-line py-2 text-sm text-ink-3">The bank and the observer see only the hash above. The price is held in private data shared by the FPO and the buyer.</p>
    </Section>
  );
}

/** F6, FPO side. We send only pricePerQtl: with no salt the gateway derives the same salt for both parties, so the buyer's hash matches ours. */
function AgreePrice({ orderId, onChange, setAwaiting }: { orderId: string; onChange: () => void; setAwaiting: (b: boolean) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [sent, setSent] = useState<Receipted<PriceAgreementState> | null>(null);
  const parsed = parsePricePerQtl(text);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed.ok) return;
    setBusy(true); setError(null);
    try {
      const r = await api.agreePrice(orderId, { pricePerQtl: parsed.value });
      setSent(r.data);
      setAwaiting(r.data.resource.state === 'AWAITING_COUNTERPARTY');
      onChange();
    } catch (err) {
      const a = asApiError(err);
      setAwaiting(false); setSent(null);
      setError({ code: a.code, message: a.code === 'ERR_PRICE_HASH_MISMATCH' ? a.message : a.serverMessage ?? a.message });
    } finally { setBusy(false); }
  }
  const state = sent?.resource.state;
  return (
    <Section title="Agree the price" aside="Step 1 of 2: you submit, then the buyer submits the same number">
      <form onSubmit={submit} className="grid gap-3 py-3" data-testid="agree-form">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="price">Price per quintal (₹)</label>
          <input id="price" inputMode="decimal" className="field max-w-xs" placeholder="1580" value={text} onChange={(e) => { setText(e.target.value); setSent(null); setError(null); }} aria-invalid={text !== '' && !parsed.ok} aria-describedby="price-hint" />
          <p id="price-hint" className={`mt-1 text-sm ${text !== '' && !parsed.ok ? 'text-danger' : 'text-ink-3'}`}>{text !== '' && !parsed.ok ? parsed.message : 'The buyer enters the same number on their side.'}</p>
        </div>
        <div><WriteButton className="btn" data-variant="primary" disabled={busy || !parsed.ok} data-testid="agree-submit">{busy ? 'Submitting…' : 'Submit my price'}</WriteButton></div>
        {error && <Notice tone="danger" title={error.code === 'ERR_PRICE_HASH_MISMATCH' ? 'The prices do not match' : 'The ledger refused this price'} testId="agree-error">{error.message}</Notice>}
        {sent && (
          <div data-testid="agree-sent">
            <div className="mb-3 rounded-md border border-line p-3 text-sm">
              <p>The price goes only to you and the buyer. The shared ledger stores this hash:</p>
              <p className="mt-1"><Hash value={sent.resource.priceHash} label="Copy price hash" /></p>
              <p className="mt-2" data-testid="buyer-side">
                Buyer&apos;s side:{' '}
                {state === 'AGREED' ? <Chip tone="ok">Matched. Price agreed.</Chip> : <Chip tone="warn">Waiting for Gangetic Fresh Foods to submit the same price</Chip>}
              </p>
            </div>
            <ReceiptNote r={sent}>Your side is on the ledger.</ReceiptNote>
          </div>
        )}
      </form>
    </Section>
  );
}

function Settle({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const price = useApi((s) => api.orderPrice(orderId, s), [orderId]).data;
  const [amount, setAmount] = useState('');
  const [upi, setUpi] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipted<Order> | null>(null);
  const amt = Number(amount.replace(/[₹,\s]/g, '') || (price ? price.totalAmount : NaN));
  const ref = parseUpiRef(upi);
  const amtOk = Number.isInteger(amt) && amt > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ref.ok || !amtOk) return;
    setBusy(true); setError(null);
    try { const r = await api.settle(orderId, { amount: amt, upiRef: ref.value }); setReceipt(r.data); onDone(); }
    catch (err) { setError(asApiError(err).message); } finally { setBusy(false); }
  }
  return (
    <Section title="Record the settlement" aside="Step 9. The payment itself is simulated.">
      <form onSubmit={submit} className="grid gap-3 py-3" data-testid="settle-form">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block text-sm font-medium" htmlFor="amt">Amount received (₹, whole rupees)</label>
            <input id="amt" inputMode="numeric" className="field" placeholder={price ? String(price.totalAmount) : ''} value={amount} onChange={(e) => setAmount(e.target.value)} />
            {price && <p className="mt-1 text-sm text-ink-3">Agreed total {formatINR(price.totalAmount)} for {formatCount(price.quantityQtl)} quintal.</p>}</div>
          <div><label className="mb-1 block text-sm font-medium" htmlFor="upi">UPI reference <SimulatedChip what="UPI" /></label>
            <div className="flex items-center gap-2"><span className="mono text-ink-2">SIM</span><input id="upi" inputMode="numeric" className="field" placeholder="604512339876" value={upi} onChange={(e) => setUpi(e.target.value)} aria-invalid={upi !== '' && !ref.ok} /></div>
            {upi !== '' && !ref.ok && <p className="mt-1 text-sm text-danger">{ref.message}</p>}</div>
        </div>
        <div><WriteButton className="btn" data-variant="primary" disabled={busy || !ref.ok || !amtOk}>{busy ? 'Recording…' : 'Record settlement'}</WriteButton></div>
        {error && <Notice tone="danger">{error}</Notice>}
        {receipt && <ReceiptNote r={receipt}>Settlement recorded. Order <Link className="mono" href={`/orders/${orderId}`}>{orderId}</Link> is settled.</ReceiptNote>}
      </form>
    </Section>
  );
}
