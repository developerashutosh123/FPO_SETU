import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Database, XCircle } from 'lucide-react';
import { ORG_DISPLAY, type OrgMsp } from '@/contract/contract';
import { api, asApiError } from '@/lib/api';
import { subjectsOf, summarizeTx } from '@/lib/explain';
import { channelShort, formatCount, formatDateTimeIST } from '@/lib/format';
import { ChannelChip, Chip, Field, Hash, OrgBadge, PageHeader, Section } from '@/components/ui';
import { StateShell } from '@/components/states';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ txId: string }> }) {
  const { txId } = await params;
  return { title: `Transaction ${txId.length > 20 ? `${txId.slice(0, 12)}…` : txId}` };
}

/** Keys that hold only a hash of private data (price in tradePricePDC, loan terms in loanTermsPDC). */
const isPrivateHashKey = (k: string) => k.startsWith('$$h$');

export default async function TxPage({ params }: { params: Promise<{ txId: string }> }) {
  const { txId: raw } = await params;
  const txId = decodeURIComponent(raw);
  let result;
  try { result = await api.ledgerTx(txId); } catch (e) {
    const err = asApiError(e);
    if (err.code === 'ERR_NOT_FOUND') notFound(); // real 404 status for a dead proof link; see not-found.tsx beside this file
    return (
      <>
        <BackLink />
        <StateShell kind="error" title="Could not load this transaction" body={err.message}
          action={<Link className="btn no-underline" href="/ledger">Search the ledger</Link>} />
      </>
    );
  }
  const { data: tx, mode } = result;
  const valid = tx.validationCode === 'VALID';
  const subjects = subjectsOf([...tx.rwset.writes, ...tx.rwset.reads]);
  const keySet = (keys: string[]) => keys.length === 0
    ? <p className="py-3 text-sm text-ink-3">None.</p>
    : <ul className="divide-y divide-line">{keys.map((k) => (
        <li key={k} className="flex flex-wrap items-center gap-2 py-2">
          <span className="mono break-all">{k}</span>
          {isPrivateHashKey(k) && <Chip title="Only a hash of the private data is on the channel ledger">private data hash</Chip>}
        </li>
      ))}</ul>;

  return (
    <>
      <BackLink />
      {mode === 'index-only' && (
        <p role="note" className="mb-4 flex items-start gap-2 rounded-sm border px-3 py-2 text-sm" data-testid="index-only-note"
          style={{ borderColor: 'color-mix(in srgb, var(--warn-text) 40%, transparent)', background: 'color-mix(in srgb, var(--warn-text) 10%, var(--surface))' }}>
          <Database className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
          <span>Served from the indexed copy of the ledger; live peer is offline.</span>
        </p>
      )}

      <PageHeader eyebrow="Transaction" title={<span className="flex flex-wrap items-center gap-3">
        <span>{tx.fn}</span>
        <Chip tone={valid ? 'ok' : 'danger'}>{valid ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <XCircle className="h-3.5 w-3.5" aria-hidden />}{tx.validationCode}</Chip>
        <ChannelChip channel={tx.channel} />
      </span>}>
        <span data-testid="tx-summary" className="text-lg text-ink">{summarizeTx(tx)}</span>
      </PageHeader>

      <Section title="Commit record">
        <dl>
          <Field label="Transaction ID"><Hash value={tx.txId} label="Copy transaction ID" /></Field>
          <Field label="Channel">{tx.channel}</Field>
          <Field label="Chaincode · function"><span className="mono">{tx.chaincode}</span> · <span className="mono">{tx.fn}</span></Field>
          <Field label="Block"><Link className="mono" href={`/ledger/block/${tx.channel}/${tx.blockNumber}`}>#{formatCount(tx.blockNumber)} on {channelShort(tx.channel)}-channel</Link></Field>
          <Field label="Block hash"><Hash value={tx.blockHash} label="Copy block hash" /></Field>
          <Field label="Validation code"><span className="mono">{tx.validationCode}</span></Field>
          <Field label="Committed at"><span>{formatDateTimeIST(tx.timestamp, true)}</span> <span className="mono text-ink-3">{tx.timestamp}</span></Field>
          <Field label="Submitted by"><OrgBadge org={tx.creatorMsp} full /></Field>
        </dl>
      </Section>

      <Section title="Endorsing organisations" aside={`${new Set(tx.endorsers).size} of the channel's orgs`}>
        <ul className="flex flex-wrap gap-2 py-3" aria-label="Endorsing organisations">
          {[...new Set(tx.endorsers)].map((o) => (
            <li key={o} className="flex items-center gap-2 rounded-sm border border-line px-3 py-2">
              <OrgBadge org={o} />
              <span className="text-sm text-ink-2">{ORG_DISPLAY[o as OrgMsp] ?? o}</span>
            </li>
          ))}
        </ul>
      </Section>

      <div className="grid gap-x-6 md:grid-cols-2">
        <Section title="Keys read" aside={String(tx.rwset.reads.length)}>{keySet(tx.rwset.reads)}</Section>
        <Section title="Keys written" aside={String(tx.rwset.writes.length)}>{keySet(tx.rwset.writes)}</Section>
      </div>
      <p className="-mt-3 mb-6 text-sm text-ink-2">The ledger exposes the keys a transaction touched, never the values. Personal data is never put on the ledger, and prices sit in private data that only the FPO and the buyer can read.</p>

      {(subjects.sscc || subjects.enwr || subjects.orderId) && (
        <Section title="Related records">
          <ul className="divide-y divide-line">
            {subjects.sscc && <li className="py-2.5"><span className="text-ink-2">Lot </span><Link className="mono" href={`/lots/${subjects.sscc}`}>{subjects.sscc}</Link><span className="text-sm text-ink-3"> (sign-in required)</span></li>}
            {subjects.enwr && <li className="py-2.5"><span className="text-ink-2">e-NWR </span><span className="mono">{subjects.enwr}</span></li>}
            {subjects.orderId && <li className="py-2.5"><span className="text-ink-2">Order </span><span className="mono">{subjects.orderId}</span></li>}
          </ul>
        </Section>
      )}
    </>
  );
}

function BackLink() {
  return <Link href="/ledger" className="mb-4 inline-flex min-h-10 items-center gap-1.5 text-sm no-underline"><ArrowLeft className="h-4 w-4" aria-hidden />Ledger Explorer</Link>;
}
