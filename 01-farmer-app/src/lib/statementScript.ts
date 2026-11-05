import type { Commodity, StatementLine } from '../contract/contract';
import { intToWords, rupeesInWords, spokenDate, type Lang } from './numberWords';

type T = (key: string, opts?: Record<string, unknown>) => string;
export interface ScriptLine { key: string; text: string }

const GRADE_SPOKEN: Record<Lang, Record<string, string>> = {
  bn: { A: 'এ', B: 'বি', C: 'সি' }, hi: { A: 'ए', B: 'बी', C: 'सी' }, en: { A: 'A', B: 'B', C: 'C' },
};
const CROP_CODE: Record<string, Commodity> = { POT: 'POTATO', PAD: 'PADDY', BRJ: 'BRINJAL', CAU: 'CAULIFLOWER' };
/** The crop is part of the lot reference (WB-PSM-KGP2-POT-FPO07-...), see CONTRACT.md section 3.1. Used only until the passport has loaded. */
export const commodityFromRef = (humanRef: string): Commodity | undefined => CROP_CODE[humanRef.split('-')[3] ?? ''];

/**
 * What "Read aloud" says, line by line, with every amount in words. `key` ties a spoken line to a row on screen
 * ('intro', 'gross', 'ded:<n>', 'net', 'paid') so the row can be highlighted while it is read.
 */
export function statementScript(s: StatementLine, cropName: string, lang: Lang, t: T, deductionName: (type: string) => string): ScriptLine[] {
  const say = (k: string, o: Record<string, unknown>) => t(`statement.say.${k}`, o);
  const lines: ScriptLine[] = [
    { key: 'intro', text: say('intro', { crop: cropName, kg: intToWords(Math.round(s.kg), lang), grade: GRADE_SPOKEN[lang][s.grade] ?? s.grade }) },
    { key: 'gross', text: say('gross', { amount: rupeesInWords(s.gross, lang) }) },
  ];
  if (s.deductions.length === 0) lines.push({ key: 'ded:none', text: say('noDeductions', {}) });
  else {
    lines.push({ key: 'ded:head', text: say('deductionsIntro', {}) });
    s.deductions.forEach((d, i) => lines.push({ key: `ded:${i}`, text: say('deduction', { name: deductionName(d.type), amount: rupeesInWords(d.amount, lang) }) }));
  }
  lines.push({ key: 'net', text: say('net', { amount: rupeesInWords(s.net, lang) }) });
  if (s.paidOn) lines.push({ key: 'paid', text: say('paid', { date: spokenDate(s.paidOn, lang) }) });
  return lines;
}
