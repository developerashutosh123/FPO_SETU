'use client';
import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowRight, ExternalLink, FlaskConical, ShieldCheck, Sprout, Snowflake, BadgeCheck } from 'lucide-react';
import { ORG_DISPLAY, isValidSscc, type LotPassport, type QualityReading, type Village } from '@/contract/contract';
import { api } from '@/lib/api';
import { RequireAuth } from '@/lib/auth';
import { formatDateTimeIST, formatDay, formatKg, formatQtl } from '@/lib/format';
import { commodityLabel, villageFallbackName } from '@/lib/labels';
import { consumerUrl, fpoOrderUrl, govLotUrl, govTxUrl } from '@/lib/portals';
import { useApi } from '@/lib/useApi';
import { Boundary, Skeleton, StateShell } from '@/components/states';
import { ProofButton } from '@/components/ProofDrawer';
import { GradeChip, LotStatusChip } from '@/components/trade';
import { ChannelChip, Chip, Field, Hash, PageHeader, Section } from '@/components/ui';
import { Reverify } from '@/components/lot/Reverify';

const OriginMap = dynamic(() => import('@/components/lot/OriginMap'), { ssr: false, loading: () => <Skeleton className="h-[260px] w-full" /> });
const ColdChainChart = dynamic(() => import('@/components/lot/ColdChainChart'), { ssr: false, loading: () => <Skeleton className="h-[240px] w-full" /> });

export function LotSpec({ sscc }: { sscc: string }) {
  return <RequireAuth>{() => <Inner sscc={sscc} />}</RequireAuth>;
}

function Inner({ sscc }: { sscc: string }) {
  if (!isValidSscc(sscc)) {
    return <StateShell kind="notfound" title="That is not a valid SSCC" body="An SSCC is 18 digits and ends in a check digit, for example 089012340000004517. Check the link or the label." action={<Link className="btn no-underline" href="/">Back to the catalogue</Link>} />;
  }
  return <Loaded sscc={sscc} />;
}

function Loaded({ sscc }: { sscc: string }) {
  const lot = useApi((s) => api.lot(sscc, s), [sscc]);
  const villages = useApi((s) => api.villages(s), []);
  return (
    <Boundary state={lot} skeleton={<StateShell kind="loading" title="Loading the spec sheet" />} notFoundTitle="No lot with this SSCC">
      {(l) => <Sheet lot={l} village={villages.data?.find((v) => v.code === l.village)} />}
    </Boundary>
  );
}

const READING_FIELDS: Record<'potato' | 'paddy' | 'vegetable', [string, string][]> = {
  potato: [['sizeGradeMm', 'Size grade (mm)'], ['greeningPct', 'Greening (%)'], ['rotPct', 'Rot (%)'], ['cutsPct', 'Cuts (%)']],
  paddy: [['moisturePct', 'Moisture (%)'], ['foreignMatterPct', 'Foreign matter (%)'], ['brokenPct', 'Broken grain (%)']],
  vegetable: [['uniformityPct', 'Uniformity (%)'], ['damagePct', 'Damage (%)']],
};
function readingRows(r: QualityReading): [string, string | number][] {
  for (const kind of ['potato', 'paddy', 'vegetable'] as const) {
    const block = r[kind] as Record<string, string | number> | undefined;
    if (block) return READING_FIELDS[kind].map(([k, label]) => [label, block[k] ?? '–']);
  }
  return [];
}

/** "2026-11-13T22:00Z/2026-11-13T23:53Z" -> its start as a short axis label. */
function windowLabel(w: string): string {
  const start = w.split('/')[0] ?? w;
  const d = new Date(start);
  return Number.isNaN(d.getTime()) ? start : formatDateTimeIST(d.toISOString()).slice(0, 16).replace(' ', ' · ');
}

function Sheet({ lot, village }: { lot: LotPassport; village?: Village }) {
  const villageName = village?.name ?? villageFallbackName(lot.village);
  const points = useMemo(() => (lot.coldChain?.digests ?? []).map((d) => ({ label: windowLabel(d.window), avgC: d.avgC, window: d.window })), [lot.coldChain]);
  const q = lot.quality;

  return (
    <>
      <PageHeader eyebrow="Lot spec sheet" title={<>{commodityLabel(lot.commodity)}{lot.variety ? ` · ${lot.variety}` : ''}</>}>
        <span className="mono break-all" data-testid="lot-ref">{lot.humanRef}</span>
        <span className="mt-2 flex flex-wrap items-center gap-2">
          <GradeChip grade={lot.grade} /><LotStatusChip status={lot.status} />
          <span className="text-sm">SSCC <Hash value={lot.sscc} label="Copy SSCC" /></span>
        </span>
      </PageHeader>

      <div className="mb-6 flex flex-wrap gap-2" aria-label="Open in other portals" data-testid="open-in">
        <a className="btn no-underline" href={consumerUrl(lot.sscc)} target="_blank" rel="noreferrer">Consumer page <ExternalLink className="h-4 w-4" aria-hidden /></a>
        <a className="btn no-underline" href={govLotUrl(lot.sscc)} target="_blank" rel="noreferrer">Gov explorer: lot <ExternalLink className="h-4 w-4" aria-hidden /></a>
        {lot.order && <a className="btn no-underline" href={fpoOrderUrl(lot.order.orderId)} target="_blank" rel="noreferrer">FPO console: order <ExternalLink className="h-4 w-4" aria-hidden /></a>}
        {lot.order && <Link className="btn no-underline" href={`/orders/${lot.order.orderId}`}>Our order {lot.order.orderId}<ArrowRight className="h-4 w-4" aria-hidden /></Link>}
        {lot.status === 'IN_TRANSIT' && <Link className="btn no-underline" data-variant="primary" href={`/receive?sscc=${lot.sscc}`}>Receive this lot<ArrowRight className="h-4 w-4" aria-hidden /></Link>}
      </div>

      <Section title="Specification">
        <dl>
          <Field label="Commodity and variety">{commodityLabel(lot.commodity)}{lot.variety ? `, ${lot.variety}` : ''}</Field>
          <Field label="Grade">{lot.grade ? `Grade ${lot.grade}, assigned from signed device readings` : 'Not graded yet'}</Field>
          <Field label="Net weight">{lot.netKg !== undefined ? <span data-testid="net-weight">{formatKg(lot.netKg)} <span className="text-ink-2">({formatQtl(lot.netKg / 100)} · {lot.bagCount} bags)</span></span> : <span className="text-ink-2">Not weighed yet. Estimated {formatKg(lot.estWeightKg)} in {lot.bagCount} bags.</span>}</Field>
          <Field label="Harvest or unloading date">{formatDay(lot.harvestOrUnloadDate)}</Field>
          {lot.storage && <Field label="Stored at">{lot.storage.facilityName}, since {formatDay(lot.storage.depositedAt)}</Field>}
        </dl>
      </Section>

      <Section title="Origin" aside={village ? village.block : undefined}>
        <div className="grid gap-4 py-3 md:grid-cols-[1fr_1.4fr]">
          <dl>
            <Field label="Village">{villageName}</Field>
            {village && <Field label="Block">{village.block}, Paschim Medinipur</Field>}
            <Field label="Farmer">Identified on the ledger by a pseudonymous token only. Names stay with the FPO.</Field>
          </dl>
          <div>
            {village ? (
              <>
                <div className="overflow-hidden rounded-md border border-line" data-testid="origin-map"><OriginMap lat={village.lat} lon={village.lon} label={`${villageName}, ${village.block}`} /></div>
                <p className="mt-2 text-xs text-ink-2" data-testid="map-caption">
                  {village.precision === 'BLOCK_CENTROID'
                    ? `Pin is the ${village.block} block centre. ${villageName} is not mapped in OpenStreetMap, so this is not the village location.`
                    : `Pin is a mapped landmark in ${villageName}, not the village centre. Plot coordinates are never shown.`}
                </p>
              </>
            ) : (
              <StateShell kind="empty" title="Map not available" body="The village list could not be loaded. The origin village is named on the left." />
            )}
          </div>
        </div>
      </Section>

      <Section title="Quality readings" aside={q ? (q.deviceVerified ? 'Device-signed' : 'Not device-verified') : undefined}>
        {q ? (
          <div className="grid gap-x-8 py-1 md:grid-cols-2">
            <div>
              <p className="eyebrow mt-3">Weighbridge · <span className="mono">{q.weighbridge.deviceId}</span></p>
              <dl>
                <Field label="Gross">{formatKg(q.weighbridge.grossKg)}</Field>
                <Field label="Tare">{formatKg(q.weighbridge.tareKg)}</Field>
                <Field label="Net">{formatKg(q.weighbridge.netKg)}</Field>
                <Field label="Read at">{formatDateTimeIST(q.weighbridge.at)}</Field>
              </dl>
            </div>
            <div>
              <p className="eyebrow mt-3">Quality meter · <span className="mono">{q.reading.deviceId}</span></p>
              <dl>
                {readingRows(q.reading).map(([label, v]) => <Field key={label} label={label}>{v}</Field>)}
                <Field label="Read at">{formatDateTimeIST(q.reading.at)}</Field>
              </dl>
            </div>
            <div className="pb-3 md:col-span-2">
              {q.deviceVerified
                ? <Chip tone="ok" title="The device signed these readings and the chaincode verified the signature"><BadgeCheck className="h-3.5 w-3.5" aria-hidden />Device-verified</Chip>
                : <Chip tone="warn">Not device-verified</Chip>}
            </div>
          </div>
        ) : (
          <p className="py-4 text-ink-2">No device readings are on the ledger for this lot yet.</p>
        )}
      </Section>

      <Section title="Compliance">
        <dl>
          <Field label="Pre-harvest interval (PHI)">
            {lot.phiCompliant === undefined ? <span className="text-ink-2">Not assessed</span>
              : lot.phiCompliant ? <Chip tone="ok"><Sprout className="h-3 w-3" aria-hidden />PHI compliant</Chip>
              : <Chip tone="warn"><Sprout className="h-3 w-3" aria-hidden />PHI not met</Chip>}
            <p className="mt-1 text-sm text-ink-2">The flag is all you see. The farmer&apos;s crop diary stays private to the farmer and the FPO.</p>
          </Field>
          <Field label="Residue credential">
            {lot.residueTested ? <Chip tone="ok"><FlaskConical className="h-3 w-3" aria-hidden />Residue tested</Chip> : <Chip><ShieldCheck className="h-3 w-3" aria-hidden />No residue credential</Chip>}
          </Field>
        </dl>
      </Section>

      <Section title="Custody chain">
        {lot.custody.length === 0 ? (
          <p className="py-4 text-ink-2" data-testid="no-custody">No custody transfer yet. The lot is still with the FPO{lot.storage ? ` at ${lot.storage.facilityName}` : ''}.</p>
        ) : (
          <ol className="py-2" data-testid="custody-chain">
            {lot.custody.map((h, i) => (
              <li key={i} className="grid gap-1 border-b border-line py-3 last:border-b-0 sm:grid-cols-[1fr_auto] sm:gap-4">
                <div>
                  <p className="font-medium">{ORG_DISPLAY[h.from]} <span className="text-ink-3">to</span> {ORG_DISPLAY[h.to]}</p>
                  <p className="text-sm text-ink-2">{h.place}</p>
                  <p className="mt-1 text-sm">Proposed {formatDateTimeIST(h.proposedAt)}{' · '}
                    {h.acceptedAt ? <span className="text-ok">accepted {formatDateTimeIST(h.acceptedAt)}</span> : <span className="text-warn">awaiting acceptance by the buyer</span>}
                  </p>
                </div>
                <div><ProofButton proof={h.proof} label="Custody proof" /></div>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Cold chain" aside={lot.coldChain ? `${lot.coldChain.digests.length} anchored ${lot.coldChain.digests.length === 1 ? 'window' : 'windows'}` : undefined}>
        {!lot.coldChain ? (
          <p className="py-4 text-ink-2">No condition digest has been anchored for this lot.</p>
        ) : (
          <div className="py-3">
            <div className="mb-3 flex flex-wrap gap-2" data-testid="coldchain-summary">
              {lot.coldChain.continuous
                ? <Chip tone="ok"><Snowflake className="h-3 w-3" aria-hidden />Continuous: no breach recorded</Chip>
                : <Chip tone="danger"><Snowflake className="h-3 w-3" aria-hidden />{lot.coldChain.breaches} {lot.coldChain.breaches === 1 ? 'breach' : 'breaches'} recorded</Chip>}
            </div>
            {lot.coldChain.breaches > 0 && (
              <p className="mb-3 text-sm text-danger" role="note">The passport counts breaches for the whole lot but does not say which window each belongs to. Open the digest proofs below to check each one.</p>
            )}
            <ColdChainChart points={points} />
            <div className="scroll-x mt-3">
              <table className="dtable" data-testid="digest-table">
                <caption className="sr-only">Anchored condition digests</caption>
                <thead><tr><th>Window (UTC)</th><th className="num">Average</th><th>Proof</th></tr></thead>
                <tbody>
                  {lot.coldChain.digests.map((d) => (
                    <tr key={d.proof.txId}>
                      <td className="mono">{d.window}</td>
                      <td className="num">{d.avgC} °C</td>
                      <td><ProofButton proof={d.proof} label="Digest proof" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      <Section title="Documents" aside={lot.integrity.merkleRoot ? 'Hashes anchored on the ledger' : undefined}>
        <div className="py-2">
          {lot.integrity.docs.length === 0 && <p className="py-2 text-ink-2">No documents are anchored for this lot.</p>}
          <ul>
            {lot.integrity.docs.map((d) => (
              <li key={d.name} className="border-b border-line py-3 last:border-b-0" data-testid="doc">
                <p className="font-medium">{d.name}</p>
                <p className="mt-1 text-sm text-ink-2">SHA-256 on the ledger</p>
                <p className="mono break-all text-sm" data-testid="doc-hash">{d.sha256}</p>
                {d.viewable
                  ? <Reverify docName={d.name} onChainSha256={d.sha256} />
                  : <p className="mt-1 text-sm text-ink-2">Not shared with your organisation, so it cannot be re-verified here.</p>}
              </li>
            ))}
          </ul>
          {lot.integrity.merkleRoot && (
            <p className="mt-2 pb-2 text-sm"><span className="text-ink-2">Merkle root of all documents: </span><span className="mono break-all">{lot.integrity.merkleRoot}</span></p>
          )}
          <p className="pb-2 text-xs text-ink-2">Re-verify: choose your copy of the file. Your browser hashes it and compares it with the hash above. The file is not uploaded.</p>
        </div>
      </Section>

      <Section title="Every proof" aside={`${lot.proofs.length} transactions, oldest first`}>
        <div className="scroll-x py-2">
          <table className="dtable" data-testid="proof-table">
            <caption className="sr-only">Ledger transactions that touched this lot</caption>
            <thead><tr><th>#</th><th>Channel</th><th className="num">Block</th><th>Transaction</th><th><span className="sr-only">Details</span></th></tr></thead>
            <tbody>
              {lot.proofs.map((p, i) => (
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
