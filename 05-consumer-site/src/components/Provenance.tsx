import { Check, ChevronDown, ExternalLink, MapPin, Minus, Snowflake, Sprout, Store, Truck, TriangleAlert, Warehouse } from 'lucide-react';
import type { Provenance } from '@/contract/contract';
import { formatDate, formatDateTime, shortTx } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { BlurFade } from '@/components/ui/blur-fade';
import { Button } from '@/components/ui/button';
import { fill, type Dict } from '@/lib/lang';
import { govTxUrl } from '@/lib/links';

type Tone = 'ok' | 'warn' | 'none';
const TONE_CLASS: Record<Tone, string> = { ok: 'bg-ok text-white', warn: 'bg-warn text-white', none: 'bg-line text-ink' };
const RISE = { hidden: { y: 8 }, visible: { y: 0 } }; // slide only, so the record is never hidden before hydration
const ORG_ICON = { FPO: Sprout, COLD_STORAGE: Snowflake, WAREHOUSE: Warehouse, BUYER: Store, TRANSPORT: Truck } as const;

/** One plain statement with a "how we know" expander. Native <details>: keyboard and screen-reader friendly, no JavaScript. */
function Check_({ tone, title, why, how }: { tone: Tone; title: string; why: string; how: string }) {
  const Icon = tone === 'ok' ? Check : tone === 'warn' ? TriangleAlert : Minus;
  return (
    <li className="border-b border-line last:border-b-0">
      <details>
        <summary className="flex min-h-16 items-center gap-3 px-4 py-3">
          <span aria-hidden className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${TONE_CLASS[tone]}`}><Icon className="h-4 w-4" strokeWidth={2.75} /></span>
          <span className="flex-1 text-base font-semibold leading-snug">{title}</span>
          <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-accent">
            {how}
            <ChevronDown aria-hidden className="chev h-4 w-4 transition-transform" />
          </span>
        </summary>
        <p className="pb-4 pl-[3.75rem] pr-4 text-[15px] leading-relaxed text-ink-2">{why}</p>
      </details>
    </li>
  );
}

export function ProvenanceView({ p, t, indexOnly }: { p: Provenance; t: Dict; indexOnly: boolean }) {
  const commodity = t.commodity[p.commodity] ?? p.commodity;
  const stepLabel = (s: string) => (t.lot.steps as Record<string, string>)[s] ?? s;
  const firstProof = p.proofs[0];
  const firstLink = firstProof ? govTxUrl(firstProof.txId) : null;

  return (
    <article>
      <BlurFade variant={RISE} duration={0.5}>
        <div className="rounded-lg bg-accent px-6 py-7 text-white shadow-md sm:px-9 sm:py-9">
          <p className="text-[13px] font-semibold uppercase tracking-widest text-white/70">{t.lot.lotRef}</p>
          <p className="mono mt-1 text-white/80">{p.humanRef}</p>
          <h1 className="mt-4 text-[2.75rem] font-bold leading-none tracking-tight sm:text-6xl">{commodity}</h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xl text-white/90">
            {p.variety && <span>{p.variety}</span>}
            {p.grade && <Badge variant="outline" className="border-white/30 bg-white/15 px-3 py-1 text-sm font-semibold text-white">{fill(t.lot.gradeValue, { grade: p.grade })}</Badge>}
          </p>

          <div className="mt-7 max-w-xl border-t border-white/20 pt-5">
            <p className="flex items-start gap-3 text-lg leading-snug">
              <MapPin aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-[#F2C48D]" />
              <span>{fill(t.lot.grownIn, { village: p.village, block: p.block, district: p.district })}</span>
            </p>
            <p className="mt-1.5 pl-8 text-white/75">{fill(t.lot.harvested, { date: formatDate(p.harvestOrUnloadDate) })}</p>
          </div>

          {firstLink && (
            <p className="mt-6">
              <Button asChild size="lg" className="h-auto min-h-12 whitespace-normal rounded-full bg-white px-5 py-2 text-left text-accent shadow-none hover:bg-[#F1EEE6]">
                <a href={firstLink} rel="noopener">
                  {t.lot.ledgerLink}
                  <ExternalLink aria-hidden />
                </a>
              </Button>
            </p>
          )}
        </div>
      </BlurFade>

      {indexOnly && (
        <p role="status" className="note mt-5 font-medium text-warn" data-tone="warn">{t.lot.indexOnly}</p>
      )}

      <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_21rem] lg:grid-rows-[auto_1fr]">
        <section aria-labelledby="checks" className="lg:col-start-2 lg:row-start-1">
          <h2 id="checks" className="eyebrow">{t.lot.checksTitle}</h2>
          <ul className="card mt-3 overflow-hidden">
            <Check_
              tone={p.residueTested ? 'ok' : 'none'}
              title={p.residueTested ? t.lot.residueYes : t.lot.residueNo}
              why={p.residueTested ? t.lot.residueYesWhy : t.lot.residueNoWhy}
              how={t.lot.howWeKnow}
            />
            <Check_
              tone={p.phiCompliant ? 'ok' : 'warn'}
              title={p.phiCompliant ? t.lot.phiYes : t.lot.phiNo}
              why={p.phiCompliant ? t.lot.phiYesWhy : t.lot.phiNoWhy}
              how={t.lot.howWeKnow}
            />
            <Check_
              tone={p.coldChain.continuous ? 'ok' : 'warn'}
              title={p.coldChain.continuous ? t.lot.coldYes : t.lot.coldNo}
              why={p.coldChain.continuous ? t.lot.coldYesWhy : fill(t.lot.coldNoWhy, { count: p.coldChain.breaches })}
              how={t.lot.howWeKnow}
            />
          </ul>
        </section>

        <section aria-labelledby="journey" className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <h2 id="journey" className="eyebrow">{t.lot.journeyTitle}</h2>
          <p className="mt-2 text-sm text-ink-2">{t.lot.journeyNote}</p>
          <ol className="mt-6 border-t border-ink pt-6">
            {p.journey.map((j, i) => {
              const Icon = ORG_ICON[j.orgType] ?? Sprout;
              return (
                <li key={`${j.at}-${i}`} className="relative pb-8 pl-14 last:pb-0">
                  {i < p.journey.length - 1 && <span aria-hidden className="absolute left-[17px] top-10 h-[calc(100%-2.5rem)] w-px bg-line-strong" />}
                  <span aria-hidden className="absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-full border border-line-strong bg-surface text-accent"><Icon className="h-[18px] w-[18px]" /></span>
                  <p className="text-sm font-semibold text-ink-2">{formatDateTime(j.at)} · {t.lot.orgType[j.orgType] ?? j.orgType}</p>
                  <p className="mt-0.5 text-lg font-semibold leading-snug">{stepLabel(j.step)}</p>
                  <p className="text-ink-2">{j.place}</p>
                </li>
              );
            })}
          </ol>
        </section>

        <section aria-labelledby="verify" className="card self-start p-5 lg:col-start-2 lg:row-start-2">
          <details>
            <summary className="flex min-h-12 items-center justify-between gap-3">
              <h2 id="verify" className="text-lg font-semibold">{t.lot.verifyTitle}</h2>
              <ChevronDown aria-hidden className="chev h-5 w-5 shrink-0 text-accent transition-transform" />
            </summary>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{t.lot.verifyBody}</p>
            <h3 className="eyebrow mt-6">{t.lot.proofsTitle}</h3>
            {p.proofs.length === 0 ? (
              <p className="mt-2 text-ink-2">{t.lot.noProofs}</p>
            ) : (
              <ul className="mt-2">
                {p.proofs.map((pr) => {
                  const href = govTxUrl(pr.txId);
                  return (
                    <li key={pr.txId} className="border-b border-line py-3 last:border-b-0">
                      <p className="font-semibold">{t.lot.channels[pr.channel]} · {fill(t.lot.block, { n: pr.blockNumber.toLocaleString('en-IN') })}</p>
                      <p className="text-sm text-ink-2">{t.lot.channelMembers}: {t.lot.channelOrgs[pr.channel]}</p>
                      {href ? (
                        <a href={href} rel="noopener" title={pr.txId} className="mono mt-1 inline-flex min-h-12 items-center gap-2">
                          {shortTx(pr.txId)}
                          <ExternalLink aria-hidden className="h-4 w-4 shrink-0" />
                        </a>
                      ) : (
                        <p title={pr.txId} className="mono mt-1">{shortTx(pr.txId)} <span className="font-sans text-xs text-ink-2">({t.lot.noLink})</span></p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </details>
        </section>
      </div>

      <p className="mt-10 max-w-2xl text-sm leading-relaxed text-ink-2">{t.home.privacy} {t.lot.simulated}</p>
    </article>
  );
}
