'use client';
import { useState } from 'react';
import Link from 'next/link';
import { formatDateIST, type CustodyHop, type LotPassport, type Role } from '@/contract/contract';
import { api, asApiError } from '@/lib/api';
import { formatCount, formatDateTimeIST, shortOrg } from '@/lib/format';
import { RequireAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { useReloadOnLedger } from '@/lib/ledgerEvents';
import { bankCollateralUrl } from '@/lib/portals';
import { Boundary, Skeleton } from '@/components/states';
import { ChannelChip, Chip, Field, GradeChip, Hash, Notice, PageHeader, ReceiptNote, Section, StatusChip } from '@/components/ui';
import { OpenIn, WriteButton } from '@/components/actions';
import { ProofButton } from '@/components/ProofDrawer';
import type { Receipted } from '@/contract/contract';

const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export function LotView({ sscc }: { sscc: string }) {
  return <RequireAuth>{(user) => <Lot sscc={sscc} role={user.role} />}</RequireAuth>;
}

function Lot({ sscc, role }: { sscc: string; role: Role }) {
  const lot = useApi((s) => api.lot(sscc, s), [sscc]);
  useReloadOnLedger(lot.reload, (e) => e.sscc === sscc);
  return (
    <Boundary state={lot} skeleton={<Skeleton className="h-64 w-full" />} notFoundTitle={`No lot ${sscc}`}>
      {(p) => <Passport p={p} role={role} reload={lot.reload} />}
    </Boundary>
  );
}

function Passport({ p, role, reload }: { p: LotPassport; role: Role; reload: () => void }) {
  const enwr = p.storage?.enwr;
  const lienActive = p.lien?.status === 'ACTIVE';
  return (
    <>
      <PageHeader eyebrow="Lot passport" title={<span className="mono">{p.humanRef}</span>}
        actions={<><StatusChip status={p.status} /><GradeChip grade={p.grade} /></>}>
        <span className="mono">{p.sscc}</span>
      </PageHeader>
      <div className="mb-5"><OpenIn sscc={p.sscc} enwr={enwr} role={role} /></div>

      {lienActive && (
        <Notice tone="warn" title="This lot is pledged to a bank" testId="pledged-notice">
          Lien {p.lien?.lienId} is active, so custody cannot move until the bank releases it.
          {enwr && <> <a href={bankCollateralUrl(enwr)} target="_blank" rel="noreferrer">Open the e-NWR in the bank portal</a>.</>}
        </Notice>
      )}

      <div className="grid gap-x-5 lg:grid-cols-2">
        <div>
          <Section title="Lot">
            <dl>
              <Field label="Crop">{title(p.commodity)}{p.variety ? `, ${p.variety}` : ''}</Field>
              <Field label="Village">{title(p.village)}</Field>
              <Field label="Bags">{p.bagCount}</Field>
              <Field label="Weight">{p.netKg ? `${formatCount(p.netKg)} kg weighed` : `${formatCount(p.estWeightKg)} kg estimated`}</Field>
              <Field label="Harvest or unloading">{formatDateIST(p.harvestOrUnloadDate)}</Field>
              <Field label="Pre-harvest interval">{p.phiCompliant === undefined ? <span className="text-ink-3">not recorded</span> : p.phiCompliant ? <Chip tone="ok">Compliant</Chip> : <Chip tone="danger">Breach</Chip>}</Field>
              <Field label="Residue tested">{p.residueTested === undefined ? <span className="text-ink-3">not recorded</span> : p.residueTested ? 'Yes' : 'No'}</Field>
            </dl>
          </Section>
          <Section title="Quality readings" aside={p.quality ? (p.quality.deviceVerified ? <Chip tone="ok">Device signatures verified by the ledger</Chip> : <Chip tone="warn">Not verified</Chip>) : undefined}>
            {p.quality ? <QualityBlock q={p.quality} /> : <p className="py-3 text-sm text-ink-2">Not weighed or graded yet. The operator does this on the Intake page.</p>}
          </Section>
          <Section title="Storage and lien">
            <dl>
              <Field label="Storage">{p.storage ? `${p.storage.facilityName}, deposited ${formatDateIST(p.storage.depositedAt)}` : <span className="text-ink-3">not deposited</span>}</Field>
              <Field label="e-NWR">{enwr ? <>{role === 'ceo' ? <Link className="mono" href={`/collateral/${enwr}`}>{enwr}</Link> : <span className="mono">{enwr}</span>} <Chip tone="warn">Simulated adapter ({p.storage?.repository})</Chip></> : <span className="text-ink-3">none</span>}</Field>
              <Field label="Lien">{p.lien ? <span className="inline-flex flex-wrap items-center gap-2"><Chip tone={lienActive ? 'warn' : undefined}>{p.lien.status.toLowerCase()}</Chip>{p.lien.lienId && <span className="mono">{p.lien.lienId}</span>}<ProofButton proof={p.lien.proof} label="Lien proof" /></span> : <span className="text-ink-3">none</span>}</Field>
              <Field label="Order">{p.order ? (role === 'ceo' ? <Link className="mono" href={`/orders/${p.order.orderId}`}>{p.order.orderId}</Link> : <span className="mono">{p.order.orderId}</span>) : <span className="text-ink-3">none</span>}</Field>
            </dl>
          </Section>
        </div>

        <div>
          {role === 'operator' && <DispatchPanel p={p} reload={reload} />}
          {role === 'ceo' && <TransformPanel p={p} reload={reload} />}
          {role === 'ceo' && p.status === 'SOLD' && <Notice>Dispatch is done by the operator, Debasis, from this page when he signs in.</Notice>}

          <Section title="Custody chain">
            {p.custody.length === 0 ? <p className="py-3 text-sm text-ink-2">Custody has not moved. It starts when the operator dispatches the lot.</p> : <CustodyTable hops={p.custody} />}
          </Section>
          <Section title="Cold chain" aside={p.coldChain ? (p.coldChain.continuous ? <Chip tone="ok">Continuous</Chip> : <Chip tone="danger">{p.coldChain.breaches} breach{p.coldChain.breaches === 1 ? '' : 'es'}</Chip>) : undefined}>
            {!p.coldChain || p.coldChain.digests.length === 0 ? <p className="py-3 text-sm text-ink-2">No condition digest has been anchored for this lot.</p> : (
              <table className="dtable"><thead><tr><th>Window</th><th className="num">Average</th><th>Proof</th></tr></thead>
                <tbody>{p.coldChain.digests.map((d) => <tr key={d.proof.txId}><td className="mono">{d.window}</td><td className="num">{d.avgC} °C</td><td><ProofButton proof={d.proof} /></td></tr>)}</tbody></table>
            )}
          </Section>
        </div>
      </div>

      <Section title="Documents" aside="SHA-256 hashes held on the ledger">
        {p.integrity.docs.length === 0 ? <p className="py-3 text-sm text-ink-2">No documents are attached.</p> : (
          <table className="dtable"><thead><tr><th>Document</th><th>SHA-256</th></tr></thead>
            <tbody>{p.integrity.docs.map((d) => <tr key={d.name}><td>{d.name}</td><td><Hash value={d.sha256} full={false} label="Copy hash" /></td></tr>)}</tbody></table>
        )}
        {p.integrity.merkleRoot && <p className="border-t border-line py-2 text-sm text-ink-2">Merkle root <span className="mono break-all">{p.integrity.merkleRoot}</span></p>}
        <p className="border-t border-line py-2 text-sm text-ink-3">Re-verify is not offered yet: the gateway has no endpoint that returns the document bytes to hash in the browser.</p>
      </Section>

      <Section title="Timeline" aside={`${p.proofs.length} transactions, oldest first`} id="timeline">
        {p.proofs.length === 0 ? <p className="py-3 text-sm text-ink-2">No transactions yet.</p> : (
          <ol className="divide-y divide-line">
            {p.proofs.map((pr, i) => (
              <li key={pr.txId} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="w-6 text-ink-3">{i + 1}</span><ChannelChip channel={pr.channel} /><span className="mono">block #{pr.blockNumber}</span>
                <Hash value={pr.txId} full={false} label="Copy transaction ID" /><span className="ml-auto"><ProofButton proof={pr} label="Open proof" /></span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}

function QualityBlock({ q }: { q: NonNullable<LotPassport['quality']> }) {
  const r = q.reading;
  return (
    <dl>
      <Field label="Weighbridge">{formatCount(q.weighbridge.grossKg)} kg gross, {formatCount(q.weighbridge.tareKg)} kg tare, <strong>{formatCount(q.weighbridge.netKg)} kg net</strong> <span className="mono text-ink-3">{q.weighbridge.deviceId}</span></Field>
      {r.potato && <Field label="Potato">size {r.potato.sizeGradeMm} mm, greening {r.potato.greeningPct}%, rot {r.potato.rotPct}%, cuts {r.potato.cutsPct}%</Field>}
      {r.paddy && <Field label="Paddy">moisture {r.paddy.moisturePct}%, foreign matter {r.paddy.foreignMatterPct}%, broken {r.paddy.brokenPct}%</Field>}
      {r.vegetable && <Field label="Vegetable">uniformity {r.vegetable.uniformityPct}%, damage {r.vegetable.damagePct}%</Field>}
      <Field label="Read at">{formatDateTimeIST(r.at)} <span className="mono text-ink-3">{r.deviceId}</span> <Chip tone="warn">Simulated device</Chip></Field>
    </dl>
  );
}

function CustodyTable({ hops }: { hops: CustodyHop[] }) {
  return (
    <table className="dtable"><thead><tr><th>From</th><th>To</th><th>Place</th><th>Proposed</th><th>Accepted</th><th>Proof</th></tr></thead>
      <tbody>{hops.map((h, i) => (
        <tr key={i}><td>{shortOrg(h.from)}</td><td>{shortOrg(h.to)}</td><td>{h.place}</td><td>{formatDateTimeIST(h.proposedAt)}</td>
          <td>{h.acceptedAt ? formatDateTimeIST(h.acceptedAt) : <Chip tone="warn">waiting</Chip>}</td><td><ProofButton proof={h.proof} /></td></tr>
      ))}</tbody></table>
  );
}

/** F4, FPO side. Offered for sold lots, and for any lot with an active lien so the ledger itself gives the refusal (ERR_LOT_PLEDGED). */
function DispatchPanel({ p, reload }: { p: LotPassport; reload: () => void }) {
  const [vehicleNo, setVehicleNo] = useState('');
  const [loggerId, setLoggerId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [receipt, setReceipt] = useState<Receipted<LotPassport> | null>(null);
  const enwr = p.storage?.enwr;
  const offered = p.status === 'SOLD' || p.lien?.status === 'ACTIVE';

  if (!offered) {
    return <Section title="Dispatch"><p className="py-3 text-sm text-ink-2" data-testid="dispatch-unavailable">Dispatch opens once the buyer and the CEO have agreed a price and the lot is sold. This lot is {p.status.replace(/_/g, ' ').toLowerCase()}.</p></Section>;
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setReceipt(null);
    try {
      const r = await api.proposeCustody(p.sscc, { toOrg: 'BuyerOrgMSP', vehicleNo: vehicleNo.trim(), loggerId: loggerId.trim() });
      setReceipt(r.data); reload();
    } catch (err) {
      const a = asApiError(err);
      setError({ code: a.code, message: a.code === 'ERR_LOT_PLEDGED' ? a.message : a.serverMessage ?? a.message });
    } finally { setBusy(false); }
  }
  return (
    <Section title="Dispatch to the buyer" aside="Proposes custody (F4). The buyer must accept." id="dispatch">
      <form onSubmit={submit} className="grid gap-3 py-3" data-testid="dispatch-form">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block text-sm font-medium" htmlFor="veh">Vehicle number</label><input id="veh" className="field" placeholder="WB-30-AB-1234" minLength={4} maxLength={20} required value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} /></div>
          <div><label className="mb-1 block text-sm font-medium" htmlFor="log">Temperature logger ID <Chip tone="warn">Simulated BLE logger</Chip></label><input id="log" className="field" placeholder="BLE-SIM-0042" minLength={2} maxLength={40} required value={loggerId} onChange={(e) => setLoggerId(e.target.value)} /></div>
        </div>
        <p className="text-sm text-ink-2">Goes to Gangetic Fresh Foods Pvt Ltd, Kolkata.</p>
        <div><WriteButton className="btn" data-variant="primary" disabled={busy} data-testid="dispatch-submit">{busy ? 'Submitting…' : 'Propose custody transfer'}</WriteButton></div>
        {error && (
          <Notice tone="danger" title={error.code === 'ERR_LOT_PLEDGED' ? 'The ledger refused: this lot is pledged (ERR_LOT_PLEDGED)' : 'The ledger refused this dispatch'} testId="dispatch-error">
            {error.message}
            {error.code === 'ERR_LOT_PLEDGED' && enwr && <> <a data-testid="release-link" href={bankCollateralUrl(enwr)} target="_blank" rel="noreferrer">Release the lien in the bank portal</a>, then try again.</>}
          </Notice>
        )}
        {receipt && <ReceiptNote r={receipt}>Custody proposed. The lot is in transit once the buyer accepts.</ReceiptNote>}
      </form>
    </Section>
  );
}

/** Grade B and C lots may be sent to processing (CEO only). */
function TransformPanel({ p, reload }: { p: LotPassport; reload: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipted<LotPassport> | null>(null);
  if (!(p.grade === 'B' || p.grade === 'C') || !['GRADED', 'IN_STORAGE'].includes(p.status)) return null;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { const r = await api.transform(p.sscc, { toProcessing: true, reason: reason.trim() }); setReceipt(r.data); reload(); }
    catch (err) { setError(asApiError(err).message); } finally { setBusy(false); }
  }
  return (
    <Section title="Send to processing" aside="Grade B and C lots only">
      <form onSubmit={submit} className="grid gap-3 py-3">
        <div><label className="mb-1 block text-sm font-medium" htmlFor="why">Reason</label><input id="why" className="field" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Below table-potato grade; route to chips processor" /></div>
        <div><WriteButton className="btn" disabled={busy}>{busy ? 'Submitting…' : 'Grade out to processing'}</WriteButton></div>
        {error && <Notice tone="danger">{error}</Notice>}
        {receipt && <ReceiptNote r={receipt}>The lot is now set aside for processing.</ReceiptNote>}
      </form>
    </Section>
  );
}
