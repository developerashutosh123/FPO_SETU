import type { ReactNode } from 'react';
import Link from 'next/link';
import { ORG_DISPLAY, type Channel, type OrgMsp } from '@/contract/contract';
import { channelShort, shortOrg } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from './CopyButton';

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-8">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 className="mt-1.5 text-[1.625rem] font-semibold leading-tight tracking-tight sm:text-[2rem]">{title}</h1>
      {children && <div className="mt-3 max-w-3xl text-[15px] leading-relaxed text-ink-2">{children}</div>}
    </header>
  );
}

export function Chip({ tone, children, title }: { tone?: 'ok' | 'warn' | 'danger' | 'accent'; children: ReactNode; title?: string }) {
  return <Badge variant={tone ?? 'default'} title={title}>{children}</Badge>;
}

export const ChannelChip = ({ channel }: { channel: Channel }) => <Chip>{channelShort(channel)}-channel</Chip>;

export function OrgBadge({ org, full }: { org: OrgMsp | string; full?: boolean }) {
  const name = ORG_DISPLAY[org as OrgMsp];
  return (
    <Badge variant="outline" title={name ? `${name} (${org})` : org} className={full ? 'h-auto whitespace-normal' : undefined}>
      <span className="font-semibold text-ink">{shortOrg(org)}</span>
      {full && name && <span className="font-normal text-ink-3">{name}</span>}
    </Badge>
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
    <div className="grid gap-1 border-b border-line py-3.5 last:border-b-0 sm:grid-cols-[12rem_1fr] sm:gap-6">
      <dt className="text-sm font-medium text-ink-2">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="card mb-6 overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 border-b border-line bg-surface-2 px-4 py-3 sm:px-6">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {aside && <div className="text-sm text-ink-3">{aside}</div>}
      </div>
      <div className="px-4 py-1 sm:px-6">{children}</div>
    </section>
  );
}
