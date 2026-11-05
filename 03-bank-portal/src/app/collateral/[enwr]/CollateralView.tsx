'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Info } from 'lucide-react';
import { formatDateIST, type Collateral } from '@/contract/contract';
import { api } from '@/lib/api';
import { RequireAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { T } from '@/lib/glossary';
import { fpoCollateralUrl, govLotUrl } from '@/lib/portals';
import { formatDateTimeIST } from '@/lib/format';
import { Boundary, StateShell } from '@/components/states';
import { LienChip, inr, loanIdFromLien } from '@/components/finance';
import { LienDialog, DuplicatePledgeButton } from '@/components/LienDialog';
import { ProofButton } from '@/components/ProofDrawer';
import { Chip, Field, Hash, PageHeader, Section, Term } from '@/components/ui';
import { WRITES_PAUSED_REASON, useWritesEnabled } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function CollateralView({ enwr }: { enwr: string }) {
  return <RequireAuth>{() => <Inner enwr={enwr} />}</RequireAuth>;
}

function Inner({ enwr }: { enwr: string }) {
  const state = useApi((s) => api.collateral({ enwr }, s), [enwr]);
  return (
    <Boundary state={state} skeleton={<StateShell kind="loading" title="Loading collateral" />} notFoundTitle="No receipt with this e-NWR">
      {(page) => {
        const c = page.items.find((x) => x.enwr === enwr);
        return c ? <View c={c} reload={state.reload} /> : (
          <StateShell kind="notfound" title="No receipt with this e-NWR" body="Check the e-NWR for typing mistakes." action={<Button asChild variant="outline"><Link href="/collateral">Back to search</Link></Button>} />
        );
      }}
    </Boundary>
  );
}

const CGS_CITATION = 'Scheme administered by NCGTC; lenders register on its portal. Cover percentages and fees are not shown here because the figures found so far disagree between sources. See docs/DATA_SOURCES.md.';

function View({ c, reload }: { c: Collateral; reload: () => void }) {
  const writes = useWritesEnabled();
  const [lienOpen, setLienOpen] = useState(false);
  const active = c.lien.status === 'ACTIVE';
  const storable = c.lot.status === 'IN_STORAGE';
  const loanId = loanIdFromLien(c.lien.lienId);

  return (
    <>
      <nav className="mb-3 text-sm"><Link href="/collateral">Collateral</Link> <span className="text-ink-3">/</span> <span className="mono">{c.enwr}</span></nav>
      <PageHeader eyebrow="Collateral" title={<span className="mono">{c.enwr}</span>}>
        <span className="flex flex-wrap items-center gap-2">
          <Chip title="The e-NWR repository is a simulated adapter; the lien itself is a real ledger transaction.">e-NWR issued via {c.repository} (simulated adapter)</Chip>
          <LienChip status={c.lien.status} />
        </span>
      </PageHeader>

      <div className="grid items-start gap-x-6 lg:grid-cols-2">
      <Section title="Lot summary">
        <dl>
          <Field label="Lot"><span className="mono">{c.lot.humanRef}</span></Field>
          <Field label="SSCC"><Hash value={c.lot.sscc} href={govLotUrl(c.lot.sscc)} external label="Copy SSCC" /></Field>
          <Field label="Commodity">{c.lot.commodity.charAt(0) + c.lot.commodity.slice(1).toLowerCase()}{c.lot.grade ? `, grade ${c.lot.grade}` : ''}</Field>
          <Field label="Facility">{c.facilityName}</Field>
          <Field label="Lot status"><span className="mono">{c.lot.status}</span></Field>
        </dl>
        <p className="flex items-start gap-2 border-t border-line py-3 text-sm text-ink-2"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />Personal data and cultivation records are not shared with lenders.</p>
      </Section>

      <Section title="Valuation" aside={<span>Read from the API; not recomputed here</span>}>
        <dl data-testid="valuation">
          <Field label="Quantity"><span className="num">{c.quantityQtl.toFixed(2)} qtl</span></Field>
          <Field label={<T k="modal">Modal price</T>}>
            <span className="num">{inr(c.priceBasis.modalPerQtl)} per qtl</span>
            <div className="mt-1 text-sm text-ink-2" data-testid="price-basis">
              {c.priceBasis.market}, {formatDateIST(c.priceBasis.date)}. Source: {c.priceBasis.source}
            </div>
          </Field>
          <Field label={<T k="haircut">Haircut</T>}><span className="num">{c.haircutPct}%</span></Field>
          <Field label={<T k="assessed">Assessed value</T>}>
            <span className="num text-xl font-semibold" data-testid="assessed">{inr(c.assessedValue)}</span>
            <div className="mt-1 text-sm text-ink-2">{c.quantityQtl.toFixed(2)} qtl × {inr(c.priceBasis.modalPerQtl)} × (1 − {c.haircutPct}%)</div>
          </Field>
          <Field label={<T k="ltv">LTV</T>}><span className="num">{c.ltvPct}%</span></Field>
          <Field label={<T k="eligible">Eligible loan</T>}>
            <span className="num text-xl font-semibold" data-testid="eligible">{inr(c.eligibleLoan)}</span>
            <div className="mt-1 text-sm text-ink-2">{inr(c.assessedValue)} × {c.ltvPct}%</div>
          </Field>
        </dl>
      </Section>

      </div>

      <Section title={<T k="lien">Lien status</T>} aside="From the ledger">
        <div className="flex flex-wrap items-center gap-3 py-3">
          <LienChip status={c.lien.status} />
          {c.lien.lienId && <span className="mono text-sm">{c.lien.lienId}</span>}
          {c.lien.bank && <span className="text-sm text-ink-2">held by {c.lien.bank}</span>}
          <ProofButton proof={c.lien.proof} label="Lien proof" />
          {loanId && <Link href={`/loans/${loanId}`} className="text-sm">Open loan {loanId}</Link>}
        </div>
        <div className="border-t border-line py-3">
          {active ? (
            <>
              <p className="text-sm text-ink-2">This receipt is already pledged. Release the lien from the loan page after repayment.</p>
              <DuplicatePledgeButton collateral={c} />
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => setLienOpen(true)} disabled={!writes || !storable}
                title={!writes ? WRITES_PAUSED_REASON : !storable ? `The lot is ${c.lot.status}; a lien needs a lot in storage.` : undefined} data-testid="mark-lien">
                Mark lien
              </Button>
              {!writes && <span className="text-sm text-warn">{WRITES_PAUSED_REASON}</span>}
              {writes && !storable && <span className="text-sm text-ink-2">The lot is {c.lot.status}, so it cannot be pledged now.</span>}
            </div>
          )}
        </div>
      </Section>

      <Section title="Storage condition history">
        {c.storageConditionHistory.length === 0 ? (
          <p className="py-3 text-sm text-ink-2">No temperature digests have been anchored for this lot. Paddy in a warehouse has none; potato in cold storage should.</p>
        ) : (
          <Table><TableHeader><TableRow><TableHead>Recorded</TableHead><TableHead className="num">Average °C</TableHead><TableHead>Note</TableHead></TableRow></TableHeader>
            <TableBody>{c.storageConditionHistory.map((h) => (
              <TableRow key={h.at}><TableCell>{formatDateTimeIST(h.at)}</TableCell><TableCell className="num">{h.avgC !== undefined ? h.avgC.toFixed(1) : ''}</TableCell><TableCell>{h.note}</TableCell></TableRow>
            ))}</TableBody></Table>
        )}
      </Section>

      <Section title="Attestor reputation" aside="Operator and devices that graded the lot">
        {c.attestorReputation.length === 0 ? <p className="py-3 text-sm text-ink-2">No attestor scores yet.</p> : (
          <Table><TableHeader><TableRow><TableHead>Attestor</TableHead><TableHead className="num">Score</TableHead></TableRow></TableHeader>
            <TableBody>{c.attestorReputation.map((a) => <TableRow key={a.attestor}><TableCell>{a.attestor}</TableCell><TableCell className="num">{a.score}</TableCell></TableRow>)}</TableBody></Table>
        )}
      </Section>

      <Section title={<Term tip={CGS_CITATION}>CGS-NPF eligibility</Term>} aside="Credit guarantee for e-NWR pledge finance">
        <div className="py-3" data-testid="cgs">
          <Chip tone={c.cgsNpfEligible ? 'ok' : undefined}>{c.cgsNpfEligible ? 'Eligible' : 'Not eligible'}</Chip>
          <p className="mt-2 text-sm text-ink-2">{c.cgsNpfReason}</p>
        </div>
      </Section>

      <p className="mb-6 flex flex-wrap gap-4 text-sm">
        <a href={fpoCollateralUrl(c.enwr)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">This receipt in the FPO console <ExternalLink className="h-4 w-4" aria-hidden /></a>
        <a href={govLotUrl(c.lot.sscc)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">This lot in the Gov explorer <ExternalLink className="h-4 w-4" aria-hidden /></a>
      </p>

      {lienOpen && <LienDialog collateral={c} onClose={() => setLienOpen(false)} onDone={reload} />}
    </>
  );
}
