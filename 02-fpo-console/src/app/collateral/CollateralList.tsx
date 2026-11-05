'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { formatINR, type Collateral } from '@/contract/contract';
import { api, asApiError, type ApiClientError } from '@/lib/api';
import { RequireAuth } from '@/lib/auth';
import { useReloadOnLedger } from '@/lib/ledgerEvents';
import { Skeleton, StateShell, ErrorState } from '@/components/states';
import { Chip, PageHeader, SimulatedChip } from '@/components/ui';
import { SsccLink } from '@/components/actions';
import { ProofButton } from '@/components/ProofDrawer';

/** The gateway values every receipt one by one (about 0.35 s each on the live ledger), so pages are small and have a generous timeout. */
const PAGE = 10;
const TIMEOUT_MS = 30_000;

export const LienChip = ({ status }: { status: Collateral['lien']['status'] }) =>
  status === 'ACTIVE' ? <Chip tone="warn">Lien active</Chip> : status === 'RELEASED' ? <Chip tone="ok">Lien released</Chip> : <Chip>No lien</Chip>;

export function CollateralList() {
  return <RequireAuth>{() => <List />}</RequireAuth>;
}

function List() {
  const [rows, setRows] = useState<Collateral[]>([]);
  const [next, setNext] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiClientError | null>(null);
  const gen = useRef(0);

  const load = useCallback(async (cursor?: string) => {
    const mine = ++gen.current;
    setLoading(true); setError(null);
    try {
      const r = await api.collateral({ cursor, limit: String(PAGE) }, undefined, TIMEOUT_MS);
      if (mine !== gen.current) return;
      setRows((cur) => (cursor ? [...cur, ...r.data.items] : r.data.items));
      setNext(r.data.nextCursor);
    } catch (e) { if (mine === gen.current) setError(asApiError(e)); } finally { if (mine === gen.current) setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useReloadOnLedger(() => void load(), (e) => ['LienMarked', 'LienReleased', 'LoanDisbursed', 'LoanRepaid', 'ENWRIssued'].includes(e.event));

  return (
    <>
      <PageHeader eyebrow="Collateral position" title="What is pledged, and to whom">
        Each row is an e-NWR issued for a stored lot. <SimulatedChip what="The e-NWR repository" /> The lien status comes from the finance channel.
      </PageHeader>
      {error && rows.length === 0 ? <ErrorState error={error} onRetry={() => void load()} /> : loading && rows.length === 0 ? <Skeleton className="h-40 w-full" /> : rows.length === 0 ? (
        <StateShell kind="empty" title="No e-NWR yet" body="A receipt appears here after the warehouse clerk records a deposit and requests an e-NWR." />
      ) : (
        <div className="card scroll-x" data-testid="collateral-table">
          <table className="dtable">
            <caption className="sr-only">Electronic negotiable warehouse receipts</caption>
            <thead><tr><th>e-NWR</th><th>Lot</th><th>Stored at</th><th className="num">Quantity</th><th className="num">Assessed value</th><th>Lien</th><th>Proof</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.enwr}>
                  <td><Link className="mono font-medium" href={`/collateral/${c.enwr}`}>{c.enwr}</Link></td>
                  <td><SsccLink sscc={c.lot.sscc} humanRef={c.lot.humanRef} /></td>
                  <td>{c.facilityName}</td>
                  <td className="num">{c.quantityQtl} qtl</td>
                  <td className="num">{formatINR(c.assessedValue)}</td>
                  <td data-testid="lien-chip"><LienChip status={c.lien.status} /></td>
                  <td><ProofButton proof={c.lien.proof} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-3 border-t border-line px-3 py-2 text-sm text-ink-3">
            <span>{rows.length} shown</span>
            {next && <button className="btn !min-h-8" disabled={loading} onClick={() => void load(next)}>{loading ? 'Loading…' : 'Load more'}</button>}
            {error && <span className="text-danger">{error.message}</span>}
          </div>
        </div>
      )}
    </>
  );
}
