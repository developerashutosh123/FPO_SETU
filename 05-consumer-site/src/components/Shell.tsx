import Link from 'next/link';
import { FOOTER_TEXT } from '@/contract/contract';
import { LANGS, withLang, type Dict, type Lang } from '@/lib/lang';

const LANG_NAME: Record<Lang, string> = { en: 'English', bn: 'বাংলা' };
const LANG_TAG: Record<Lang, string> = { en: 'en', bn: 'bn' };

/** Page chrome. `path` is the current route, so the language links stay on the same page. */
export function Shell({ lang, t, path, children }: { lang: Lang; t: Dict; path: string; children: React.ReactNode }) {
  return (
    <div lang={LANG_TAG[lang]} className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-sm focus:bg-surface focus:p-3">{t.skip}</a>
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-2">
          <Link href={withLang('/', lang)} className="flex min-h-12 flex-col justify-center no-underline">
            <span className="text-lg font-semibold tracking-tight text-accent">{t.brand}</span>
          </Link>
          <nav aria-label={t.language} className="flex">
            {LANGS.map((l) => (
              <Link
                key={l}
                href={withLang(path, l)}
                hrefLang={l}
                lang={LANG_TAG[l]}
                aria-current={l === lang ? 'true' : undefined}
                className={`flex min-h-12 min-w-12 items-center justify-center px-3 text-sm font-semibold no-underline ${l === lang ? 'border-b-2 border-accent text-ink' : 'text-accent'}`}
              >
                {LANG_NAME[l]}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-line">
        <p lang="en" className="mx-auto max-w-2xl px-4 py-5 text-sm text-ink-2">{FOOTER_TEXT}</p>
      </footer>
    </div>
  );
}
