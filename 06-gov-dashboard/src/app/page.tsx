'use client';
import type { Kpi, KpiCriterion } from '@/contract/contract';
import { api } from '@/lib/api';
import { RequireAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { formatCount, formatDateTimeIST } from '@/lib/format';
import { Chip, PageHeader } from '@/components/ui';
import { Boundary, Skeleton } from '@/components/states';
import { CheckCircle2, CircleDashed, XCircle } from 'lucide-react';

export default function Overview() {
  return <RequireAuth>{() => <OverviewBody />}</RequireAuth>;
}

function OverviewBody() {
  const state = useApi((s) => api.kpis(s), []);
  return (
    <>
      <PageHeader eyebrow="Overview" title="Is the FPO healthy, is distribution fair, and is the record trustworthy?">
        Year-1 indicators computed from the ledger and its index. Every figure says what it was computed from and when. A blank means the data is not there yet, not that the answer is zero.
      </PageHeader>
      <Boundary state={state} skeleton={<KpiSkeleton />}>
        {(r) => {
          const gate = r.items.find((k) => k.key === 'month12_gate');
          const cards = r.items.filter((k) => k.key !== 'month12_gate');
          return (
            <>
              {gate && <Gate kpi={gate} />}
              <section aria-labelledby="kpi-h" className="mt-10">
                <h2 id="kpi-h" className="text-lg font-semibold">Indicators against their Year-1 targets</h2>
                <p className="mt-1 text-sm text-ink-2">As of {formatDateTimeIST(r.asOf)}.</p>
                <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="kpi-cards">
                  {cards.map((k) => <li key={k.key}><KpiCard kpi={k} /></li>)}
                </ul>
              </section>
            </>
          );
        }}
      </Boundary>
    </>
  );
}

function formatValue(k: Kpi): string | null {
  if (k.value === null) return null;
  const v = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(k.value);
  if (k.unit === '%') return `${v}%`;
  if (k.unit === 'ms') return k.value >= 1000 ? `${(k.value / 1000).toFixed(1)} s` : `${v} ms`;
  return `${v} ${k.unit}`;
}

function KpiCard({ kpi: k }: { kpi: Kpi }) {
  const value = formatValue(k);
  return (
    <article className="card flex h-full flex-col p-4" data-testid={`kpi-${k.key}`}>
      <h3 className="text-sm font-medium text-ink-2">{k.label}</h3>
      {value ? (
        <p className="mt-2 text-[32px] font-semibold leading-none tracking-tight">{value}</p>
      ) : (
        <p className="mt-2 text-lg font-medium text-ink-2">Not available yet</p>
      )}
      <dl className="mt-3 space-y-1 text-sm">
        {k.target && <div className="flex gap-2"><dt className="text-ink-3">Year-1 target</dt><dd className="font-medium">{k.target}</dd></div>}
        {k.numerator !== undefined && k.denominator !== undefined && (
          <div className="flex gap-2"><dt className="text-ink-3">Counted</dt><dd>{formatCount(k.numerator)} of {formatCount(k.denominator)}</dd></div>
        )}
      </dl>
      <p className="mt-3 border-t border-line pt-3 text-xs text-ink-2">
        <span className="font-semibold text-ink">{value ? 'Computed from: ' : 'Why blank: '}</span>{k.computedFrom}
      </p>
      <p className="mt-auto pt-2 text-xs text-ink-3">As of {formatDateTimeIST(k.asOf)}</p>
    </article>
  );
}

function Gate({ kpi }: { kpi: Kpi }) {
  const criteria = kpi.criteria ?? [];
  const met = criteria.filter((c) => c.met === true).length;
  return (
    <section aria-labelledby="gate-h" className="card p-4 sm:p-5" data-testid="gate">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="gate-h" className="text-lg font-semibold">Month-12 go/no-go gate: {met} of {criteria.length || 4} criteria met</h2>
        <span className="text-sm text-ink-3">As of {formatDateTimeIST(kpi.asOf)}</span>
      </div>
      <p className="mt-1 text-sm text-ink-2">The pilot continues past month 12 only if all four are met.</p>
      <p className="mt-1 text-xs text-ink-2"><span className="font-semibold text-ink">Computed from: </span>{kpi.computedFrom}</p>
      {criteria.length === 0
        ? <p className="mt-4 text-sm text-ink-2">The API returned no criteria for the gate.</p>
        : <ol className="mt-4 divide-y divide-line rounded-sm border border-line">{criteria.map((c, i) => <Criterion key={c.key} c={c} n={i + 1} />)}</ol>}
    </section>
  );
}

function Criterion({ c, n }: { c: KpiCriterion; n: number }) {
  const [Icon, tone, label, color] =
    c.met === true ? [CheckCircle2, 'ok', 'Met', 'text-ok'] as const
    : c.met === false ? [XCircle, 'danger', 'Not met', 'text-danger'] as const
    : [CircleDashed, undefined, 'Cannot be determined yet', 'text-ink-3'] as const;
  return (
    <li className="grid gap-1 px-3 py-3 sm:grid-cols-[1fr_auto] sm:gap-4 sm:px-4">
      <div className="min-w-0">
        <p className="font-medium"><span className="text-ink-3">{n}. </span>{c.label}</p>
        <p className="mt-0.5 text-sm text-ink-2">Evidence: {c.evidence}</p>
      </div>
      <div className="sm:self-start"><Chip tone={tone}><Icon className={`h-3.5 w-3.5 ${color}`} aria-hidden />{label}</Chip></div>
    </li>
  );
}

function KpiSkeleton() {
  return (
    <div role="status" aria-label="Loading indicators">
      <Skeleton className="h-40 w-full" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-44" />)}</div>
    </div>
  );
}
