import { Check, ChevronDown, ExternalLink, MapPin, Minus, TriangleAlert } from 'lucide-react';
import type { Provenance } from '@/contract/contract';
import { formatDate, shortTx } from '@/lib/format';
import { fill, type Dict } from '@/lib/lang';
import { govTxUrl } from '@/lib/links';

type Tone = 'ok' | 'warn' | 'none';
const TONE_CLASS: Record<Tone, string> = { ok: 'bg-ok text-white', warn: 'bg-warn text-white', none: 'bg-line text-ink' };

/** One plain statement with a "how we know" expander. Native <details>: keyboard and screen-reader friendly, no JavaScript. */
function Check_({ tone, title, why, how }: { tone: Tone; title: string; why: string; how: string }) {
  const Icon = tone === 'ok' ? Check : tone === 'warn' ? TriangleAlert : Minus;
  return (
    <li className="border-b border-line last:border-b-0">
      <details>
        <summary className="flex min-h-14 items-center gap-3 py-3">
          <span aria-hidden className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${TONE_CLASS[tone]}`}><Icon className="h-4 w-4" strokeWidth={3} /></span>
          <span className="flex-1 text-lg font-semibold leading-snug">{title}</span>
          <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-accent">
            {how}
            <ChevronDown aria-hidden className="chev h-4 w-4 transition-transform" />
          </span>
        </summary>
        <p className="pb-4 pl-10 pr-2 text-ink-2">{why}</p>
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
      <p className="eyebrow">{t.lot.lotRef}</p>
      <p className="mono mt-1 text-ink-2">{p.humanRef}</p>
      <h1 className="mt-2 text-[2.25rem] font-semibold leading-tight tracking-tight sm:text-5xl">{commodity}</h1>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 text-xl text-ink-2">
        {p.variety && <span>{p.variety}</span>}
        {p.grade && <span className="chip">{fill(t.lot.gradeValue, { grade: p.grade })}</span>}
      </p>

      <p className="mt-6 flex items-start gap-3 text-xl leading-snug">
        <MapPin aria-hidden className="mt-1 h-5 w-5 shrink-0 text-accent-2" />
        <span>{fill(t.lot.grownIn, { village: p.village, block: p.block, district: p.district })}</span>
      </p>
      <p className="mt-2 pl-8 text-ink-2">{fill(t.lot.harvested, { date: formatDate(p.harvestOrUnloadDate) })}</p>

      {firstLink && (
        <p className="mt-5 pl-8">
          <a href={firstLink} className="tap tap-line" rel="noopener">
            {t.lot.ledgerLink}
            <ExternalLink aria-hidden className="h-4 w-4" />
          </a>
        </p>
      )}

      {indexOnly && (
        <p role="status" className="mt-6 rounded-md border border-warn bg-surface p-3 text-sm font-medium text-warn">{t.lot.indexOnly}</p>
      )}

      <section aria-labelledby="checks" className="mt-10 border-t border-ink pt-6">
        <h2 id="checks" className="eyebrow">{t.lot.checksTitle}</h2>
        <ul className="mt-2">
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

      <section aria-labelledby="journey" className="mt-10 border-t border-ink pt-6">
        <h2 id="journey" className="eyebrow">{t.lot.journeyTitle}</h2>
        <ol className="mt-4">
          {p.journey.map((j, i) => (
            <li key={`${j.at}-${i}`} className="relative pb-6 pl-8 last:pb-0">
              {i < p.journey.length - 1 && <span aria-hidden className="absolute left-[7px] top-4 h-full w-px bg-line" />}
              <span aria-hidden className="absolute left-0 top-1.5 h-[15px] w-[15px] rounded-full border-2 border-accent bg-canvas" />
              <p className="text-sm font-semibold text-ink-2">{formatDate(j.at)} · {t.lot.orgType[j.orgType] ?? j.orgType}</p>
              <p className="text-lg font-semibold leading-snug">{stepLabel(j.step)}</p>
              <p className="text-ink-2">{j.place}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="verify" className="mt-10 border-t border-ink pt-6">
        <details>
          <summary className="flex min-h-12 items-center justify-between gap-3">
            <h2 id="verify" className="text-xl font-semibold">{t.lot.verifyTitle}</h2>
            <ChevronDown aria-hidden className="chev h-5 w-5 shrink-0 text-accent transition-transform" />
          </summary>
          <p className="mt-2 text-ink-2">{t.lot.verifyBody}</p>
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

      <p className="mt-10 text-sm text-ink-2">{t.home.privacy} {t.lot.simulated}</p>
    </article>
  );
}
