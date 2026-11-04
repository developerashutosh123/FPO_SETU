'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { RequireAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { T } from '@/lib/glossary';
import { Boundary, StateShell } from '@/components/states';
import { LienChip, inr } from '@/components/finance';
import { ProofButton } from '@/components/ProofDrawer';
import { PageHeader } from '@/components/ui';

/** "ENWR-..." searches by e-NWR, 18 digits by SSCC. Anything else cannot match and is explained instead of sent. */
function toQuery(term: string): { enwr?: string; sscc?: string } | 'invalid' {
  const t = term.trim();
  if (!t) return {};
  if (/^ENWR-/i.test(t)) return { enwr: t.toUpperCase() };
  if (/^\d{18}$/.test(t)) return { sscc: t };
  return 'invalid';
}

export function CollateralSearch() {
  return <RequireAuth>{() => <Inner />}</RequireAuth>;
}

function Inner() {
  const [input, setInput] = useState('');
  const [term, setTerm] = useState('');
  const query = toQuery(term);
  const state = useApi((s) => (query === 'invalid' ? Promise.resolve({ data: { items: [] }, mode: 'live' as const }) : api.collateral(query, s)), [term]);

  return (
    <>
      <PageHeader eyebrow="Collateral" title="Is this collateral real, and is it already pledged?">
        Search by <T k="enwr">e-NWR</T> or SSCC. The lien status below is read from the ledger, not from this bank&apos;s own books.
      </PageHeader>
      <form className="mb-5 flex flex-wrap gap-2" role="search" onSubmit={(e) => { e.preventDefault(); setTerm(input); }}>
        <label htmlFor="q" className="sr-only">e-NWR or SSCC</label>
        <input id="q" className="field max-w-md" placeholder="ENWR-NERL-2026-004212 or 18-digit SSCC" value={input} onChange={(e) => setInput(e.target.value)} />
        <button className="btn" data-variant="primary"><Search className="h-4 w-4" aria-hidden />Search</button>
        {term && <button type="button" className="btn" onClick={() => { setInput(''); setTerm(''); }}>Clear</button>}
      </form>
      {query === 'invalid' ? (
        <StateShell kind="empty" title="That is not an e-NWR or an SSCC" body="An e-NWR looks like ENWR-NERL-2026-004211 and an SSCC is 18 digits. Clear the box to list every receipt." />
      ) : (
        <Boundary state={state} skeleton={<StateShell kind="loading" title="Loading collateral" />} notFoundTitle="No receipt matches">
          {(page) =>
            page.items.length === 0 ? (
              <StateShell kind="empty" title="No receipt matches" body="Check the e-NWR or SSCC for typing mistakes. A receipt appears here after the FPO's warehouse clerk requests it." />
            ) : (
              <div className="card scroll-x">
                <table className="dtable" data-testid="collateral-table">
                  <thead>
                    <tr>
                      <th>e-NWR</th><th>Commodity</th><th>Facility</th>
                      <th className="num">Quantity (qtl)</th><th className="num"><T k="eligible">Eligible loan</T></th>
                      <th><T k="lien">Lien</T></th><th>Proof</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.items.map((c) => (
                      <tr key={c.enwr}>
                        <td>
                          <Link href={`/collateral/${c.enwr}`} className="mono">{c.enwr}</Link>
                          <div className="text-xs text-ink-3">{c.lot.humanRef}</div>
                        </td>
                        <td>{c.lot.commodity.charAt(0) + c.lot.commodity.slice(1).toLowerCase()}{c.lot.grade ? `, grade ${c.lot.grade}` : ''}</td>
                        <td>{c.facilityName}</td>
                        <td className="num">{c.quantityQtl.toFixed(2)}</td>
                        <td className="num">{inr(c.eligibleLoan)}</td>
                        <td><LienChip status={c.lien.status} /></td>
                        <td><ProofButton proof={c.lien.proof} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </Boundary>
      )}
    </>
  );
}
