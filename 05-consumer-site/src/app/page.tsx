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
      <h1 className="text-[2.25rem] font-bold leading-[1.1] tracking-tight sm:text-[3.25rem]">{t.home.title}</h1>
      <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-2 sm:text-xl">{t.home.lead}</p>

      <p className="mt-8 flex items-start gap-4 rounded-2xl bg-accent p-5 text-white">
        <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15"><QrCode className="h-6 w-6" /></span>
        <span className="pt-0.5 leading-relaxed">{t.home.scanHint}</span>
      </p>

      <form action="/lookup" method="get" className="card mt-6 p-5 sm:p-6" noValidate>
        <input type="hidden" name="lang" value={lang} />
        <label htmlFor="sscc" className="block text-sm font-semibold">{t.home.entryLabel}</label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input
            id="sscc"
            name="sscc"
            inputMode="numeric"
            autoComplete="off"
            placeholder={t.home.entryPlaceholder}
            aria-describedby={invalid ? 'sscc-error' : undefined}
            aria-invalid={invalid || undefined}
            className="mono min-h-12 flex-1 rounded-full px-5 text-base"
          />
          <button type="submit" className="tap tap-primary justify-center">
            {t.home.entryButton}
            <ArrowRight aria-hidden className="h-4 w-4" />
          </button>
        </div>
        {invalid && <p id="sscc-error" role="alert" className="mt-3 font-medium text-danger">{t.home.invalid}</p>}
      </form>

      <section aria-labelledby="steps" className="mt-14">
        <h2 id="steps" className="eyebrow">{t.home.stepsTitle}</h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-3">
          {t.home.steps.map((s, i) => {
            const Icon = STEP_ICONS[i] ?? Sprout;
            return (
              <li key={s.title} className="card p-5">
                <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent"><Icon className="h-6 w-6" /></span>
                <h3 className="mt-4 text-lg font-semibold">{i + 1}. {s.title}</h3>
                <p className="mt-1.5 leading-relaxed text-ink-2">{s.body}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <p className="mt-10 text-sm text-ink-2">{t.home.privacy}</p>
    </Shell>
  );
}
