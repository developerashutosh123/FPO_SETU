import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import bn from './bn.json';
import en from './en.json';
import hi from './hi.json';
import { kvGet, kvSet } from '../lib/kv';
import type { Lang } from '../lib/numberWords';

export const LANG_KEY = 'fposetu.farmer.lang';
export const LANGS: { code: Lang; native: string; speech: string }[] = [
  { code: 'bn', native: 'বাংলা', speech: 'bn-IN' },
  { code: 'hi', native: 'हिन्दी', speech: 'hi-IN' },
  { code: 'en', native: 'English', speech: 'en-IN' },
];
// Santali (Ol Chiki) is a stretch goal: add `sat.json` here and an entry in LANGS. Nothing else needs to change.

const isLang = (v: string | null): v is Lang => v === 'bn' || v === 'hi' || v === 'en';
export const hasChosenLang = () => isLang(kvGet(LANG_KEY));
export const setLang = (l: Lang) => { kvSet(LANG_KEY, l); void i18n.changeLanguage(l); };

const stored = kvGet(LANG_KEY);
void i18n.use(initReactI18next).init({
  resources: { bn: { translation: bn }, hi: { translation: hi }, en: { translation: en } },
  lng: isLang(stored) ? stored : 'bn', // Bengali is the default
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});
export default i18n;
