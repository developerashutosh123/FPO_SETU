'use client';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { formatDateIST } from '@/contract/contract';
import { formatCount } from '@/lib/format';
import { RequireAuth } from '@/lib/auth';
import { STATUS_LABEL, STATUS_ORDER } from '@/lib/queue';
import { useAllLots } from '@/lib/useAllLots';
import { Boundary, Skeleton, StateShell } from '@/components/states';
import { GradeChip, PageHeader, StatusChip } from '@/components/ui';
import { SsccLink } from '@/components/actions';
import { ProofButton } from '@/components/ProofDrawer';

const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export function LotsView() {
  return <RequireAuth>{() => <Lots />}</RequireAuth>;
}

function Lots() {
  const params = useSearchParams();
  const lots = useAllLots();
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [grade, setGrade] = useState('');
  const [commodity, setCommodity] = useState('');
  const [village, setVillage] = useState('');
  const [text, setText] = useState('');

  const items = lots.data?.items;
  const villages = useMemo(() => [...new Set((items ?? []).map((l) => l.village))].sort(), [items]);
  const commodities = useMemo(() => [...new Set((items ?? []).map((l) => l.commodity))].sort(), [items]);
  const rows = useMemo(() => {
    const t = text.trim().toLowerCase();
    return (items ?? []).filter((l) =>
      (!status || l.status === status) && (!grade || l.grade === grade) && (!commodity || l.commodity === commodity) && (!village || l.village === village) &&
      (!t || l.humanRef.toLowerCase().includes(t) || l.sscc.includes(t)));
  }, [items, status, grade, commodity, village, text]);

  return (
    <>
      <PageHeader eyebrow="Lots" title="Every lot at the centre">
        Filter by status, grade, crop or village. Lot lists never carry a farmer&apos;s name or phone; open a lot for its full passport.
      </PageHeader>
      <form className="card mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={(e) => e.preventDefault()} aria-label="Filter lots">
        <Filter label="Search" htmlFor="f-q"><input id="f-q" data-search className="field" placeholder="Reference or SSCC  ( / )" value={text} onChange={(e) => setText(e.target.value)} /></Filter>
        <Filter label="Status" htmlFor="f-s">
          <select id="f-s" className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </Filter>
        <Filter label="Grade" htmlFor="f-g">
          <select id="f-g" className="field" value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">Any grade</option><option value="A">Grade A</option><option value="B">Grade B</option><option value="C">Grade C</option>
          </select>
        </Filter>
        <Filter label="Crop" htmlFor="f-c">
          <select id="f-c" className="field" value={commodity} onChange={(e) => setCommodity(e.target.value)}>
            <option value="">All crops</option>{commodities.map((c) => <option key={c} value={c}>{title(c)}</option>)}
          </select>
        </Filter>
        <Filter label="Village" htmlFor="f-v">
          <select id="f-v" className="field" value={village} onChange={(e) => setVillage(e.target.value)}>
            <option value="">All villages</option>{villages.map((v) => <option key={v} value={v}>{title(v)}</option>)}
          </select>
        </Filter>
      </form>
      <Boundary state={lots} skeleton={<Skeleton className="h-48 w-full" />}>
        {() => rows.length === 0 ? (
          <StateShell kind="empty" title="No lots match" body="Clear a filter to see more lots." />
        ) : (
          <div className="card scroll-x" data-testid="lots-table">
            <table className="dtable">
              <caption className="sr-only">Lots</caption>
              <thead><tr><th>Lot</th><th>Crop</th><th>Village</th><th>Status</th><th>Grade</th><th className="num">Bags</th><th className="num">Weight</th><th>Harvest</th><th>Proof</th></tr></thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.sscc}>
                    <td><SsccLink sscc={l.sscc} humanRef={l.humanRef} /></td>
                    <td>{title(l.commodity)}{l.variety ? <span className="block text-ink-3">{l.variety}</span> : null}</td>
                    <td>{title(l.village)}</td>
                    <td><StatusChip status={l.status} /></td>
                    <td><GradeChip grade={l.grade} /></td>
                    <td className="num">{l.bagCount}</td>
                    <td className="num">{l.netKg ? `${formatCount(l.netKg)} kg` : `${formatCount(l.estWeightKg)} kg est.`}</td>
                    <td>{formatDateIST(l.harvestOrUnloadDate)}</td>
                    <td><ProofButton proof={l.proof} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-line px-3 py-2 text-sm text-ink-3">{formatCount(rows.length)} of {formatCount(items?.length ?? 0)} lots{lots.data?.truncated ? ' (first 1,000 loaded)' : ''}</p>
          </div>
        )}
      </Boundary>
    </>
  );
}

const Filter = ({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) => (
  <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-3" htmlFor={htmlFor}>{label}</label>{children}</div>
);
