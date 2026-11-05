'use client';
import { useEffect, useRef, useState } from 'react';
import { ExternalLink, ShieldCheck, X } from 'lucide-react';
import type { Proof } from '@/contract/contract';
import { api } from '@/lib/api';
import { formatDateTimeIST } from '@/lib/format';
import { useApi } from '@/lib/useApi';
import { govTxUrl } from '@/lib/portals';
import { ChannelChip, Hash, OrgBadge } from './ui';

/** Contract 9.3 item 1. Tx ID, channel, block, endorsers and commit time come from GET /ledger/tx/:id; nothing is filled in locally. */
export function ProofDrawer({ proof, onClose, title = 'Ledger proof' }: { proof: Proof; onClose: () => void; title?: string }) {
  const tx = useApi((s) => api.ledgerTx(proof.txId, s), [proof.txId]);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={title} className="h-full w-full max-w-md overflow-y-auto border-l border-line bg-surface p-5" onClick={(e) => e.stopPropagation()} data-testid="proof-drawer">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button ref={closeRef} className="btn !min-h-8 !px-2" onClick={onClose} aria-label="Close"><X className="h-4 w-4" aria-hidden /></button>
        </div>
        <dl className="mt-4 text-sm">
          <Row label="Transaction"><Hash value={proof.txId} href={govTxUrl(proof.txId)} external label="Copy transaction ID" /></Row>
          <Row label="Channel"><ChannelChip channel={proof.channel} /></Row>
          <Row label="Block"><span className="mono">#{proof.blockNumber}</span></Row>
          {tx.data && (
            <>
              <Row label="Function"><span className="mono">{tx.data.chaincode}.{tx.data.fn}</span></Row>
              <Row label="Endorsed by"><span className="flex flex-wrap gap-1.5">{tx.data.endorsers.map((o) => <OrgBadge key={o} org={o} />)}</span></Row>
              <Row label="Validation"><span className="inline-flex items-center gap-1"><ShieldCheck className="h-4 w-4 text-ok" aria-hidden />{tx.data.validationCode}</span></Row>
              <Row label="Committed">{formatDateTimeIST(tx.data.timestamp, true)}</Row>
            </>
          )}
          {tx.loading && <p className="py-3 text-ink-3">Loading endorsers and commit time…</p>}
          {tx.error && <p className="py-3 text-ink-2">Endorsers and commit time are not available for this transaction right now: {tx.error.message}</p>}
        </dl>
        <a className="btn mt-4 no-underline" href={govTxUrl(proof.txId)} target="_blank" rel="noreferrer">Open in the Gov explorer <ExternalLink className="h-4 w-4" aria-hidden /></a>
      </aside>
    </div>
  );
}
const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[7rem_1fr] gap-3 border-b border-line py-2.5 last:border-b-0"><dt className="text-ink-2">{label}</dt><dd className="min-w-0">{children}</dd></div>
);

export function ProofButton({ proof, label = 'Proof' }: { proof?: Proof; label?: string }) {
  const [open, setOpen] = useState(false);
  if (!proof) return <span className="text-ink-3">none</span>;
  return (
    <>
      <button type="button" className="btn !min-h-8 !px-2.5" onClick={() => setOpen(true)} aria-label={`${label}: transaction ${proof.txId}`}><ShieldCheck className="h-4 w-4" aria-hidden />{label}</button>
      {open && <ProofDrawer proof={proof} onClose={() => setOpen(false)} />}
    </>
  );
}
