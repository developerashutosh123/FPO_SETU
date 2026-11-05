'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Carrot, Filter, ShoppingCart, Snowflake, ShieldCheck, FlaskConical, Sprout, Wheat } from 'lucide-react';
import type { CatalogueItem, Village } from '@/contract/contract';
import { api, asApiError, type ApiClientError, type CatalogueQuery } from '@/lib/api';
import { RequireAuth } from '@/lib/auth';
import { formatDay, formatKg, formatQtl } from '@/lib/format';
import { COMMODITIES, VILLAGE_CODES, commodityLabel, villageFallbackName } from '@/lib/labels';
import { useApi } from '@/lib/useApi';
import { ErrorState, Skeleton, StateShell } from '@/components/states';
import { GradeChip } from '@/components/trade';
import { Chip, PageHeader } from '@/components/ui';

const PAGE = '24';

export function Catalogue() {
  return <RequireAuth>{() => <Inner />}</RequireAuth>;
}

interface Filters { commodity: string; grade: string; village: string; minQtl: string; variety: string }
const NONE: Filters = { commodity: '', grade: '', village: '', minQtl: '', variety: '' };

/** Pages through GET /catalogue. Server filters: commodity, grade, village, minQtl. Variety is not a query parameter, so it filters what was loaded. */
function useCatalogue(f: Filters) {
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [next, setNext] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiClientError | undefined>();
  const [tick, setTick] = useState(0);
  const [more, setMore] = useState<string | undefined>();
  const key = `${f.commodity}|${f.grade}|${f.village}|${f.minQtl}`;

  useEffect(() => {
    const ac = new AbortController();
    const query: CatalogueQuery = { commodity: f.commodity || undefined, grade: f.grade || undefined, village: f.village || undefined, minQtl: f.minQtl || undefined, limit: PAGE, cursor: more };
    setLoading(true); setError(undefined);
    api.catalogue(query, ac.signal)
      .then((r) => { if (ac.signal.aborted) return; setItems((prev) => (more ? [...prev, ...r.data.items] : r.data.items)); setNext(r.data.nextCursor); setLoading(false); })
      .catch((e) => { if (!ac.signal.aborted) { setError(asApiError(e)); setLoading(false); } });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, more, tick]);

  return {
    items, hasMore: !!next, loading, error,
    loadMore: () => setMore(next),
    reset: () => { setMore(undefined); setTick((t) => t + 1); },
    // a filter change restarts from the first page
    restart: () => setMore(undefined),
  };
}

function Inner() {
  const [form, setForm] = useState<Filters>(NONE);
  const [applied, setApplied] = useState<Filters>(NONE);
  const [selected, setSelected] = useState<string[]>([]);
  const cat = useCatalogue(applied);
  const villages = useApi((s) => api.villages(s), []);

  const villageName = useMemo(() => {
    const m = new Map<string, Village>((villages.data ?? []).map((v) => [v.code, v]));
    return (code: string) => m.get(code)?.name ?? villageFallbackName(code);
  }, [villages.data]);
  const villageOptions = villages.data ? villages.data.map((v) => ({ code: v.code, name: v.name })) : VILLAGE_CODES.map((c) => ({ code: c, name: villageFallbackName(c) }));

  const shown = cat.items.filter((i) => !applied.variety || (i.variety ?? '').toLowerCase().includes(applied.variety.trim().toLowerCase()));
  const chosen = cat.items.filter((i) => selected.includes(i.sscc));
  const chosenQtl = chosen.reduce((s, i) => s + i.quantityQtl, 0);
  const toggle = (sscc: string) => setSelected((s) => (s.includes(sscc) ? s.filter((x) => x !== sscc) : [...s, sscc]));
  const filtered = Object.values(applied).some(Boolean);

  return (
    <>
      <PageHeader eyebrow="Catalogue" title="Can I trust this consignment, and can I buy more of it?">
        Graded and stored lots from the FPO. Lots under a lien never appear here: the gateway leaves them out. Open a spec sheet to see the proofs each party signed.
      </PageHeader>

      <div className="grid items-start gap-6 lg:grid-cols-[17rem_1fr]">
      <form className="card grid gap-4 p-5 sm:grid-cols-2 lg:sticky lg:top-4 lg:grid-cols-1" role="search" aria-label="Filter the catalogue"
        onSubmit={(e) => { e.preventDefault(); setApplied(form); cat.restart(); }}>
        <Select label="Commodity" value={form.commodity} onChange={(v) => setForm({ ...form, commodity: v })} options={COMMODITIES.map((c) => ({ value: c.value, label: c.label }))} />
        <label className="text-sm font-semibold">Variety
          <input className="field mt-1" placeholder="e.g. Kufri" value={form.variety} onChange={(e) => setForm({ ...form, variety: e.target.value })} />
        </label>
        <Select label="Grade" value={form.grade} onChange={(v) => setForm({ ...form, grade: v })} options={['A', 'B', 'C'].map((g) => ({ value: g, label: `Grade ${g}` }))} />
        <label className="text-sm font-semibold">Minimum quintals
          <input className="field mt-1" inputMode="decimal" type="number" min="0" step="any" placeholder="e.g. 25" value={form.minQtl} onChange={(e) => setForm({ ...form, minQtl: e.target.value })} />
        </label>
        <Select label="Village" value={form.village} onChange={(v) => setForm({ ...form, village: v })} options={villageOptions.map((v) => ({ value: v.code, label: v.name }))} />
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
          <button className="btn flex-1" data-variant="primary"><Filter className="h-4 w-4" aria-hidden />Apply</button>
          {filtered && <button type="button" className="btn" onClick={() => { setForm(NONE); setApplied(NONE); cat.restart(); }}>Clear</button>}
        </div>
      </form>

      <div className="min-w-0">
      {cat.error && !cat.items.length ? (
        <ErrorState error={cat.error} onRetry={cat.reset} />
      ) : cat.loading && !cat.items.length ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" data-testid="catalogue-loading" role="status" aria-label="Loading lots">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-72 w-full !rounded-xl" />)}
        </div>
      ) : shown.length === 0 ? (
        <StateShell kind="empty" title={filtered ? 'No lot matches these filters' : 'No lots are on offer right now'}
          body={filtered ? 'Widen the filters, or clear them to list every lot on offer.' : 'A lot appears here once the FPO has graded it and it is not under a lien.'}
          action={filtered ? <button className="btn" onClick={() => { setForm(NONE); setApplied(NONE); cat.restart(); }}>Clear filters</button> : undefined} />
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-label="Lots on offer" data-testid="catalogue-list">
          {shown.map((lot) => (
            <li key={lot.sscc} className="flex"><LotRow lot={lot} village={villageName(lot.village)} checked={selected.includes(lot.sscc)} onToggle={() => toggle(lot.sscc)} /></li>
          ))}
        </ul>
      )}

      {cat.hasMore && (
        <div className="mt-4 text-center">
          <button className="btn" onClick={cat.loadMore} disabled={cat.loading}>{cat.loading ? 'Loading…' : 'Load more lots'}</button>
        </div>
      )}

      {selected.length > 0 && (
        <div className="sticky bottom-3 z-20 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-strong bg-surface p-3.5 shadow-lg" data-testid="order-bar">
          <p className="text-sm"><strong>{selected.length}</strong> {selected.length === 1 ? 'lot' : 'lots'} selected{chosen.length === selected.length && ` · ${formatQtl(chosenQtl)}`}</p>
          <div className="flex gap-2">
            <button className="btn" onClick={() => setSelected([])}>Clear selection</button>
            <Link className="btn no-underline" data-variant="primary" href={`/orders/new?${selected.map((s) => `sscc=${s}`).join('&')}`} data-testid="start-order">
              <ShoppingCart className="h-4 w-4" aria-hidden />Create order<ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      )}
      </div>
      </div>
    </>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="text-sm font-semibold">{label}
      <select className="field mt-1" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

/** Chips for the three trust signals the catalogue promises: cold-chain continuity, PHI compliance, residue test. All come from the API. */
export function TrustChips({ lot }: { lot: Pick<CatalogueItem, 'coldChain' | 'phiCompliant' | 'residueTested'> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {lot.coldChain.continuous
        ? <Chip tone="ok"><Snowflake className="h-3 w-3" aria-hidden />Cold chain continuous</Chip>
        : <Chip tone="danger"><Snowflake className="h-3 w-3" aria-hidden />{lot.coldChain.breaches} cold-chain {lot.coldChain.breaches === 1 ? 'breach' : 'breaches'}</Chip>}
      {lot.phiCompliant
        ? <Chip tone="ok"><Sprout className="h-3 w-3" aria-hidden />PHI compliant</Chip>
        : <Chip tone="warn" title="Harvest fell inside a pre-harvest interval window"><Sprout className="h-3 w-3" aria-hidden />PHI not met</Chip>}
      {lot.residueTested
        ? <Chip tone="ok"><FlaskConical className="h-3 w-3" aria-hidden />Residue tested</Chip>
        : <Chip title="No residue credential on the ledger for this lot"><ShieldCheck className="h-3 w-3" aria-hidden />Not residue tested</Chip>}
    </div>
  );
}

function LotRow({ lot, village, checked, onToggle }: { lot: CatalogueItem; village: string; checked: boolean; onToggle: () => void }) {
  const Icon = lot.commodity === 'PADDY' ? Wheat : lot.commodity === 'POTATO' ? Sprout : Carrot;
  return (
    <article className="card flex w-full flex-col overflow-hidden transition-shadow hover:shadow-md" data-testid="lot-card" data-sscc={lot.sscc}
      style={checked ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent)' } : undefined}>
      <div className="relative flex h-28 items-center justify-center" style={{ background: 'color-mix(in srgb, var(--accent-2) 16%, var(--surface))' }} aria-hidden>
        <Icon className="h-12 w-12" style={{ color: 'color-mix(in srgb, var(--accent-2) 70%, var(--ink))' }} strokeWidth={1.5} />
        <span className="absolute left-3 top-3"><GradeChip grade={lot.grade} /></span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-5">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold leading-snug">{commodityLabel(lot.commodity)}{lot.variety ? ` · ${lot.variety}` : ''}</h2>
          <p className="mono mt-1 break-all text-ink-2">{lot.humanRef}</p>
        </div>
        <TrustChips lot={lot} />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-sm">
          <div><dt className="text-ink-3">Quantity</dt>
            <dd className="font-semibold" data-testid="lot-qty">{formatKg(lot.netKg)} <span className="font-normal text-ink-2">({formatQtl(lot.quantityQtl)})</span></dd></div>
          <div><dt className="text-ink-3">Harvest or unloading</dt><dd>{formatDay(lot.harvestOrUnloadDate)}</dd></div>
          <div><dt className="text-ink-3">Village</dt><dd className="font-semibold" data-testid="lot-village">{village}, {lot.block}</dd></div>
          {lot.facilityName && <div><dt className="text-ink-3">Stored at</dt><dd>{lot.facilityName}</dd></div>}
        </dl>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
          <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={checked} onChange={onToggle} aria-label={`Add ${lot.humanRef} to an order`} />
            Add to order
          </label>
          <Link href={`/lots/${lot.sscc}`} className="btn" data-testid="spec-link">Spec sheet<ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </div>
      </div>
    </article>
  );
}
