import type { ReactNode } from 'react';
import Link from 'next/link';
import { ORG_DISPLAY, type Channel, type OrgMsp } from '@/contract/contract';
import { channelShort, shortOrg } from '@/lib/format';
import { CopyButton } from './CopyButton';

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
      {children && <div className="mt-2 max-w-3xl text-ink-2">{children}</div>}
    </header>
  );
}

export function Chip({ tone, children, title }: { tone?: 'ok' | 'warn' | 'danger' | 'accent'; children: ReactNode; title?: string }) {
  return <span className="chip" data-tone={tone} title={title}>{children}</span>;
}

export const ChannelChip = ({ channel }: { channel: Channel }) => <Chip>{channelShort(channel)}-channel</Chip>;

export function OrgBadge({ org, full }: { org: OrgMsp | string; full?: boolean }) {
  const name = ORG_DISPLAY[org as OrgMsp];
  return (
    <span className="chip" title={name ? `${name} (${org})` : org}>
      <span className="font-semibold text-ink">{shortOrg(org)}</span>
      {full && name && <span className="text-ink-3">{name}</span>}
    </span>
  );
}

/** Monospace identifier with a copy button. `full` shows the whole value (wraps), otherwise it is shortened. */
export function Hash({ value, full = true, href, label }: { value: string; full?: boolean; href?: string; label?: string }) {
  const shown = full || value.length <= 18 ? value : `${value.slice(0, 10)}…${value.slice(-6)}`;
  const text = <span className={`mono ${full ? 'break-all' : ''}`}>{shown}</span>;
  return (
    <span className="inline-flex items-start gap-1.5" title={value}>
      {href ? <Link href={href}>{text}</Link> : text}
      <CopyButton value={value} label={label ?? 'Copy'} />
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-line py-3 last:border-b-0 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="card mb-6 overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <h2 className="text-base font-semibold">{title}</h2>
        {aside && <div className="text-sm text-ink-3">{aside}</div>}
      </div>
      <div className="px-4 py-1 sm:px-5">{children}</div>
    </section>
  );
}
