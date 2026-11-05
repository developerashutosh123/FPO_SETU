import en from '@/i18n/en.json';
import bn from '@/i18n/bn.json';

export type Lang = 'en' | 'bn';
export type Dict = typeof en;
export const LANGS: Lang[] = ['en', 'bn'];

const dicts: Record<Lang, Dict> = { en, bn: bn as unknown as Dict };

export function pickLang(value: string | string[] | undefined): Lang {
  const v = Array.isArray(value) ? value[0] : value;
  return v === 'bn' ? 'bn' : 'en';
}
export const dictFor = (lang: Lang): Dict => dicts[lang];

/** Replaces {name} placeholders. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

/** Link that keeps the language choice. */
export const withLang = (path: string, lang: Lang) => (lang === 'en' ? path : `${path}${path.includes('?') ? '&' : '?'}lang=${lang}`);
