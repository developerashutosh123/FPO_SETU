import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, Database } from 'lucide-react';
import type { BlockDetail, Channel } from '@/contract/contract';
import { api, asApiError } from '@/lib/api';
import { channelShort, formatCount, formatDateTimeIST } from '@/lib/format';
import { ChannelChip, Chip, Field, Hash, OrgBadge, PageHeader, Section } from '@/components/ui';
import { StateShell } from '@/components/states';

export const dynamic = 'force-dynamic';

const CHANNELS: Channel[] = ['trace-channel', 'finance-channel', 'trade-channel'];

export async function generateMetadata({ params }: { params: Promise<{ channel: string; n: string }> }) {
  const { channel, n } = await params;
  return { title: `Block ${n} on ${channel}` };
}

async function neighbour(channel: Channel, n: number): Promise<BlockDetail | null> {
  if (n < 0) return null;
  try { return (await api.ledgerBlock(channel, n)).data; } catch { return null; }
}

export default async function BlockPage({ params }: { params: Promise<{ channel: string; n: string }> }) {
  const { channel, n: rawN } = await params;
  const n = Number(rawN);
  if (!CHANNELS.includes(channel as Channel) || !Number.isInteger(n) || n < 0) notFound();
  const ch = channel as Channel;

  let main;
  try { main = await api.ledgerBlock(ch, n); } catch (e) {
    const err = asApiError(e);
    if (err.code === 'ERR_NOT_FOUND') notFound();
    return (
      <>
        <Back />
        <StateShell kind="error" title="Could not load this block" body={err.message}
          action={<Link className="btn no-underline" href={`/ledger?channel=${ch}`}>See the latest {channelShort(ch)}-channel blocks</Link>} />
      </>
    );
  }
  const { data: block, mode } = main;
  const [prev, next] = await Promise.all([neighbour(ch, n - 1), neighbour(ch, n + 1)]);

  return (
    <>
      <Back />
      {mode === 'index-only' && (
        <p role="note" className="note mb-5 flex items-start gap-2" data-tone="warn">
          <Database className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
          <span>Served from the indexed copy of the ledger; live peer is offline.</span>
        </p>
      )}
      <PageHeader eyebrow="Block" title={<span className="flex flex-wrap items-center gap-3"><span>#{formatCount(block.number)}</span><ChannelChip channel={block.channel} /></span>}>
        Committed {formatDateTimeIST(block.time, true)} with {block.txCount} transaction{block.txCount === 1 ? '' : 's'}.
      </PageHeader>

      <Section title="Header">
        <dl>
          <Field label="Block number"><span className="mono">{block.number}</span></Field>
          <Field label="Channel">{block.channel}</Field>
          <Field label="Time">{formatDateTimeIST(block.time, true)} <span className="mono text-ink-3">{block.time}</span></Field>
          <Field label="Transactions">{block.txCount}</Field>
          <Field label="Data hash"><Hash value={block.dataHash} label="Copy data hash" /></Field>
          <Field label="Previous hash"><Hash value={block.previousHash} label="Copy previous hash" /></Field>
        </dl>
      </Section>

      <section aria-labelledby="chain-h" className="mb-6">
        <h2 id="chain-h" className="mb-2 text-base font-semibold">Chain position</h2>
        <ol className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch" data-testid="chain">
          <ChainCell label="Previous block" n={n - 1} ch={ch} detail={prev} missing={n === 0 ? 'This is the first block (genesis).' : 'Not in the index.'} field="previous" />
          <Arrow />
          <ChainCell label="This block" n={n} ch={ch} detail={block} current field="this" />
          <Arrow />
          <ChainCell label="Next block" n={n + 1} ch={ch} detail={next} missing="No next block yet. This is the latest one the index has." field="next" />
        </ol>
        <p className="mt-2 text-sm text-ink-2">Each block header carries the hash of the block before it, so changing any past transaction would break every later link.</p>
      </section>

      <Section title="Transactions" aside={String(block.txs.length)}>
        {block.txs.length === 0 ? <p className="py-3 text-sm text-ink-3">This block has no transactions.</p> : (
          <div className="scroll-x -mx-4 sm:-mx-6">
            <table className="dtable">
              <caption className="sr-only">Transactions in block {block.number}</caption>
              <thead><tr><th scope="col">Transaction</th><th scope="col">Chaincode · function</th><th scope="col">Result</th><th scope="col">Submitted by</th><th scope="col">Time</th></tr></thead>
              <tbody>
                {block.txs.map((t) => (
                  <tr key={t.txId}>
                    <td><Hash value={t.txId} full={false} href={`/ledger/tx/${encodeURIComponent(t.txId)}`} label="Copy transaction ID" /></td>
                    <td><span className="mono">{t.chaincode}</span> · <span className="mono">{t.fn}</span></td>
                    <td><Chip tone={t.validationCode === 'VALID' ? 'ok' : 'danger'}>{t.validationCode}</Chip></td>
                    <td><OrgBadge org={t.creatorMsp} /></td>
                    <td className="whitespace-nowrap">{formatDateTimeIST(t.timestamp, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

function Arrow() {
  return <li aria-hidden className="flex items-center justify-center text-ink-3 max-md:rotate-90"><ArrowRight className="h-5 w-5" /></li>;
}

function ChainCell({ label, n, ch, detail, missing, current, field }: {
  label: string; n: number; ch: Channel; detail: BlockDetail | null; missing?: string; current?: boolean; field: 'previous' | 'this' | 'next';
}) {
  return (
    <li className="card min-w-0 p-4" style={current ? { borderColor: 'var(--accent-text)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--accent-text) 16%, transparent)' } : undefined} aria-current={current ? 'true' : undefined}>
      <p className="eyebrow">{label}</p>
      {detail ? (
        <>
          <p className="mt-1 font-medium">
            {current ? <span className="mono">#{formatCount(n)}</span> : <Link className="mono" href={`/ledger/block/${ch}/${n}`}>#{formatCount(n)}</Link>}
          </p>
          {field === 'previous' && <HashLine k="data hash" v={detail.dataHash} />}
          {field === 'this' && <><HashLine k="previous hash" v={detail.previousHash} /><HashLine k="data hash" v={detail.dataHash} /></>}
          {field === 'next' && <HashLine k="its previous hash" v={detail.previousHash} />}
        </>
      ) : <p className="mt-1 text-sm text-ink-3">{missing}</p>}
    </li>
  );
}

function HashLine({ k, v }: { k: string; v: string }) {
  return <p className="mt-1.5 text-xs text-ink-2">{k}<br /><span className="mono break-all text-ink" title={v}>{v.length > 26 ? `${v.slice(0, 14)}…${v.slice(-8)}` : v}</span></p>;
}

function Back() {
  return <Link href="/ledger" className="mb-4 inline-flex min-h-10 items-center gap-1.5 text-sm no-underline"><ArrowLeft className="h-4 w-4" aria-hidden />Ledger Explorer</Link>;
}
