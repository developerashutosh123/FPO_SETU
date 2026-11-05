import { Sprout, Warehouse, User, QrCode, ArrowRight } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { dictFor, pickLang } from '@/lib/lang';

const STEP_ICONS = [Sprout, Warehouse, User];

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const lang = pickLang(sp.lang);
  const t = dictFor(lang);
  const invalid = sp.invalid === '1';

  return (
    <Shell lang={lang} t={t} path="/">
      <h1 className="text-[2rem] font-semibold leading-tight tracking-tight sm:text-4xl">{t.home.title}</h1>
      <p className="mt-4 text-lg text-ink-2">{t.home.lead}</p>

      <p className="mt-6 flex items-start gap-3 rounded-md border border-line bg-surface p-4 text-ink-2">
        <QrCode aria-hidden className="mt-1 h-5 w-5 shrink-0 text-accent" />
        <span>{t.home.scanHint}</span>
      </p>

      <form action="/lookup" method="get" className="mt-8" noValidate>
        <input type="hidden" name="lang" value={lang} />
        <label htmlFor="sscc" className="block font-semibold">{t.home.entryLabel}</label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input
            id="sscc"
            name="sscc"
            inputMode="numeric"
            autoComplete="off"
            placeholder={t.home.entryPlaceholder}
            aria-describedby={invalid ? 'sscc-error' : undefined}
            aria-invalid={invalid || undefined}
            className="mono min-h-12 flex-1 rounded-md border border-ink-2 bg-surface px-3 text-base"
          />
          <button type="submit" className="tap tap-primary justify-center">
            {t.home.entryButton}
            <ArrowRight aria-hidden className="h-4 w-4" />
          </button>
        </div>
        {invalid && <p id="sscc-error" role="alert" className="mt-3 font-medium text-danger">{t.home.invalid}</p>}
      </form>

      <section aria-labelledby="steps" className="mt-12 border-t border-line pt-8">
        <h2 id="steps" className="eyebrow">{t.home.stepsTitle}</h2>
        <ol className="mt-4 grid gap-6 sm:grid-cols-3">
          {t.home.steps.map((s, i) => {
            const Icon = STEP_ICONS[i] ?? Sprout;
            return (
              <li key={s.title}>
                <Icon aria-hidden className="h-6 w-6 text-accent-2" />
                <h3 className="mt-2 text-lg font-semibold">{i + 1}. {s.title}</h3>
                <p className="mt-1 text-ink-2">{s.body}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <p className="mt-10 text-ink-2">{t.home.privacy}</p>
    </Shell>
  );
}
