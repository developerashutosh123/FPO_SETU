'use client';
import { useState } from 'react';
import { CheckCircle2, Circle, Hourglass, Lock, XCircle } from 'lucide-react';
import { formatINR, type Order, type OrderPrice, type Proof, type StreamEvent } from '@/contract/contract';
import { api, asApiError, type ApiClientError } from '@/lib/api';
import { formatDateTimeIST, formatQtl } from '@/lib/format';
import { useApi } from '@/lib/useApi';
import { useWritesEnabled, WRITES_PAUSED_REASON } from '@/components/AppShell';
import { ProofButton } from '@/components/ProofDrawer';
import { ReceiptCard, WriteError } from '@/components/trade';
import { ChannelChip, Hash, OrgBadge, Section } from '@/components/ui';
import type { Submitted } from './OrderView';

const SEALED_COPY = 'Only you and the FPO can read this price. The shared ledger stores only this hash; the bank and the regulator see the hash, not the price.';

type Stage = 'form' | 'waiting' | 'agreed';

function Steps({ stage }: { stage: Stage }) {
  const done = (n: number) => (stage === 'agreed' ? true : stage === 'waiting' ? n === 1 : false);
  const steps = [
    'You seal and submit your price. The gateway hashes it; only the hash goes on the ledger.',
    'The FPO submits its own price the same way.',
    'The ledger commits only if the two hashes match. A price is never compared in the clear.',
  ];
  return (
    <ol className="mb-4 grid gap-2 sm:grid-cols-3" data-testid="price-steps" data-stage={stage}>
      {steps.map((t, i) => {
        const complete = done(i + 1);
        const current = !complete && (stage === 'form' ? i === 0 : i === 1);
        return (
          <li key={i} className="flex gap-2 rounded-md border border-line p-3 text-sm" data-complete={complete} aria-current={current ? 'step' : undefined}>
            {complete ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden /> : current ? <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-accent-fg" aria-hidden /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />}
            <span><span className="sr-only">Step {i + 1}{complete ? ', done' : current ? ', now' : ''}: </span>{t}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function PriceAgreement({ order, submitted, onSubmitted, fpoSide, reload }: { order: Order; submitted: Submitted | null; onSubmitted: (s: Submitted | null) => void; fpoSide: StreamEvent[]; reload: () => void }) {
  const writes = useWritesEnabled();
  const [price, setPrice] = useState('');
  const [mine, setMine] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiClientError | null>(null);

  const agreed = order.status !== 'OPEN' || submitted?.state === 'AGREED';
  const stage: Stage = agreed ? 'agreed' : submitted ? 'waiting' : 'form';
  const value = Number(price);
  const valid = Number.isFinite(value) && value > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setError(null);
    try {
      const { data } = await api.agreePrice(order.orderId, { pricePerQtl: value });
      const { resource, ...receipt } = data;
      setMine(value);
      onSubmitted({ receipt, state: resource.state, priceHash: resource.priceHash });
      if (resource.state === 'AGREED') reload();
    } catch (err) { setError(asApiError(err)); } finally { setBusy(false); }
  }

  return (
    <Section title="Price agreement" aside="Private to you and the FPO">
      <div className="py-4">
        <Steps stage={stage} />

        {stage === 'form' && (
          <form onSubmit={submit} aria-describedby={error ? 'price-error' : undefined} data-testid="price-form">
            <label className="block max-w-xs text-sm font-medium" htmlFor="price">Your price per quintal (₹)</label>
            <input id="price" className="field mt-1 max-w-xs" type="number" inputMode="decimal" min="0.01" step="0.01" required value={price} onChange={(e) => setPrice(e.target.value)} />
            <p className="mt-3 flex max-w-prose items-start gap-2 text-sm text-ink-2" data-testid="sealed-copy"><Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{SEALED_COPY}</p>
            {error && error.code === 'ERR_PRICE_HASH_MISMATCH' && <div id="price-error" className="mt-4"><Mismatch error={error} onAgain={() => { setError(null); setPrice(''); }} /></div>}
            {error && error.code !== 'ERR_PRICE_HASH_MISMATCH' && <div id="price-error" className="mt-4"><WriteError error={error} title="The ledger did not take this price" /></div>}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button className="btn" data-variant="primary" disabled={busy || !valid || !writes} title={!writes ? WRITES_PAUSED_REASON : undefined} data-testid="seal-price">
                {busy ? 'Submitting…' : 'Seal and submit my price'}
              </button>
              {!writes && <span className="text-sm text-warn">{WRITES_PAUSED_REASON}</span>}
            </div>
          </form>
        )}

        {stage === 'waiting' && submitted && (
          <div className="space-y-4" data-testid="price-waiting">
            <div>
              <p className="font-medium">Your sealed price is on the ledger. Waiting for the FPO to submit the same price.</p>
              {mine !== null && <p className="mt-1 text-sm text-ink-2">You submitted {formatINR(mine)} per quintal. This page is the only place that value is held.</p>}
            </div>
            <HashBlock hash={submitted.priceHash} />
            <FpoSide events={fpoSide} waiting />
            <ReceiptCard receipt={submitted.receipt} title="Your sealed price was submitted" />
          </div>
        )}

        {stage === 'agreed' && (
          <div className="space-y-4" data-testid="price-agreed">
            <p className="flex items-center gap-2 font-medium text-ok"><CheckCircle2 className="h-5 w-5" aria-hidden />Both hashes matched. The price is agreed.</p>
            {(submitted?.priceHash ?? order.priceHash) && <HashBlock hash={(submitted?.priceHash ?? order.priceHash)!} />}
            <AgreedPrice orderId={order.orderId} />
            {fpoSide.length > 0 && <FpoSide events={fpoSide} />}
            {submitted?.state === 'AGREED' && <ReceiptCard receipt={submitted.receipt} title="Price agreement committed" />}
          </div>
        )}
      </div>
    </Section>
  );
}

function HashBlock({ hash }: { hash: string }) {
  return (
    <div className="rounded-md border border-line p-3" data-testid="price-hash">
      <p className="eyebrow">Hash on the ledger</p>
      <p className="mt-1"><Hash value={hash} label="Copy price hash" /></p>
      <p className="mt-2 max-w-prose text-sm text-ink-2">{SEALED_COPY}</p>
    </div>
  );
}

function FpoSide({ events, waiting }: { events: StreamEvent[]; waiting?: boolean }) {
  return (
    <div data-testid="fpo-side">
      <p className="eyebrow">FPO side, live</p>
      {events.length === 0 ? (
        <p className="mt-1 text-sm text-ink-2">{waiting ? 'Nothing from the FPO yet. This updates on its own when the FPO submits.' : 'No FPO activity seen on this page.'}</p>
      ) : (
        <ul className="mt-1 text-sm">
          {events.map((e) => (
            <li key={e.txId} className="flex flex-wrap items-center gap-2 py-1" data-testid="fpo-event">
              <span className="font-medium">{e.event === 'PriceAgreed' ? 'FPO price step committed' : e.event}</span>
              <ChannelChip channel={e.channel} /><span className="mono">block #{e.blockNumber}</span>
              <span className="text-ink-2">{formatDateTimeIST(e.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The agreed price from tradePricePDC (GET /orders/:id/price, FPO and buyer only) and the endorsers of the transaction that committed it. */
function AgreedPrice({ orderId }: { orderId: string }) {
  const price = useApi((s) => api.orderPrice(orderId, s), [orderId]);
  if (price.loading && !price.data) return <p className="text-sm text-ink-2">Reading the agreed price from the private data collection…</p>;
  if (price.error) return <p className="text-sm text-ink-2" data-testid="price-unavailable">The agreed price could not be read just now: {price.error.message}</p>;
  const p = price.data!;
  return (
    <div data-testid="agreed-price">
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="text-ink-2">Price per quintal</dt><dd className="text-lg font-semibold" data-testid="price-value">{formatINR(p.pricePerQtl)}</dd>
        <dt className="text-ink-2">Quantity</dt><dd>{formatQtl(p.quantityQtl)}</dd>
        <dt className="text-ink-2">Total</dt><dd className="font-medium" data-testid="price-total">{formatINR(p.totalAmount)}</dd>
        <dt className="text-ink-2">Agreed</dt><dd>{formatDateTimeIST(p.agreedAt)}</dd>
        <dt className="text-ink-2">Committed by</dt><dd><Endorsers proof={p.proof} /></dd>
      </dl>
      <div className="mt-3"><ProofButton proof={p.proof} label="Agreement proof" /></div>
    </div>
  );
}

/** Endorsing orgs read from the ledger transaction itself (GET /ledger/tx/:id). Expect FpoOrgMSP and BuyerOrgMSP on the trade channel. */
function Endorsers({ proof }: { proof: OrderPrice['proof'] | Proof }) {
  const tx = useApi((s) => api.ledgerTx(proof.txId, s), [proof.txId]);
  if (tx.data) return <span className="flex flex-wrap gap-1.5" data-testid="agreed-endorsers">{tx.data.endorsers.map((o) => <OrgBadge key={o} org={o} />)}</span>;
  return <span className="text-ink-2">{tx.error ? 'not available' : 'reading…'}</span>;
}

function Mismatch({ error, onAgain }: { error: ApiClientError; onAgain: () => void }) {
  return (
    <div className="card p-4" style={{ borderColor: 'var(--danger-text)' }} role="alert" data-testid="price-mismatch">
      <p className="flex items-center gap-2 text-sm font-semibold text-danger"><XCircle className="h-4 w-4" aria-hidden />The two prices do not match. Nothing was committed.</p>
      <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="text-ink-2">Error code</dt><dd><span className="mono font-semibold" data-testid="error-code">{error.code}</span></dd>
        {error.serverMessage && (<><dt className="text-ink-2">Ledger said</dt><dd className="mono break-words" data-testid="error-message">{error.serverMessage}</dd></>)}
      </dl>
      <p className="mt-3 max-w-prose text-sm">The ledger compared two hashes, not two prices, so it cannot say which side differs or by how much. Confirm the figure with the FPO outside this system, then each side submits again.</p>
      <button type="button" className="btn mt-3" onClick={onAgain} data-testid="price-again">Enter my price again</button>
    </div>
  );
}
