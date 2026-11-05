import type { ReactNode } from 'react';
import Link from 'next/link';
import { ORG_DISPLAY, type Channel, type OrgMsp } from '@/contract/contract';
import { channelShort, shortOrg } from '@/lib/format';
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
  return <span className="chip" data-tone={tone} title={title}>{children}</span>;
}

export const ChannelChip = ({ channel }: { channel: Channel }) => <Chip>{channelShort(channel)}-channel</Chip>;

export function OrgBadge({ org }: { org: OrgMsp | string }) {
  const name = ORG_DISPLAY[org as OrgMsp];
  return (
    <span className="chip" data-tone="accent" title={name ? `${name} (${org})` : org}>
      <span className="font-semibold">{org}</span>
    </span>
  );
}
export { shortOrg };

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

/** A banking term with a keyboard-reachable explanation. */
export function Term({ children, tip }: { children: ReactNode; tip: ReactNode }) {
  return (
    <span className="term" tabIndex={0}>
      {children}
      <span className="tip" role="tooltip">{tip}</span>
    </span>
  );
}

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-line py-3.5 last:border-b-0 sm:grid-cols-[12rem_1fr] sm:gap-6">
      <dt className="text-sm font-medium text-ink-2">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

export function Section({ title, children, aside, id }: { title: ReactNode; children: ReactNode; aside?: ReactNode; id?: string }) {
  return (
    <section className="card mb-6 overflow-hidden" id={id}>
      <div className="flex items-baseline justify-between gap-3 border-b border-line bg-surface-2 px-4 py-3 sm:px-6">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {aside && <div className="text-sm text-ink-3">{aside}</div>}
      </div>
      <div className="px-4 py-1 sm:px-6">{children}</div>
    </section>
  );
}
