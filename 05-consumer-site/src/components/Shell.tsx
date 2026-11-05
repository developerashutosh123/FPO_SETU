import Link from 'next/link';
import { Sprout } from 'lucide-react';
import { LANGS, withLang, type Dict, type Lang } from '@/lib/lang';

const LANG_NAME: Record<Lang, string> = { en: 'English', bn: 'বাংলা' };
const LANG_TAG: Record<Lang, string> = { en: 'en', bn: 'bn' };

/** Page chrome. `path` is the current route, so the language links stay on the same page. */
export function Shell({ lang, t, path, children }: { lang: Lang; t: Dict; path: string; children: React.ReactNode }) {
  return (
    <div lang={LANG_TAG[lang]} className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:p-3">{t.skip}</a>
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-5 py-2.5">
          <Link href={withLang('/', lang)} className="flex min-h-12 items-center gap-2.5 no-underline">
            <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white"><Sprout className="h-5 w-5" /></span>
            <span className="text-lg font-bold tracking-tight text-accent">{t.brand}</span>
          </Link>
          <nav aria-label={t.language} className="flex rounded-full border border-line bg-surface p-1 shadow-sm">
            {LANGS.map((l) => (
              <Link
                key={l}
                href={withLang(path, l)}
                hrefLang={l}
                lang={LANG_TAG[l]}
                aria-current={l === lang ? 'true' : undefined}
                className={`flex min-h-10 min-w-12 items-center justify-center rounded-full px-4 text-sm font-semibold no-underline transition-colors ${l === lang ? 'bg-accent text-white' : 'text-ink-2 hover:bg-surface-2'}`}
              >
                {LANG_NAME[l]}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-5 py-8 sm:py-12">{children}</main>
    </div>
  );
}
