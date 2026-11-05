'use client';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { RequireAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { T } from '@/lib/glossary';
import { Boundary, StateShell } from '@/components/states';
import { PageHeader } from '@/components/ui';
import { CollateralTable, ReceiptList } from './ReceiptList';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
  return (
    <>
      <PageHeader eyebrow="Collateral" title="Is this collateral real, and is it already pledged?">
        Search by <T k="enwr">e-NWR</T> or SSCC. The lien status below is read from the ledger, not from this bank&apos;s own books.
      </PageHeader>
      <form className="mb-5 flex flex-wrap gap-2" role="search" onSubmit={(e) => { e.preventDefault(); setTerm(input); }}>
        <label htmlFor="q" className="sr-only">e-NWR or SSCC</label>
        <Input id="q" className="max-w-md" placeholder="ENWR-NERL-2026-004212 or 18-digit SSCC" value={input} onChange={(e) => setInput(e.target.value)} />
        <Button><Search className="h-4 w-4" aria-hidden />Search</Button>
        {term && <Button variant="outline" type="button"  onClick={() => { setInput(''); setTerm(''); }}>Clear</Button>}
      </form>
      {query === 'invalid' ? (
        <StateShell kind="empty" title="That is not an e-NWR or an SSCC" body="An e-NWR looks like ENWR-NERL-2026-004211 and an SSCC is 18 digits. Clear the box to list every receipt." />
      ) : query.enwr || query.sscc ? (
        <SearchResult query={query} />
      ) : (
        <ReceiptList />
      )}
    </>
  );
}

/** One e-NWR or SSCC: a single filtered request, answered quickly by the gateway. */
function SearchResult({ query }: { query: { enwr?: string; sscc?: string } }) {
  const state = useApi((s) => api.collateral(query, s), [query.enwr, query.sscc]);

  return (
    <Boundary state={state} skeleton={<StateShell kind="loading" title="Loading collateral" />} notFoundTitle="No receipt matches">
      {(page) =>
        page.items.length === 0 ? (
          <StateShell kind="empty" title="No receipt matches" body="Check the e-NWR or SSCC for typing mistakes. A receipt appears here after the FPO's warehouse clerk requests it." />
        ) : (
          <CollateralTable rows={page.items} />
        )
      }
    </Boundary>
  );
}
