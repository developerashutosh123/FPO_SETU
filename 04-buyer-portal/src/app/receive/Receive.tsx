'use client';
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, CheckCircle2, Handshake, ShieldAlert, ShieldCheck } from 'lucide-react';
import { ORG_DISPLAY, type LedgerReceipt, type LotPassport } from '@/contract/contract';
import { api, asApiError, type ApiClientError } from '@/lib/api';
import { RequireAuth } from '@/lib/auth';
import { formatDateTimeIST, formatKg } from '@/lib/format';
import { commodityLabel } from '@/lib/labels';
import { DEMO_MODE } from '@/lib/portals';
import { ssccFromScan } from '@/lib/scan';
import { useApi } from '@/lib/useApi';
import { Boundary, StateShell } from '@/components/states';
import { useWritesEnabled, WRITES_PAUSED_REASON } from '@/components/AppShell';
import { GradeChip, LotStatusChip, ReceiptCard, WriteError } from '@/components/trade';
import { Hash, PageHeader, Section } from '@/components/ui';
import { ScanButton, Scanner } from './Scanner';

// The demo-only FPO attempt signs in as the FPO operator with the public demo password (contract section 5). The token is used once and never stored.
const FPO_DEMO_USER = { username: 'debasis.ops', password: 'Setu@2026' };

export function Receive() {
  return <RequireAuth>{() => <Inner />}</RequireAuth>;
}

function Inner() {
  const initial = ssccFromScan(useSearchParams().get('sscc') ?? '');
  const [sscc, setSscc] = useState<string | null>(initial);
  const [scanning, setScanning] = useState(false);
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const accept = useCallback((text: string) => {
    const s = ssccFromScan(text);
    if (s) { setSscc(s); setScanning(false); setNote(null); setTyped(''); } else setNote('That code is not a lot label from this network. Scan the QR on the crate label, or type the 18-digit SSCC printed next to it.');
  }, []);

  return (
    <>
      <PageHeader eyebrow="Receive shipment" title="Scan the crate label, then accept the lot">
        The label QR resolves to the lot&apos;s SSCC. You then accept custody and, once you have checked the goods, quality. Each acceptance is a transaction your organisation signs.
      </PageHeader>

      <Section title="1. Find the lot">
        <div className="py-4">
          {scanning ? (
            <Scanner onText={accept} onClose={() => setScanning(false)} />
          ) : (
            <div className="flex flex-wrap items-center gap-3"><ScanButton onClick={() => { setScanning(true); setNote(null); }} /><span className="text-sm text-ink-2">or type the SSCC printed next to the QR</span></div>
          )}
          <form className="mt-4 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); accept(typed); }}>
            <label htmlFor="sscc" className="sr-only">SSCC from the label</label>
            <input id="sscc" className="field max-w-sm" inputMode="numeric" autoComplete="off" placeholder="18-digit SSCC, e.g. 089012340000004616" value={typed} onChange={(e) => setTyped(e.target.value)} />
            <button className="btn" data-testid="lookup">Look up</button>
          </form>
          {note && <p className="mt-2 text-sm text-danger" role="alert" data-testid="scan-note">{note}</p>}
        </div>
      </Section>

      {sscc ? <Shipment key={sscc} sscc={sscc} /> : (
        <StateShell kind="empty" title="No lot yet" body="Scan a label or type an SSCC. A lot dispatched to you by the FPO shows here with its custody transfer." />
      )}
    </>
  );
}

function Shipment({ sscc }: { sscc: string }) {
  const lot = useApi((s) => api.lot(sscc, s), [sscc]);
  return (
    <Boundary state={lot} skeleton={<StateShell kind="loading" title="Looking up the lot" />} notFoundTitle="No lot with this SSCC">
      {(l) => <Steps lot={l} reload={lot.reload} />}
    </Boundary>
  );
}

function Steps({ lot, reload }: { lot: LotPassport; reload: () => void }) {
  const writes = useWritesEnabled();
  const [custody, setCustody] = useState<LedgerReceipt | null>(null);
  const [quality, setQuality] = useState<LedgerReceipt | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<'custody' | 'quality' | 'fpo' | null>(null);
  const [error, setError] = useState<{ step: 'custody' | 'quality'; err: ApiClientError } | null>(null);
  const [fpoTry, setFpoTry] = useState<{ err?: ApiClientError; unexpected?: boolean } | null>(null);

  const hop = lot.custody.at(-1);
  const orderId = lot.order?.orderId;
  const custodyDone = custody !== null || lot.status === 'DELIVERED';
  const canAcceptCustody = lot.status === 'IN_TRANSIT' && !custody;

  async function acceptCustody() {
    setBusy('custody'); setError(null);
    try { const { data } = await api.acceptCustody(lot.sscc); const { resource: _r, ...receipt } = data; setCustody(receipt); reload(); }
    catch (e) { setError({ step: 'custody', err: asApiError(e) }); } finally { setBusy(null); }
  }
  async function acceptQuality() {
    if (!orderId) return;
    setBusy('quality'); setError(null);
    try { const { data } = await api.acceptQuality(orderId, { accepted: true, notes: notes.trim() || undefined }); const { resource: _r, ...receipt } = data; setQuality(receipt); }
    catch (e) { setError({ step: 'quality', err: asApiError(e) }); } finally { setBusy(null); }
  }
  /** Demo only: the same call with the FPO operator's token. The ledger must refuse it, and the lot must stay where it was. */
  async function tryAsFpo() {
    setBusy('fpo'); setFpoTry(null);
    try {
      const { data: login } = await api.login(FPO_DEMO_USER.username, FPO_DEMO_USER.password, 'fpo');
      await api.acceptCustody(lot.sscc, login.token);
      setFpoTry({ unexpected: true }); reload();
    } catch (e) { setFpoTry({ err: asApiError(e) }); reload(); } finally { setBusy(null); }
  }

  return (
    <>
      <Section title="The lot" aside={<LotStatusChip status={lot.status} />}>
        <dl className="py-1">
          <div className="grid gap-1 border-b border-line py-3 sm:grid-cols-[11rem_1fr] sm:gap-4"><dt className="text-sm text-ink-2">Lot</dt>
            <dd><span className="font-medium">{commodityLabel(lot.commodity)}{lot.variety ? ` · ${lot.variety}` : ''}</span> <GradeChip grade={lot.grade} />
              <span className="mono mt-1 block break-all text-ink-2" data-testid="receive-ref">{lot.humanRef}</span></dd></div>
          <div className="grid gap-1 border-b border-line py-3 sm:grid-cols-[11rem_1fr] sm:gap-4"><dt className="text-sm text-ink-2">SSCC</dt><dd><Hash value={lot.sscc} label="Copy SSCC" /></dd></div>
          <div className="grid gap-1 border-b border-line py-3 sm:grid-cols-[11rem_1fr] sm:gap-4"><dt className="text-sm text-ink-2">Net weight at dispatch</dt><dd>{lot.netKg !== undefined ? formatKg(lot.netKg) : 'not weighed'}</dd></div>
          <div className="grid gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4"><dt className="text-sm text-ink-2">Custody transfer</dt>
            <dd>{hop ? <><span data-testid="hop">{ORG_DISPLAY[hop.from]} to {ORG_DISPLAY[hop.to]}</span><span className="block text-sm text-ink-2">{hop.place} · proposed {formatDateTimeIST(hop.proposedAt)}</span></> : <span className="text-ink-2">None proposed</span>}</dd></div>
        </dl>
        <p className="pb-3 text-sm"><Link href={`/lots/${lot.sscc}`}>Open the full spec sheet <ArrowRight className="inline h-3.5 w-3.5" aria-hidden /></Link></p>
      </Section>

      {lot.status !== 'IN_TRANSIT' && lot.status !== 'DELIVERED' && !custody ? (
        <StateShell kind="empty" title={lot.status === 'SOLD' || lot.status === 'LISTED' ? 'This lot has not been dispatched yet' : 'This lot is not in transit to you'}
          body={`The ledger shows this lot as ${lot.status.toLowerCase().replace(/_/g, ' ')}. Custody can be accepted only after the FPO proposes the transfer to your organisation.`} />
      ) : (
        <>
          <Section title="2. Accept custody" aside="F4">
            <div className="space-y-4 py-4">
              <p className="max-w-prose text-sm" data-testid="why-buyer-signs">
                <Handshake className="mr-1.5 inline h-4 w-4 align-text-bottom" aria-hidden />
                This only succeeds because your own organisation signs it. When the FPO proposed the transfer, the ledger required both organisations on this lot from then on, and the chaincode checks that the accepting organisation is the one the proposal names. The FPO cannot assert that you received the goods.
              </p>
              {custodyDone ? (
                <p className="flex items-center gap-2 font-medium text-ok" data-testid="custody-done"><CheckCircle2 className="h-5 w-5" aria-hidden />Custody accepted.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <button className="btn" data-variant="primary" disabled={!canAcceptCustody || busy !== null || !writes} title={!writes ? WRITES_PAUSED_REASON : undefined} onClick={acceptCustody} data-testid="accept-custody">
                    {busy === 'custody' ? 'Submitting…' : 'Accept custody'}
                  </button>
                  {!writes && <span className="text-sm text-warn">{WRITES_PAUSED_REASON}</span>}
                </div>
              )}
              {error?.step === 'custody' && <WriteError error={error.err} title="The ledger did not accept custody" />}
              {custody && <ReceiptCard receipt={custody} title="Custody accepted" />}

              {DEMO_MODE && canAcceptCustody && (
                <div className="rounded-md border border-dashed border-line p-3" data-testid="fpo-attempt">
                  <p className="eyebrow">Demo only</p>
                  <p className="mt-1 text-sm text-ink-2">Sign in as the FPO operator for one request and try to accept this custody on your behalf. The ledger should refuse it.</p>
                  <button className="btn mt-2" disabled={busy !== null || !writes} title={!writes ? WRITES_PAUSED_REASON : undefined} onClick={tryAsFpo} data-testid="try-fpo">
                    <ShieldAlert className="h-4 w-4" aria-hidden />{busy === 'fpo' ? 'Trying…' : 'Try accepting as the FPO (should fail)'}
                  </button>
                  {fpoTry?.err && <FpoRefused err={fpoTry.err} status={lot.status} />}
                  {fpoTry?.unexpected && <p className="mt-3 text-sm font-semibold text-danger" role="alert" data-testid="fpo-unexpected">The ledger accepted a call it should have refused. Tell the project team.</p>}
                </div>
              )}
            </div>
          </Section>

          <Section title="3. Accept quality" aside="After you check the goods">
            <div className="space-y-4 py-4">
              {!custodyDone ? (
                <p className="text-sm text-ink-2">Available after custody is accepted.</p>
              ) : !orderId ? (
                <p className="text-sm text-warn" role="alert">This lot is not attached to an order on the ledger, so quality cannot be accepted here.</p>
              ) : quality ? (
                <p className="flex items-center gap-2 font-medium text-ok" data-testid="quality-done"><CheckCircle2 className="h-5 w-5" aria-hidden />Quality accepted for order {orderId}.</p>
              ) : (
                <>
                  <p className="max-w-prose text-sm text-ink-2">Accepting quality tells the ledger the goods match the spec sheet. It is recorded on the trade channel for order <Link href={`/orders/${orderId}`} className="mono">{orderId}</Link>.</p>
                  <label className="block max-w-lg text-sm font-medium" htmlFor="notes">Notes for the FPO (optional)
                    <textarea id="notes" className="field mt-1 !h-auto py-2" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </label>
                  <button className="btn" data-variant="primary" disabled={busy !== null || !writes} title={!writes ? WRITES_PAUSED_REASON : undefined} onClick={acceptQuality} data-testid="accept-quality">
                    {busy === 'quality' ? 'Submitting…' : 'Accept quality'}
                  </button>
                </>
              )}
              {error?.step === 'quality' && <WriteError error={error.err} title="The ledger did not record quality acceptance" />}
              {quality && (
                <>
                  <ReceiptCard receipt={quality} title="Quality accepted" />
                  <p className="text-sm"><Link href={`/orders/${orderId}`}>Back to order {orderId} <ArrowRight className="inline h-3.5 w-3.5" aria-hidden /></Link></p>
                </>
              )}
            </div>
          </Section>
        </>
      )}
    </>
  );
}

/** What the ledger said when the FPO tried to accept for the buyer. Shows the code as returned, then reads the lot again to show it did not move. */
function FpoRefused({ err, status }: { err: ApiClientError; status: LotPassport['status'] }) {
  return (
    <div className="mt-3 rounded-md border p-3" style={{ borderColor: 'var(--danger-text)' }} role="alert" data-testid="fpo-refused">
      <p className="flex items-center gap-2 text-sm font-semibold text-danger"><ShieldCheck className="h-4 w-4" aria-hidden />Refused, as it should be.</p>
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="text-ink-2">Error code</dt><dd><span className="mono font-semibold" data-testid="fpo-error-code">{err.code}</span></dd>
        {err.serverMessage && (<><dt className="text-ink-2">Ledger said</dt><dd className="mono break-words" data-testid="fpo-error-message">{err.serverMessage}</dd></>)}
        <dt className="text-ink-2">Lot status now</dt><dd><LotStatusChip status={status} /></dd>
      </dl>
      <p className="mt-2 max-w-prose text-sm">
        <span className="mono">ERR_UNILATERAL_CUSTODY</span> is the chaincode&apos;s refusal when an organisation other than the named buyer tries to accept. The gateway can refuse earlier, on the caller&apos;s role (<span className="mono">ERR_FORBIDDEN_ROLE</span>). Either way the lot stays in transit until your organisation accepts.
      </p>
    </div>
  );
}
