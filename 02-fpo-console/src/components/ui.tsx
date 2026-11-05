import type { ReactNode } from 'react';
import Link from 'next/link';
import { ORG_DISPLAY, type Channel, type Grade, type LotStatus, type OrgMsp } from '@/contract/contract';
import { channelShort } from '@/lib/format';
import { govTxUrl as govLink } from '@/lib/portals';
import { STATUS_LABEL } from '@/lib/queue';
import { CopyButton } from './CopyButton';

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: string; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-1.5 text-[1.625rem] font-semibold leading-tight tracking-tight">{title}</h1>
        {children && <div className="mt-2 max-w-3xl text-[15px] leading-relaxed text-ink-2">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Chip({ tone, children, title }: { tone?: 'ok' | 'warn' | 'danger' | 'accent' | 'gradeA' | 'gradeB' | 'gradeC'; children: ReactNode; title?: string }) {
  return <span className="chip" data-tone={tone} title={title}>{children}</span>;
}

export const ChannelChip = ({ channel }: { channel: Channel }) => <Chip>{channelShort(channel)}-channel</Chip>;

const STATUS_TONE: Partial<Record<LotStatus, 'ok' | 'warn' | 'danger' | 'accent'>> = {
  PLEDGED: 'warn', IN_TRANSIT: 'accent', DELIVERED: 'ok', SETTLED: 'ok', CLOSED: 'ok', REJECTED: 'danger', UNVERIFIABLE: 'danger', PENDING_FARMER_SIGNATURE: 'warn',
};
export function StatusChip({ status }: { status: LotStatus }) {
  return <Chip tone={STATUS_TONE[status]} title={STATUS_LABEL[status]}>{status.replace(/_/g, ' ').toLowerCase()}</Chip>;
}
/** Grade colours come from the shared tokens (--grade-a/b/c); the letter is always printed so colour is never the only signal. */
export function GradeChip({ grade }: { grade?: Grade }) {
  if (!grade) return <span className="text-ink-3">not graded</span>;
  return <Chip tone={grade === 'A' ? 'gradeA' : grade === 'B' ? 'gradeB' : 'gradeC'}>Grade {grade}</Chip>;
}
export const SimulatedChip = ({ what }: { what: string }) => <Chip tone="warn" title={`${what} is a simulated adapter, not a live government or market system.`}>Simulated adapter</Chip>;

export function OrgBadge({ org }: { org: OrgMsp | string }) {
  const name = ORG_DISPLAY[org as OrgMsp];
  return <span className="chip" data-tone="accent" title={name ? `${name} (${org})` : org}><span className="font-semibold">{org}</span></span>;
}

/** Monospace identifier with a copy button; `href` makes it a link. `full` shows the whole value (wraps), otherwise it is shortened. */
export function Hash({ value, full = true, href, external, label }: { value: string; full?: boolean; href?: string; external?: boolean; label?: string }) {
  const shown = full || value.length <= 18 ? value : `${value.slice(0, 10)}…${value.slice(-6)}`;
  const text = <span className={`mono ${full ? 'break-all' : ''}`}>{shown}</span>;
  return (
    <span className="inline-flex items-start gap-1.5" title={value}>
      {href ? (external ? <a href={href} target="_blank" rel="noreferrer">{text}</a> : <Link href={href}>{text}</Link>) : text}
      <CopyButton value={value} label={label ?? 'Copy'} />
    </span>
  );
}

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-line py-2.5 last:border-b-0 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

export function Section({ title, children, aside, id }: { title: ReactNode; children: ReactNode; aside?: ReactNode; id?: string }) {
  return (
    <section className="card mb-5 overflow-hidden" id={id}>
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-2.5">
        <h2 className="text-base font-semibold">{title}</h2>
        {aside && <div className="text-sm text-ink-3">{aside}</div>}
      </div>
      <div className="px-4 py-1">{children}</div>
    </section>
  );
}

export function Notice({ tone = 'info', title, children, testId }: { tone?: 'info' | 'warn' | 'danger' | 'ok'; title?: string; children: ReactNode; testId?: string }) {
  const color = tone === 'warn' ? 'var(--warn-text)' : tone === 'danger' ? 'var(--danger-text)' : tone === 'ok' ? 'var(--ok-text)' : 'var(--info-text)';
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} data-testid={testId} className="mb-4 rounded-md border px-4 py-3 text-sm"
      style={{ borderColor: `color-mix(in srgb, ${color} 45%, transparent)`, background: `color-mix(in srgb, ${color} 8%, var(--surface))` }}>
      {title && <p className="font-semibold" style={{ color }}>{title}</p>}
      <div className="text-ink">{children}</div>
    </div>
  );
}

/** A receipt for a committed write: tx (linked to the Gov explorer), channel, block, endorsers. Contract 9.3 item 1, in short form. */
export function ReceiptNote({ r, children }: { r: { txId: string; channel: Channel; blockNumber: number; endorsers: OrgMsp[]; fn: string }; children?: ReactNode }) {
  return (
    <Notice tone="ok" title="Committed to the ledger" testId="receipt">
      {children && <p className="mb-1">{children}</p>}
      <dl className="grid gap-1 sm:grid-cols-[8rem_1fr]">
        <dt className="text-ink-2">Transaction</dt><dd><Hash value={r.txId} href={govLink(r.txId)} external label="Copy transaction ID" /></dd>
        <dt className="text-ink-2">Function</dt><dd className="mono">{r.fn}</dd>
        <dt className="text-ink-2">Channel, block</dt><dd><ChannelChip channel={r.channel} /> <span className="mono">#{r.blockNumber}</span></dd>
        <dt className="text-ink-2">Endorsed by</dt><dd className="flex flex-wrap gap-1.5">{r.endorsers.map((o) => <OrgBadge key={o} org={o} />)}</dd>
      </dl>
    </Notice>
  );
}
