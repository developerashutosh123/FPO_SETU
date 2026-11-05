'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronDown, RotateCw } from 'lucide-react';
import type { Collateral } from '@/contract/contract';
import { api } from '@/lib/api';
import { T } from '@/lib/glossary';
import { CHUNK_SIZE, MAX_IN_FLIGHT, PAGE_SIZE, chunkOffsets, createLimiter, fetchChunk, fetchPledged, type Chunk, type ListDeps, type Limiter } from '@/lib/collateralList';
import { ErrorState, Skeleton, StateShell } from '@/components/states';
import { LienChip, inr } from '@/components/finance';
import { ProofButton } from '@/components/ProofDrawer';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const deps: ListDeps = {
  collateral: (query, signal, timeoutMs) => api.collateral(query, signal, timeoutMs),
  loans: (status, signal, limit, timeoutMs) => api.loans(status, signal, limit, timeoutMs),
};

const commodityLabel = (c: Collateral) => c.lot.commodity.charAt(0) + c.lot.commodity.slice(1).toLowerCase() + (c.lot.grade ? `, grade ${c.lot.grade}` : '');

/** Placeholder rows that keep their place in the table while a request is out, so arriving rows do not push others around. */
function LoadingRows({ count, label }: { count: number; label: string }) {
  return Array.from({ length: count }, (_, i) => (
    <TableRow key={`${label}-${i}`} data-testid="rows-loading" aria-hidden>
      <TableCell colSpan={7}><Skeleton className="h-4 w-full" /></TableCell>
    </TableRow>
  ));
}

export function CollateralTable({ rows, top, bottom }: { rows: Collateral[]; top?: ReactNode; bottom?: ReactNode }) {
  return (
    <div className="card scroll-x">
      <Table data-testid="collateral-table" aria-busy={top || bottom ? true : undefined}>
        <TableHeader>
          <TableRow>
            <TableHead>e-NWR</TableHead><TableHead>Commodity</TableHead><TableHead>Facility</TableHead>
            <TableHead className="num">Quantity (qtl)</TableHead><TableHead className="num"><T k="eligible">Eligible loan</T></TableHead>
            <TableHead><T k="lien">Lien</T></TableHead><TableHead>Proof</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {top}
          {rows.map((c) => (
            <TableRow key={c.enwr}>
              <TableCell>
                <Link href={`/collateral/${c.enwr}`} className="mono">{c.enwr}</Link>
                <div className="text-xs text-ink-3">{c.lot.humanRef}</div>
              </TableCell>
              <TableCell>{commodityLabel(c)}</TableCell>
              <TableCell>{c.facilityName}</TableCell>
              <TableCell className="num">{c.quantityQtl.toFixed(2)}</TableCell>
              <TableCell className="num">{inr(c.eligibleLoan)}</TableCell>
              <TableCell><LienChip status={c.lien.status} /></TableCell>
              <TableCell><ProofButton proof={c.lien.proof} /></TableCell>
            </TableRow>
          ))}
          {bottom}
        </TableBody>
      </Table>
    </div>
  );
}

/** Every receipt on the ledger, a page at a time. See lib/collateralList for why a page is fetched in chunks. */
export function ReceiptList() {
  const [pledged, setPledged] = useState<Collateral[] | null>(null);
  const [chunks, setChunks] = useState<Map<number, Chunk | null>>(new Map());
  const [pageStart, setPageStart] = useState(0);
  const [generation, setGeneration] = useState(0);
  const session = useRef<{ signal: AbortSignal; run: Limiter } | null>(null);

  const loadChunks = useCallback((offsets: number[]) => {
    const s = session.current;
    if (!s) return;
    setChunks((m) => { const n = new Map(m); offsets.forEach((o) => n.set(o, null)); return n; });
    for (const o of offsets) {
      void fetchChunk(deps, s.run, o, s.signal).then((c) => {
        if (!s.signal.aborted) setChunks((m) => new Map(m).set(o, c));
      });
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    session.current = { signal: ac.signal, run: createLimiter(MAX_IN_FLIGHT) };
    setPledged(null); setChunks(new Map()); setPageStart(0);
    // the first page's chunks are queued before the pledged lookups, so the list itself never waits behind them;
    // the pledged rows fill their reserved place at the top when they arrive
    loadChunks(chunkOffsets(0));
    void fetchPledged(deps, session.current.run, ac.signal).then((p) => { if (!ac.signal.aborted) setPledged(p); });
    return () => ac.abort();
  }, [generation, loadChunks]);

  const ordered = useMemo(() => [...chunks.entries()].sort(([a], [b]) => a - b).map(([, c]) => c), [chunks]);
  const first = chunks.get(0);

  const rows = useMemo(() => {
    const pinned = pledged ?? [];
    const seen = new Set(pinned.map((c) => c.enwr));
    const out = [...pinned];
    for (const c of ordered.flatMap((x) => x?.items ?? [])) if (!seen.has(c.enwr)) { seen.add(c.enwr); out.push(c); }
    return out;
  }, [pledged, ordered]);

  const failed = ordered.filter((c): c is Chunk => !!c?.error);
  const pending = ordered.filter((c) => c === null).length;
  if (!first || (rows.length === 0 && (pending || pledged === null))) return <StateShell kind="loading" title="Loading collateral" />;
  if (rows.length === 0) {
    if (failed.length) return <ErrorState error={failed[0]!.error!} onRetry={() => setGeneration((g) => g + 1)} />;
    return <StateShell kind="empty" title="No receipts on the ledger yet" body="A receipt appears here after the FPO's warehouse clerk requests an e-NWR for a stored lot." />;
  }
  const last = chunks.get(pageStart + PAGE_SIZE - CHUNK_SIZE);
  const more = !pending && !!last?.more;
  const pinnedCount = pledged?.length ?? 0;

  return (
    <>
      <p className="mb-2 text-sm text-ink-2" aria-live="polite">
        Showing {rows.length} receipt{rows.length === 1 ? '' : 's'} from the ledger
        {pinnedCount > 0 ? `; the ${pinnedCount === 1 ? 'one' : pinnedCount} under an active lien ${pinnedCount === 1 ? 'is' : 'are'} listed first.` : '.'}
      </p>
      <CollateralTable
        rows={rows}
        top={pledged === null && <LoadingRows count={2} label="pledged" />}
        bottom={pending > 0 && <LoadingRows count={Math.min(pending, 3)} label="chunks" />}
      />
      {failed.length > 0 && !pending && (
        <div className="card mt-3 flex flex-wrap items-center justify-between gap-3 p-4" role="alert" data-testid="chunk-error">
          <p className="text-sm text-ink-2">
            Up to {failed.length * CHUNK_SIZE} receipts could not be loaded. {failed[0]!.error!.message}
          </p>
          <Button variant="outline" onClick={() => loadChunks(failed.map((c) => c.offset))}><RotateCw className="h-4 w-4" aria-hidden />Try again</Button>
        </div>
      )}
      {pending > 0 && <p className="sr-only" role="status">Loading more receipts</p>}
      {more && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" data-testid="load-more" onClick={() => { const s = pageStart + PAGE_SIZE; setPageStart(s); loadChunks(chunkOffsets(s)); }}>
            <ChevronDown className="h-4 w-4" aria-hidden />Load {PAGE_SIZE} more
          </Button>
        </div>
      )}
    </>
  );
}
