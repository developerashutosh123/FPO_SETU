'use client';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatCount } from '@/lib/format';
import { RequireAuth } from '@/lib/auth';
import { counters, EXCEPTION_TITLE, groupByStatus, STATUS_LABEL, type LotException } from '@/lib/queue';
import { useAllLots } from '@/lib/useAllLots';
import { useExceptions, MAX_PASSPORTS } from '@/lib/useExceptions';
import type { LotListItem, Role } from '@/contract/contract';
import { Boundary, Skeleton, StateShell } from '@/components/states';
import { Chip, GradeChip, PageHeader, StatusChip } from '@/components/ui';
import { SsccLink } from '@/components/actions';

/** Statuses that need somebody to do something. Settled, closed and side states are counted but not listed. */
const WORK = ['PENDING_FARMER_SIGNATURE', 'COMMISSIONED', 'GRADED', 'IN_STORAGE', 'PLEDGED', 'LISTED', 'SOLD', 'IN_TRANSIT', 'DELIVERED'];
const ROWS_PER_GROUP = 6;

export function TodayView() {
  return <RequireAuth>{(user) => <Today role={user.role} name={user.displayName} />}</RequireAuth>;
}

function Today({ role, name }: { role: Role; name: string }) {
  const lots = useAllLots();
  const ex = useExceptions(lots.data?.items, role);
  return (
    <>
      <PageHeader eyebrow={`Hello, ${name}`} title="What is in my centre right now, and what should move today?" />
      <Boundary state={lots} skeleton={<Skeleton className="h-40 w-full" />}>
        {({ items, truncated }) => {
          const c = counters(items);
          const groups = groupByStatus(items);
          const rest = items.filter((l) => !WORK.includes(l.status)).length;
          return (
            <>
              {truncated && <p className="mb-3 text-sm text-warn">Showing the first 1,000 lots only.</p>}
              <div className="mb-5 grid gap-3 sm:grid-cols-3" data-testid="counters">
                <Counter label="Drafts waiting for the farmer's signature" n={c.draftsAwaitingSignature} href="/lots?status=PENDING_FARMER_SIGNATURE" id="drafts" />
                <Counter label="Graded lots waiting for storage" n={c.gradedAwaitingStorage} href="/lots?status=GRADED" id="graded" />
                <Counter label="Pledged lots" n={c.pledged} href="/lots?status=PLEDGED" id="pledged" />
              </div>
              <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
                <section aria-labelledby="queue-h" className="card overflow-hidden">
                  <div className="flex items-baseline justify-between border-b border-line px-4 py-2.5">
                    <h2 id="queue-h" className="text-base font-semibold">Lot queue by status</h2>
                    <span className="text-sm text-ink-3">{formatCount(items.length)} lots</span>
                  </div>
                  {items.length === 0 ? (
                    <div className="p-4"><StateShell kind="empty" title="No lots yet" body="Lots appear here once the VLE creates a draft for a member." /></div>
                  ) : (
                    <div data-testid="queue">
                      {groups.filter((g) => WORK.includes(g.status)).map((g) => <QueueGroup key={g.status} status={g.status} lots={g.lots} />)}
                      {rest > 0 && <p className="border-t border-line px-4 py-2.5 text-sm text-ink-3">{formatCount(rest)} more are settled, closed or set aside. <Link href="/lots">See all lots</Link></p>}
                    </div>
                  )}
                </section>
                <ExceptionsPanel ex={ex} role={role} />
              </div>
            </>
          );
        }}
      </Boundary>
    </>
  );
}

function Counter({ label, n, href, id }: { label: string; n: number; href: string; id: string }) {
  return (
    <Link href={href} className="card block p-4 no-underline" style={{ color: 'var(--ink)' }} data-testid={`counter-${id}`}>
      <span className="block text-3xl font-semibold tabular-nums">{formatCount(n)}</span>
      <span className="mt-1 block text-sm text-ink-2">{label}</span>
    </Link>
  );
}

function QueueGroup({ status, lots }: { status: LotListItem['status']; lots: LotListItem[] }) {
  const shown = lots.slice(0, ROWS_PER_GROUP);
  return (
    <div className="border-b border-line last:border-b-0" data-testid={`queue-${status}`}>
      <div className="flex items-center justify-between gap-3 bg-canvas px-4 py-1.5">
        <span className="flex items-center gap-2 text-sm font-medium"><StatusChip status={status} /> {STATUS_LABEL[status]}</span>
        <Link href={`/lots?status=${status}`} className="text-sm">{formatCount(lots.length)} {lots.length === 1 ? 'lot' : 'lots'}</Link>
      </div>
      <div className="scroll-x"><table className="dtable"><tbody>
        {shown.map((l) => (
          <tr key={l.sscc}>
            <td><SsccLink sscc={l.sscc} humanRef={l.humanRef} /></td>
            <td className="text-ink-2">{l.commodity.toLowerCase()}{l.variety ? `, ${l.variety}` : ''}</td>
            <td className="text-ink-2">{l.village.charAt(0) + l.village.slice(1).toLowerCase()}</td>
            <td className="num">{l.bagCount} bags</td>
            <td className="num">{l.netKg ? `${formatCount(l.netKg)} kg` : `${formatCount(l.estWeightKg)} kg est.`}</td>
            <td><GradeChip grade={l.grade} /></td>
          </tr>
        ))}
      </tbody></table></div>
      {lots.length > shown.length && <p className="px-4 pb-2 text-sm"><Link href={`/lots?status=${status}`}>and {lots.length - shown.length} more</Link></p>}
    </div>
  );
}

function ExceptionsPanel({ ex, role }: { ex: ReturnType<typeof useExceptions>; role: Role }) {
  return (
    <aside aria-labelledby="ex-h" className="card self-start overflow-hidden" data-testid="exceptions">
      <div className="border-b border-line px-4 py-2.5"><h2 id="ex-h" className="text-base font-semibold">Exceptions</h2></div>
      <div className="px-4 py-3">
        {ex.loading ? <Skeleton className="h-16 w-full" /> : ex.exceptions.length === 0 ? (
          <p className="flex items-start gap-2 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />Nothing to chase in the lots checked.</p>
        ) : (
          <ul className="grid gap-3">
            {ex.exceptions.map((e, i) => <ExceptionRow key={`${e.kind}-${e.sscc}-${i}`} e={e} />)}
          </ul>
        )}
        {!ex.loading && (
          <p className="mt-3 border-t border-line pt-2 text-xs text-ink-3">
            Read from {ex.checked} of {ex.eligible} active lot passports{ex.eligible > MAX_PASSPORTS ? ` (the first ${MAX_PASSPORTS})` : ''}.
            {role === 'ceo' ? (ex.auditChecked ? ' Audit sample included.' : ' The audit sample could not be read.') : ' The audit sample is for the CEO.'}
          </p>
        )}
      </div>
    </aside>
  );
}

function ExceptionRow({ e }: { e: LotException }) {
  return (
    <li data-testid={`exception-${e.kind}`}>
      <p className="flex items-center gap-2 text-sm font-medium"><AlertTriangle className="h-4 w-4 shrink-0 text-warn" aria-hidden />{EXCEPTION_TITLE[e.kind]}</p>
      <p className="ml-6 text-sm text-ink-2">{e.detail}</p>
      <p className="ml-6 mt-0.5"><Link href={`/lots/${e.sscc}`} className="mono text-sm">{e.humanRef}</Link> <Chip>{e.kind === 'AUDIT_DIVERGENCE' ? 'audit' : 'lot'}</Chip></p>
    </li>
  );
}
