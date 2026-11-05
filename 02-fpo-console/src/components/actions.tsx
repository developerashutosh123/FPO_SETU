'use client';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import type { Role } from '@/contract/contract';
import { bankCollateralUrl, buyerLotUrl, consumerUrl, farmerLotUrl, govLotUrl } from '@/lib/portals';
import { useWritesEnabled, WRITES_PAUSED_REASON } from './AppShell';

/** A ledger-writing button. In index-only mode it is disabled and says why (contract 9.3 item 3). */
export function WriteButton({ children, disabled, title, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  const writes = useWritesEnabled();
  return <button {...rest} disabled={disabled || !writes} title={!writes ? WRITES_PAUSED_REASON : title}>{children}</button>;
}

export function SsccLink({ sscc, humanRef }: { sscc: string; humanRef?: string }) {
  return (
    <Link href={`/lots/${sscc}`} className="inline-flex flex-col no-underline hover:underline">
      {humanRef && <span className="mono font-medium">{humanRef}</span>}
      <span className="mono text-ink-3">{sscc}</span>
    </Link>
  );
}

/** "Open in…" for the portals this role may see (contract 9.2 and 9.4). The FPO sees every lot view; the bank view needs the e-NWR and is for the CEO. */
export function OpenIn({ sscc, enwr, role }: { sscc: string; enwr?: string; role: Role }) {
  const items = [
    { label: 'Consumer page', href: consumerUrl(sscc) },
    { label: 'Buyer view', href: buyerLotUrl(sscc) },
    ...(enwr && role === 'ceo' ? [{ label: 'Bank view', href: bankCollateralUrl(enwr) }] : []),
    { label: 'Gov explorer', href: govLotUrl(sscc) },
    { label: 'Farmer app', href: farmerLotUrl(sscc) },
  ];
  return (
    <nav aria-label="Open this lot in another portal" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span className="text-ink-3">Open in</span>
      {items.map((i) => <a key={i.label} href={i.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">{i.label}<ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>)}
    </nav>
  );
}
