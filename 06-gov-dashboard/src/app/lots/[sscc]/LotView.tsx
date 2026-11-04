'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { deepLink, formatDateIST, type LotPassport, type LotStatus, type PortalUrls, type Proof, type Role, type TxDetail } from '@/contract/contract';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { fnLabel } from '@/lib/explain';
import { channelShort, formatCount, formatDateTimeIST, shortOrg } from '@/lib/format';
import { ChannelChip, Chip, Field, Hash, OrgBadge, PageHeader, Section } from '@/components/ui';
import { Boundary, Skeleton, StateShell } from '@/components/states';

const STATUS_TONE: Partial<Record<LotStatus, 'ok' | 'warn' | 'danger' | 'accent'>> = {
  CLOSED: 'ok', SETTLED: 'ok', DELIVERED: 'ok', PLEDGED: 'accent', REJECTED: 'danger', UNVERIFIABLE: 'warn', TRANSFORMED: 'warn',
};
const READING_LABEL: Record<string, string> = {
  sizeGradeMm: 'Size grade', greeningPct: 'Greening', rotPct: 'Rot', cutsPct: 'Cuts', moisturePct: 'Moisture',
  foreignMatterPct: 'Foreign matter', brokenPct: 'Broken grain', uniformityPct: 'Uniformity', damagePct: 'Damage',
};
const READING_UNIT: Record<string, string> = { sizeGradeMm: ' mm', greeningPct: ' %', rotPct: ' %', cutsPct: ' %', moisturePct: ' %', foreignMatterPct: ' %', brokenPct: ' %', uniformityPct: ' %', damagePct: ' %' };
const yn = (v: boolean | undefined) => (v === undefined ? <span className="text-ink-3">Not recorded</span> : <Chip tone={v ? 'ok' : 'warn'}>{v ? 'Yes' : 'No'}</Chip>);

export function LotView({ sscc, role }: { sscc: string; role: Role }) {
  const state = useApi((s) => api.lot(sscc, s), [sscc]);
  return (
    <>
      <Link href="/ledger" className="mb-4 inline-flex min-h-10 items-center gap-1.5 text-sm no-underline"><ArrowLeft className="h-4 w-4" aria-hidden />Ledger Explorer</Link>
      <Boundary state={state} notFoundTitle="No lot with this SSCC" skeleton={<StateShell kind="loading" title="Loading lot" />}>
        {(lot) => <Lot lot={lot} role={role} />}
      </Boundary>
    </>
  );
}

function fpoLink(sscc: string): string | null {
  const fpo = process.env.NEXT_PUBLIC_URL_FPO;
  return fpo ? deepLink.fpoLot({ fpo } as PortalUrls, sscc) : null;
}

function Lot({ lot, role }: { lot: LotPassport; role: Role }) {
  const out = role === 'board' ? fpoLink(lot.sscc) : null; // the observer gets no links into other portals
  const q = lot.quality;
  return (
    <>
      <PageHeader eyebrow="Lot" title={<span className="flex flex-wrap items-center gap-3"><span className="mono text-2xl">{lot.humanRef}</span><Chip tone={STATUS_TONE[lot.status]}>{lot.status}</Chip>{lot.grade && <Chip>Grade {lot.grade}</Chip>}</span>}>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>SSCC <Hash value={lot.sscc} label="Copy SSCC" /></span>
          {out && <a href={out} className="inline-flex items-center gap-1 text-sm" rel="noopener">Open in FPO console <ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>}
        </span>
      </PageHeader>
      <p className="mb-6 max-w-3xl rounded-sm border border-line bg-surface px-3 py-2 text-sm text-ink-2" data-testid="role-note">
        {role === 'observer' ? 'Observer view.' : 'Board view.'} Farmer names and phone numbers, crop-diary detail, loan terms and sale prices are not shown on this page. Sales appear only as a hash of the agreed price.
      </p>

      <Section title="Lot">
        <dl>
          <Field label="Commodity">{lot.commodity.charAt(0) + lot.commodity.slice(1).toLowerCase()}{lot.variety ? `, ${lot.variety}` : ''}</Field>
          <Field label="Village">{lot.village.charAt(0) + lot.village.slice(1).toLowerCase()}</Field>
          <Field label="Farmer token"><span className="mono">{lot.farmerToken}</span> <span className="text-sm text-ink-3">pseudonymous; the ledger holds no name</span></Field>
          <Field label="Plot"><span className="mono">{lot.plotId}</span></Field>
          <Field label="Bags · est. weight">{lot.bagCount} bags · {formatCount(lot.estWeightKg)} kg{lot.netKg !== undefined && <> · graded net {formatCount(lot.netKg)} kg</>}</Field>
          <Field label="Harvest or unload date">{formatDateIST(lot.harvestOrUnloadDate)}</Field>
          <Field label="Residue tested">{yn(lot.residueTested)}</Field>
          <Field label="Pre-harvest interval respected">{yn(lot.phiCompliant)}</Field>
        </dl>
      </Section>

      <Section title="Timeline" aside={`${lot.proofs.length} transactions`}>
        <Timeline proofs={lot.proofs} />
      </Section>

      {q && (
        <Section title="Quality" aside={q.deviceVerified ? 'device signatures verified' : 'device signatures not verified'}>
          <dl>
            <Field label="Weighbridge"><span className="mono">{q.weighbridge.deviceId}</span> · gross {formatCount(q.weighbridge.grossKg)} kg − tare {formatCount(q.weighbridge.tareKg)} kg = <strong>{formatCount(q.weighbridge.netKg)} kg</strong> · {formatDateTimeIST(q.weighbridge.at)}</Field>
            <Field label="Quality meter"><span className="mono">{q.reading.deviceId}</span> · {formatDateTimeIST(q.reading.at)}</Field>
            {Object.entries({ ...q.reading.potato, ...q.reading.paddy, ...q.reading.vegetable }).map(([k, v]) => (
              <Field key={k} label={READING_LABEL[k] ?? k}><span className="mono">{String(v)}</span>{READING_UNIT[k] ?? ''}</Field>
            ))}
          </dl>
        </Section>
      )}

      {lot.storage && (
        <Section title="Storage">
          <dl>
            <Field label="Facility">{lot.storage.facilityName} <span className="text-ink-3">({lot.storage.facility === 'COLD_STORAGE' ? 'cold storage' : 'warehouse'})</span></Field>
            <Field label="Deposited">{formatDateTimeIST(lot.storage.depositedAt)}</Field>
            {lot.storage.enwr && <Field label="e-NWR"><span className="mono">{lot.storage.enwr}</span> {lot.storage.repository && <span className="text-sm text-ink-3">via {lot.storage.repository} (simulated adapter)</span>}</Field>}
          </dl>
        </Section>
      )}

      <Section title="Lien">
        <dl>
          <Field label="Status">{lot.lien ? <Chip tone={lot.lien.status === 'ACTIVE' ? 'accent' : undefined}>{lot.lien.status}</Chip> : <Chip>NONE</Chip>}</Field>
          {lot.lien?.lienId && <Field label="Lien ID"><span className="mono">{lot.lien.lienId}</span></Field>}
          {lot.lien?.bank && <Field label="Lender"><OrgBadge org={lot.lien.bank} full /></Field>}
          {lot.lien?.proof && <Field label="Proof"><ProofLink p={lot.lien.proof} /></Field>}
          <Field label="Loan terms"><span className="text-ink-2">Not visible to this role. They sit in private data shared by the FPO and the bank only.</span></Field>
        </dl>
      </Section>

      {lot.order && (
        <Section title="Sale">
          <dl>
            <Field label="Order"><span className="mono">{lot.order.orderId}</span> · {lot.order.channel.toLowerCase()} channel · {lot.order.settled ? 'settled' : 'not yet settled'}</Field>
            <Field label="Price hash">{lot.order.priceHash ? <Hash value={lot.order.priceHash} label="Copy price hash" /> : <span className="text-ink-2">Not shown to this role</span>}</Field>
            <Field label="Price"><span className="text-ink-2">Private. Only the FPO and the buyer can read it; the ledger shows this role the hash alone.</span></Field>
          </dl>
        </Section>
      )}

      {lot.custody.length > 0 && (
        <Section title="Custody">
          <ol className="divide-y divide-line">
            {lot.custody.map((h, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                <OrgBadge org={h.from} /> <span aria-hidden>→</span> <OrgBadge org={h.to} />
                <span className="text-ink-2">{h.place}</span>
                <span className="text-sm text-ink-3">proposed {formatDateTimeIST(h.proposedAt)}{h.acceptedAt ? `, accepted ${formatDateTimeIST(h.acceptedAt)}` : ', not yet accepted'}</span>
                {h.proof && <span className="ml-auto"><ProofLink p={h.proof} /></span>}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {lot.coldChain && (
        <Section title="Cold chain">
          <dl>
            <Field label="Continuous">{yn(lot.coldChain.continuous)}</Field>
            <Field label="Breaches">{lot.coldChain.breaches}</Field>
            {lot.coldChain.digests.map((d) => (
              <Field key={d.proof.txId} label={d.window}>average {d.avgC} °C · <ProofLink p={d.proof} /></Field>
            ))}
          </dl>
        </Section>
      )}

      <Section title="Document integrity">
        <dl>
          {lot.integrity.merkleRoot && <Field label="Merkle root"><Hash value={lot.integrity.merkleRoot} label="Copy Merkle root" /></Field>}
          {lot.integrity.docs.map((d) => <Field key={d.name} label={d.name}><Hash value={d.sha256} label={`Copy SHA-256 of ${d.name}`} /></Field>)}
        </dl>
        <p className="border-t border-line py-3 text-sm text-ink-2">SHA-256 of each document as anchored on the ledger. The documents themselves are not shown to this role.</p>
      </Section>
    </>
  );
}

function ProofLink({ p }: { p: Proof }) {
  return <Link className="mono text-sm" href={`/ledger/tx/${encodeURIComponent(p.txId)}`}>{p.txId.length > 18 ? `${p.txId.slice(0, 10)}…${p.txId.slice(-6)}` : p.txId}</Link>;
}

/** The lot's proofs are chronological. Each one is enriched with its function and time from GET /ledger/tx, six at a time. */
function Timeline({ proofs }: { proofs: Proof[] }) {
  const [details, setDetails] = useState<Record<string, TxDetail | null>>({});
  useEffect(() => {
    let stop = false;
    (async () => {
      for (let i = 0; i < proofs.length && !stop; i += 6) {
        const chunk = proofs.slice(i, i + 6);
        const got = await Promise.all(chunk.map((p) => api.ledgerTx(p.txId).then((r) => r.data).catch(() => null)));
        if (stop) return;
        setDetails((d) => ({ ...d, ...Object.fromEntries(chunk.map((p, j) => [p.txId, got[j] ?? null])) }));
      }
    })();
    return () => { stop = true; };
  }, [proofs]);

  if (proofs.length === 0) return <p className="py-3 text-sm text-ink-3">No transactions are recorded for this lot yet.</p>;
  return (
    <ol className="relative py-2" data-testid="timeline">
      {proofs.map((p, i) => {
        const d = details[p.txId];
        const pending = !(p.txId in details);
        return (
          <li key={`${p.txId}-${i}`} className="flex gap-3 py-2">
            <span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent-fg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {pending ? <Skeleton className="h-5 w-44" /> : <span className="font-medium">{d ? fnLabel(d.fn) : 'Transaction'}</span>}
                <ChannelChip channel={p.channel} />
                {d && <span className="text-sm text-ink-2">{formatDateTimeIST(d.timestamp)}</span>}
              </div>
              <p className="mt-0.5 text-sm text-ink-2">
                <Link className="mono" href={`/ledger/tx/${encodeURIComponent(p.txId)}`}>{p.txId.length > 18 ? `${p.txId.slice(0, 12)}…${p.txId.slice(-6)}` : p.txId}</Link>
                {' · '}<Link href={`/ledger/block/${p.channel}/${p.blockNumber}`}>{channelShort(p.channel)} block #{formatCount(p.blockNumber)}</Link>
                {d && <> · endorsed by {[...new Set(d.endorsers)].map((o) => shortOrg(o)).join(', ')}</>}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
