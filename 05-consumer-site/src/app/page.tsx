import { Sprout, Warehouse, User, QrCode, ArrowRight } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BlurFade } from '@/components/ui/blur-fade';
import { dictFor, pickLang } from '@/lib/lang';

const STEP_ICONS = [Sprout, Warehouse, User];
const RISE = { hidden: { y: 8 }, visible: { y: 0 } }; // slide only: the text is never hidden before hydration

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const lang = pickLang(sp.lang);
  const t = dictFor(lang);
  const invalid = sp.invalid === '1';

  return (
    <Shell lang={lang} t={t} path="/">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div>
          <BlurFade variant={RISE} duration={0.5}>
            <h1 className="text-[2.25rem] font-bold leading-[1.08] tracking-tight sm:text-5xl">{t.home.title}</h1>
          </BlurFade>
          <BlurFade variant={RISE} duration={0.5} delay={0.08}>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink-2">{t.home.lead}</p>
          </BlurFade>

          <BlurFade variant={RISE} duration={0.5} delay={0.16}>
            <p className="mt-8 flex items-start gap-3 border-y border-line py-4 text-ink-2">
              <QrCode aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
              <span>{t.home.scanHint}</span>
            </p>

            <form action="/lookup" method="get" className="mt-6" noValidate>
              <input type="hidden" name="lang" value={lang} />
              <label htmlFor="sscc" className="block text-sm font-semibold">{t.home.entryLabel}</label>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                <Input
                  id="sscc"
                  name="sscc"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={t.home.entryPlaceholder}
                  aria-describedby={invalid ? 'sscc-error' : undefined}
                  aria-invalid={invalid || undefined}
                  className="mono h-12 flex-1 px-4 text-base"
                />
                <Button type="submit" size="lg" className="h-12 px-6">
                  {t.home.entryButton}
                  <ArrowRight aria-hidden />
                </Button>
              </div>
              {invalid && <p id="sscc-error" role="alert" className="mt-3 font-medium text-danger">{t.home.invalid}</p>}
            </form>
          </BlurFade>
        </div>

        <section aria-labelledby="steps" className="lg:pt-3">
          <h2 id="steps" className="eyebrow">{t.home.stepsTitle}</h2>
          <ol className="mt-4 border-t border-ink">
            {t.home.steps.map((s, i) => {
              const Icon = STEP_ICONS[i] ?? Sprout;
              return (
                <li key={s.title} className="grid grid-cols-[2.5rem_1fr] gap-x-4 border-b border-line py-5">
                  <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-md bg-accent/10 text-accent"><Icon className="h-5 w-5" /></span>
                  <div>
                    <h3 className="text-lg font-semibold leading-snug">{i + 1}. {s.title}</h3>
                    <p className="mt-1 leading-relaxed text-ink-2">{s.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="mt-5 text-sm text-ink-2">{t.home.privacy}</p>
        </section>
      </div>
    </Shell>
  );
}
