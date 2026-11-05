'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Printer, Scale, Gauge } from 'lucide-react';
import { isValidSscc, type Grade, type LotListItem, type LotPassport, type QualityReading, type Receipted, type SignedReading, type WeighbridgeReading } from '@/contract/contract';
import { api, asApiError } from '@/lib/api';
import { formatCount, formatDateTimeIST } from '@/lib/format';
import { RequireAuth } from '@/lib/auth';
import { proposeGrade } from '@/lib/grading';
import { useAllLots } from '@/lib/useAllLots';
import { useApi } from '@/lib/useApi';
import { Chip, Field, GradeChip, Notice, PageHeader, ReceiptNote, Section, StatusChip } from '@/components/ui';
import { SsccLink, WriteButton } from '@/components/actions';
import { Skeleton, StateShell } from '@/components/states';

export function IntakeView() {
  return <RequireAuth>{() => <Intake />}</RequireAuth>;
}

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

function Intake() {
  const lots = useAllLots();
  const [sscc, setSscc] = useState(useSearchParams().get('sscc') ?? '');
  const [typed, setTyped] = useState('');
  const pending = (lots.data?.items ?? []).filter((l) => l.status === 'PENDING_FARMER_SIGNATURE');
  const ready = (lots.data?.items ?? []).filter((l) => l.status === 'COMMISSIONED');

  return (
    <>
      <PageHeader eyebrow="Intake" title="Weigh, test and grade a lot">
        Pick a lot the farmer has already confirmed. Read the weighbridge (<kbd className="kbd">W</kbd>) and the quality meter (<kbd className="kbd">Q</kbd>), confirm the grade (<kbd className="kbd">G</kbd>), then print the label (<kbd className="kbd">P</kbd>).
      </PageHeader>
      <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
        <div>
          <Section title="Choose a lot">
            <form className="py-3" onSubmit={(e) => { e.preventDefault(); setSscc(typed.trim()); }}>
              <label className="mb-1 block text-sm font-medium" htmlFor="sscc">Type or scan an SSCC</label>
              <div className="flex gap-2"><input id="sscc" data-search className="field mono" inputMode="numeric" placeholder="18 digits" value={typed} onChange={(e) => setTyped(e.target.value)} /><button className="btn">Open</button></div>
              {typed.trim() !== '' && typed.trim().length === 18 && !isValidSscc(typed.trim()) && <p role="alert" className="mt-1 text-sm text-danger">The check digit does not match. Scan the label again.</p>}
            </form>
            <h3 className="mt-1 text-sm font-semibold text-ink-2">Ready to weigh ({ready.length})</h3>
            {lots.data ? (ready.length === 0 ? <p className="py-2 text-sm text-ink-2">No confirmed lot is waiting.</p> : <LotPicks lots={ready} current={sscc} onPick={setSscc} />) : <Skeleton className="my-2 h-12 w-full" />}
            <h3 className="mt-3 text-sm font-semibold text-ink-2">Waiting for the farmer ({pending.length})</h3>
            {pending.length === 0 ? <p className="py-2 text-sm text-ink-2">None. Drafts appear here until the farmer taps &quot;আমি নিশ্চিত করছি&quot; (I confirm) in the app, then move up automatically.</p> : (
              <ul className="divide-y divide-line pb-2" data-testid="waiting-list">{pending.map((l) => <li key={l.sscc} className="flex items-center justify-between gap-2 py-2 text-sm"><SsccLink sscc={l.sscc} humanRef={l.humanRef} /><Chip tone="warn">waiting for farmer signature</Chip></li>)}</ul>
            )}
          </Section>
        </div>
        <div>{sscc ? <Station key={sscc} sscc={sscc} /> : <StateShell kind="empty" title="No lot selected" body="Choose a lot on the left, or scan its SSCC." />}</div>
      </div>
    </>
  );
}

function LotPicks({ lots, current, onPick }: { lots: LotListItem[]; current: string; onPick: (s: string) => void }) {
  return (
    <ul className="divide-y divide-line pb-2" data-testid="ready-list">
      {lots.map((l) => (
        <li key={l.sscc}>
          <button type="button" className="flex w-full items-center justify-between gap-2 py-2 text-left" aria-pressed={current === l.sscc} onClick={() => onPick(l.sscc)}
            style={current === l.sscc ? { background: 'color-mix(in srgb, var(--accent-text) 8%, transparent)' } : undefined}>
            <span><span className="mono block text-sm font-medium">{l.humanRef}</span><span className="text-sm text-ink-3">{title(l.commodity)}, {l.bagCount} bags, {formatCount(l.estWeightKg)} kg est.</span></span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Station({ sscc }: { sscc: string }) {
  const lot = useApi((s) => api.lot(sscc, s), [sscc]);
  if (lot.error) return <StateShell kind={lot.error.code === 'ERR_NOT_FOUND' ? 'notfound' : 'error'} title={lot.error.code === 'ERR_NOT_FOUND' ? `No lot ${sscc}` : 'Could not load this lot'} body={lot.error.message} />;
  if (!lot.data) return <Skeleton className="h-64 w-full" />;
  return <Reading lot={lot.data} onGraded={lot.reload} />;
}

function Reading({ lot, onGraded }: { lot: LotPassport; onGraded: () => void }) {
  const [wb, setWb] = useState<SignedReading<WeighbridgeReading> | null>(null);
  const [qm, setQm] = useState<SignedReading<QualityReading> | null>(null);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipted<LotPassport> | null>(null);
  const [labelUrl, setLabelUrl] = useState<string | null>(null);

  const proposal = qm ? proposeGrade(lot.commodity, qm.reading) : null;
  const chosen = grade ?? proposal?.grade ?? null;
  const graded = receipt !== null;
  const canRead = lot.status === 'COMMISSIONED' && !graded;

  const readWb = useCallback(async () => {
    setBusy('wb'); setError(null);
    try { const r = await api.deviceRead('WB-CHG-01', lot.sscc); setWb(r.data as SignedReading<WeighbridgeReading>); } catch (e) { setError(asApiError(e).message); } finally { setBusy(null); }
  }, [lot.sscc]);
  const readQm = useCallback(async () => {
    setBusy('qm'); setError(null);
    try { const r = await api.deviceRead('QM-CHG-01', lot.sscc); setQm(r.data as SignedReading<QualityReading>); setGrade(null); } catch (e) { setError(asApiError(e).message); } finally { setBusy(null); }
  }, [lot.sscc]);
  const confirm = useCallback(async () => {
    if (!wb || !qm || !chosen) return;
    setBusy('grade'); setError(null);
    try { const r = await api.attestQuality(lot.sscc, { weighbridgeReading: wb, qualityReading: qm, grade: chosen }); setReceipt(r.data); onGraded(); }
    catch (e) { const a = asApiError(e); setError(a.serverMessage ?? a.message); } finally { setBusy(null); }
  }, [wb, qm, chosen, lot.sscc, onGraded]);
  const print = useCallback(async () => {
    setBusy('label'); setError(null);
    try { const blob = await api.labelPdf(lot.sscc); const url = URL.createObjectURL(blob); setLabelUrl(url); window.open(url, '_blank', 'noopener'); } catch (e) { setError(asApiError(e).message); } finally { setBusy(null); }
  }, [lot.sscc]);
  useEffect(() => () => { if (labelUrl) URL.revokeObjectURL(labelUrl); }, [labelUrl]);

  // keyboard-only operation during peak intake: always call the latest handlers
  const keys = useRef({ readWb, readQm, confirm, print, canRead, canGrade: canRead && !!wb && !!qm && !!chosen, canPrint: graded || lot.status === 'GRADED' });
  keys.current = { readWb, readQm, confirm, print, canRead, canGrade: canRead && !!wb && !!qm && !!chosen, canPrint: graded || lot.status === 'GRADED' };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const k = keys.current;
      const key = e.key.toLowerCase();
      if (key === 'w' && k.canRead) { e.preventDefault(); void k.readWb(); }
      if (key === 'q' && k.canRead) { e.preventDefault(); void k.readQm(); }
      if (key === 'g' && k.canGrade) { e.preventDefault(); void k.confirm(); }
      if (key === 'p' && k.canPrint) { e.preventDefault(); void k.print(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <div className="card mb-5 flex flex-wrap items-center justify-between gap-3 p-4" data-testid="station-lot">
        <div><p className="mono text-lg font-semibold">{lot.humanRef}</p><p className="text-sm text-ink-2"><span className="mono">{lot.sscc}</span> · {title(lot.commodity)}{lot.variety ? `, ${lot.variety}` : ''} · {title(lot.village)} · {lot.bagCount} bags · {formatCount(lot.estWeightKg)} kg estimated</p></div>
        <span className="flex gap-2"><StatusChip status={lot.status} /><GradeChip grade={lot.grade} /></span>
      </div>
      {lot.status !== 'COMMISSIONED' && !graded && (
        <Notice tone="warn" title={lot.status === 'PENDING_FARMER_SIGNATURE' ? 'Waiting for the farmer' : 'This lot cannot be graded now'}>
          {lot.status === 'PENDING_FARMER_SIGNATURE' ? 'The farmer has not confirmed this lot in the app yet. This page updates when the signature lands on the ledger.' : `Grading needs a lot in status commissioned; this one is ${lot.status.replace(/_/g, ' ').toLowerCase()}.`}
          {lot.grade && <> It is already graded {lot.grade}; you can still print its label.</>}
        </Notice>
      )}
      <div className="grid gap-x-5 md:grid-cols-2">
        <Section title="1. Weighbridge" aside={<kbd className="kbd">W</kbd>}>
          <div className="py-3">
            <WriteButton className="btn" disabled={!canRead || busy !== null} onClick={() => void readWb()} data-testid="read-wb"><Scale className="h-4 w-4" aria-hidden />{busy === 'wb' ? 'Reading…' : 'Read weighbridge'}</WriteButton>
            {wb && (
              <dl className="mt-3" data-testid="wb-reading">
                <Field label="Net weight"><strong>{formatCount(wb.reading.netKg)} kg</strong> <span className="text-ink-3">({formatCount(wb.reading.grossKg)} gross, {formatCount(wb.reading.tareKg)} tare)</span></Field>
                <Field label="Device"><span className="mono">{wb.deviceId}</span> <Chip tone="warn">Simulated device</Chip></Field>
                <SignedField at={wb.reading.at} sig={wb.signatureHex} />
              </dl>
            )}
          </div>
        </Section>
        <Section title="2. Quality meter" aside={<kbd className="kbd">Q</kbd>}>
          <div className="py-3">
            <WriteButton className="btn" disabled={!canRead || busy !== null} onClick={() => void readQm()} data-testid="read-qm"><Gauge className="h-4 w-4" aria-hidden />{busy === 'qm' ? 'Reading…' : 'Read quality meter'}</WriteButton>
            {qm && (
              <dl className="mt-3" data-testid="qm-reading">
                {qm.reading.potato && <Field label="Potato">size {qm.reading.potato.sizeGradeMm} mm, greening {qm.reading.potato.greeningPct}%, rot {qm.reading.potato.rotPct}%, cuts {qm.reading.potato.cutsPct}%</Field>}
                {qm.reading.paddy && <Field label="Paddy">moisture {qm.reading.paddy.moisturePct}%, foreign matter {qm.reading.paddy.foreignMatterPct}%, broken {qm.reading.paddy.brokenPct}%</Field>}
                {qm.reading.vegetable && <Field label="Vegetable">uniformity {qm.reading.vegetable.uniformityPct}%, damage {qm.reading.vegetable.damagePct}%</Field>}
                <Field label="Device"><span className="mono">{qm.deviceId}</span> <Chip tone="warn">Simulated device</Chip></Field>
                <SignedField at={qm.reading.at} sig={qm.signatureHex} />
              </dl>
            )}
          </div>
        </Section>
      </div>

      <Section title="3. Grade" aside={<kbd className="kbd">G</kbd>}>
        {!qm ? <p className="py-3 text-sm text-ink-2">Read the quality meter to get a proposed grade.</p> : !proposal ? <p className="py-3 text-sm text-ink-2">This reading has no values for a {title(lot.commodity)} lot. Read the meter again.</p> : (
          <div className="grid gap-3 py-3" data-testid="grade-proposal">
            <p className="text-sm">Proposed grade: <GradeChip grade={proposal.grade} /> <span className="text-ink-3">You can override it before confirming.</span></p>
            <details open>
              <summary className="cursor-pointer text-sm font-medium">Rule used</summary>
              <p className="mt-1 text-sm text-ink-2">{proposal.rule}</p>
              <ul className="mt-1 text-sm">{proposal.checks.map((c) => <li key={c.label}>{c.ok ? 'Met' : 'Not met'}: {c.label}</li>)}</ul>
              <p className="mt-1 text-xs text-ink-3">The ledger records the grade you confirm and does not recompute it. Thresholds marked demo are not an Indian standard.</p>
            </details>
            <fieldset className="flex items-center gap-4" disabled={graded}>
              <legend className="sr-only">Grade to record</legend>
              {(['A', 'B', 'C'] as Grade[]).map((g) => <label key={g} className="flex items-center gap-1.5 text-sm"><input type="radio" name="grade" checked={chosen === g} onChange={() => setGrade(g)} />Grade {g}</label>)}
            </fieldset>
            <div><WriteButton className="btn" data-variant="primary" disabled={!canRead || !wb || !chosen || busy !== null} onClick={() => void confirm()} data-testid="confirm-grade">{busy === 'grade' ? 'Submitting…' : `Confirm grade ${chosen ?? ''} and record on the ledger`}</WriteButton></div>
          </div>
        )}
        {error && <div className="pb-3"><Notice tone="danger" testId="intake-error">{error}</Notice></div>}
        {receipt && (
          <div className="pb-1" data-testid="grade-receipt">
            <ReceiptNote r={receipt}>Graded {receipt.resource.grade}. {receipt.resource.quality?.deviceVerified ? 'The chaincode verified both device signatures.' : ''}</ReceiptNote>
          </div>
        )}
      </Section>

      <Section title="4. Label" aside={<kbd className="kbd">P</kbd>}>
        <div className="py-3">
          <WriteButton className="btn" disabled={!(graded || lot.status === 'GRADED') || busy !== null} onClick={() => void print()} data-testid="print-label"><Printer className="h-4 w-4" aria-hidden />{busy === 'label' ? 'Preparing…' : 'Print label (100 × 50 mm)'}</WriteButton>
          {labelUrl && <p className="mt-2 text-sm">Label ready: <a href={labelUrl} target="_blank" rel="noreferrer" data-testid="label-link">open the PDF</a>. The gateway draws the QR for the consumer page, the SSCC and the human reference.</p>}
        </div>
      </Section>
    </>
  );
}

/** The browser cannot verify a device signature (the device public key is registered on the ledger, not sent here), so before F3 we only say what we hold. */
function SignedField({ at, sig }: { at: string; sig: string }) {
  return (
    <Field label="Signature">
      <Chip title="Checked by the chaincode when you confirm the grade">Signed reading received</Chip>
      <p className="mt-1 text-sm text-ink-3">{formatDateTimeIST(at)}. The ledger checks the signature when you confirm.</p>
      <p className="mono break-all text-ink-3">{sig.slice(0, 24)}…</p>
    </Field>
  );
}
