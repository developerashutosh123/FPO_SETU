'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Radio, Search } from 'lucide-react';
import type { BlockSummary, Channel, SearchHit, StreamEvent } from '@/contract/contract';
import { api, asApiError, type ApiClientError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useLedgerStream } from '@/lib/useLedgerStream';
import { channelShort, formatCount, formatDateTimeIST } from '@/lib/format';
import { ChannelChip, Chip, Hash, OrgBadge, PageHeader } from '@/components/ui';
import { Boundary, StateShell } from '@/components/states';
import { useConn } from '@/components/AppShell';

const CHANNELS: Channel[] = ['trace-channel', 'finance-channel', 'trade-channel'];
const isChannel = (c: string | null): c is Channel => CHANNELS.includes(c as Channel);

export function Explorer() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const selected = isChannel(params.get('channel')) ? (params.get('channel') as Channel) : undefined;
  const conn = useConn();

  const status = useApi((s) => api.ledgerStatus(s), [], { refreshMs: 60_000 });
  const blocks = useApi((s) => api.ledgerBlocks(selected, 15, s), [selected]);
  const [lastEvent, setLastEvent] = useState<StreamEvent | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string> | null>(null);

  // highlight rows that were not in the previous list (not on first load)
  useEffect(() => {
    if (!blocks.data) return;
    const keys = new Set(blocks.data.map((b) => `${b.channel}:${b.number}`));
    if (seen.current) {
      const added = new Set([...keys].filter((k) => !seen.current!.has(k)));
      if (added.size) { setFresh(added); setTimeout(() => setFresh(new Set()), 2500); }
    }
    seen.current = keys;
  }, [blocks.data]);
  useEffect(() => { seen.current = null; }, [selected]);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reloadSoon = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { blocks.reload(); status.reload(); }, 400);
  }, [blocks, status]);
  useLedgerStream({
    onEvent: (e) => { setLastEvent(e); if (!selected || e.channel === selected) reloadSoon(); },
    onPoll: reloadSoon,
  });

  const setChannel = (c?: Channel) => router.replace(c ? `${pathname}?channel=${c}` : pathname, { scroll: false });
  const members = status.data?.channels.find((c) => c.name === selected)?.members;

  return (
    <>
      <PageHeader eyebrow="Public · no sign-in" title="Ledger Explorer">
        Every record in FPO-SETU is a transaction on a Hyperledger Fabric channel. Open any block or transaction to see which organisations endorsed it and which keys it changed. Values are never shown here.
      </PageHeader>

      <SearchBox />

      <section aria-labelledby="blocks-h" className="mt-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="blocks-h" className="text-lg font-semibold">Latest blocks{selected ? ` on ${selected}` : ' on all channels'}</h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-2" data-testid="live-line">
              <Radio className={`h-3.5 w-3.5 ${conn.mode === 'live' ? 'text-ok' : 'text-ink-3'}`} aria-hidden />
              {conn.mode === 'live'
                ? lastEvent ? <>Live. Last event: {lastEvent.event} on {channelShort(lastEvent.channel)}-channel, block #{formatCount(lastEvent.blockNumber)}.</> : 'Live. Waiting for the next block.'
                : 'Index-only. This list refreshes every 30 seconds from the indexed copy.'}
            </p>
          </div>
          <div role="group" aria-label="Channel" className="flex flex-wrap gap-1">
            <ChannelButton active={!selected} onClick={() => setChannel()} label="All channels" />
            {CHANNELS.map((c) => (
              <ChannelButton key={c} active={selected === c} onClick={() => setChannel(c)} label={channelShort(c)}
                sub={status.data ? `#${formatCount(status.data.channels.find((x) => x.name === c)?.height ?? 0)}` : undefined} />
            ))}
          </div>
        </div>

        {members && (
          <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-ink-2">
            Members of {selected}: {members.map((m) => <OrgBadge key={m} org={m} />)}
          </p>
        )}

        <Boundary state={blocks} skeleton={<StateShell kind="loading" title="Loading blocks" />}>
          {(rows) => rows.length === 0
            ? <StateShell kind="empty" title="No blocks yet" body="This channel has not committed a block that the index has seen. Check the Network page for peer status." />
            : <BlocksTable rows={rows} showChannel={!selected} fresh={fresh} />}
        </Boundary>
      </section>
    </>
  );
}

function ChannelButton({ active, onClick, label, sub }: { active: boolean; onClick: () => void; label: string; sub?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className="inline-flex min-h-10 items-center gap-2 rounded-sm border px-3 text-sm font-medium"
      style={{ borderColor: active ? 'var(--accent-text)' : 'var(--line)', background: active ? 'color-mix(in srgb, var(--accent-text) 12%, var(--surface))' : 'var(--surface)', color: active ? 'var(--accent-text)' : 'var(--ink)' }}>
      {label}{sub && <span className="mono text-xs text-ink-3">{sub}</span>}
    </button>
  );
}

function BlocksTable({ rows, showChannel, fresh }: { rows: BlockSummary[]; showChannel: boolean; fresh: Set<string> }) {
  return (
    <div className="card scroll-x">
      <table className="dtable [&_td]:whitespace-nowrap">
        <caption className="sr-only">Latest blocks, newest first</caption>
        <thead>
          <tr>
            {showChannel && <th scope="col">Channel</th>}
            <th scope="col">Block</th><th scope="col">Time</th><th scope="col" className="text-right">Txs</th>
            <th scope="col">Data hash</th><th scope="col">Previous hash</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={`${b.channel}:${b.number}`} className={fresh.has(`${b.channel}:${b.number}`) ? 'row-new' : undefined}>
              {showChannel && <td><ChannelChip channel={b.channel} /></td>}
              <td><Link href={`/ledger/block/${b.channel}/${b.number}`} className="mono font-medium">#{formatCount(b.number)}</Link></td>
              <td className="whitespace-nowrap">{formatDateTimeIST(b.time, true)}</td>
              <td className="text-right">{b.txCount}</td>
              <td><Hash value={b.dataHash} full={false} label="Copy data hash" /></td>
              <td><Hash value={b.previousHash} full={false} label="Copy previous hash" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- search ----------
const KIND_LABEL: Record<SearchHit['kind'], string> = { tx: 'Transaction', lot: 'Lot', enwr: 'e-NWR', order: 'Order' };

function hitHref(h: SearchHit): string | null {
  if (h.kind === 'tx') return `/ledger/tx/${encodeURIComponent(h.id)}`;
  if (h.kind === 'lot') return `/lots/${encodeURIComponent(h.id)}`;
  return null; // e-NWR and order hits carry no tx or lot to open; see CONTRACT_REQUESTS.md
}

function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [asked, setAsked] = useState('');

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    setBusy(true); setError(null); setAsked(term);
    try {
      const { data } = await api.ledgerSearch(term);
      if (data.length === 1 && data[0]!.kind === 'tx') { router.push(hitHref(data[0]!)!); return; }
      setHits(data);
    } catch (err) { setError(asApiError(err)); setHits(null); } finally { setBusy(false); }
  }

  return (
    <section aria-labelledby="search-h" className="card p-4 sm:p-5">
      <h2 id="search-h" className="text-base font-semibold">Find a record</h2>
      <form onSubmit={run} role="search" className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="ledger-q" className="sr-only">Transaction ID, lot SSCC, e-NWR or order ID</label>
        <input id="ledger-q" name="q" value={q} onChange={(e) => setQ(e.target.value)} spellCheck={false} autoComplete="off"
          placeholder="Tx ID, lot SSCC, e-NWR (ENWR-…) or order ID (ORD-…)"
          className="mono min-h-11 flex-1 rounded-sm border border-line bg-surface px-3" />
        <button className="btn" data-variant="primary" disabled={busy || !q.trim()}><Search className="h-4 w-4" aria-hidden />{busy ? 'Searching…' : 'Search'}</button>
      </form>

      <div aria-live="polite" data-testid="search-results">
        {error && <p className="mt-3 text-sm text-danger" role="alert">{error.message}</p>}
        {hits && hits.length === 0 && (
          <p className="mt-3 text-sm text-ink-2">Nothing on the ledger index matches <span className="mono">{asked}</span>. Check it for typing mistakes. An SSCC has 18 digits; an e-NWR looks like ENWR-NERL-2026-004211.</p>
        )}
        {hits && hits.length > 0 && (
          <ul className="mt-3 divide-y divide-line rounded-sm border border-line">
            {hits.map((h) => {
              const href = hitHref(h);
              return (
                <li key={`${h.kind}:${h.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
                  <Chip tone="accent">{KIND_LABEL[h.kind]}</Chip>
                  <span className="mono break-all">{h.id}</span>
                  <span className="text-sm text-ink-2">{h.label}</span>
                  {h.channel && <ChannelChip channel={h.channel} />}
                  <span className="ml-auto text-sm">
                    {href ? <Link href={href}>{h.kind === 'lot' ? 'Open lot' : 'Open transaction'}</Link>
                      : h.channel ? <Link href={`/ledger?channel=${h.channel}`}>See {channelShort(h.channel)}-channel blocks</Link> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
