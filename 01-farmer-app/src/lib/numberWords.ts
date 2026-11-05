export type Lang = 'bn' | 'hi' | 'en';

/** Bengali number names are irregular all the way to 99, so they are a table. _review: needs a native speaker's check (CONTRACT.md section 10). */
const BN_0_99 = [
  'শূন্য', 'এক', 'দুই', 'তিন', 'চার', 'পাঁচ', 'ছয়', 'সাত', 'আট', 'নয়',
  'দশ', 'এগারো', 'বারো', 'তেরো', 'চোদ্দ', 'পনেরো', 'ষোলো', 'সতেরো', 'আঠারো', 'উনিশ',
  'বিশ', 'একুশ', 'বাইশ', 'তেইশ', 'চব্বিশ', 'পঁচিশ', 'ছাব্বিশ', 'সাতাশ', 'আটাশ', 'ঊনত্রিশ',
  'ত্রিশ', 'একত্রিশ', 'বত্রিশ', 'তেত্রিশ', 'চৌত্রিশ', 'পঁয়ত্রিশ', 'ছত্রিশ', 'সাঁইত্রিশ', 'আটত্রিশ', 'ঊনচল্লিশ',
  'চল্লিশ', 'একচল্লিশ', 'বিয়াল্লিশ', 'তেতাল্লিশ', 'চুয়াল্লিশ', 'পঁয়তাল্লিশ', 'ছেচল্লিশ', 'সাতচল্লিশ', 'আটচল্লিশ', 'ঊনপঞ্চাশ',
  'পঞ্চাশ', 'একান্ন', 'বাহান্ন', 'তিপ্পান্ন', 'চুয়ান্ন', 'পঞ্চান্ন', 'ছাপ্পান্ন', 'সাতান্ন', 'আটান্ন', 'ঊনষাট',
  'ষাট', 'একষট্টি', 'বাষট্টি', 'তেষট্টি', 'চৌষট্টি', 'পঁয়ষট্টি', 'ছেষট্টি', 'সাতষট্টি', 'আটষট্টি', 'ঊনসত্তর',
  'সত্তর', 'একাত্তর', 'বাহাত্তর', 'তিয়াত্তর', 'চুয়াত্তর', 'পঁচাত্তর', 'ছিয়াত্তর', 'সাতাত্তর', 'আটাত্তর', 'ঊনআশি',
  'আশি', 'একাশি', 'বিরাশি', 'তিরাশি', 'চুরাশি', 'পঁচাশি', 'ছিয়াশি', 'সাতাশি', 'অষ্টাশি', 'ঊননব্বই',
  'নব্বই', 'একানব্বই', 'বিরানব্বই', 'তিরানব্বই', 'চুরানব্বই', 'পঁচানব্বই', 'ছিয়ানব্বই', 'সাতানব্বই', 'আটানব্বই', 'নিরানব্বই',
];
const EN_0_19 = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
  'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

const enBelow100 = (n: number) => (n < 20 ? EN_0_19[n]! : EN_TENS[Math.floor(n / 10)]! + (n % 10 ? `-${EN_0_19[n % 10]}` : ''));

/** Indian grouping: crore, lakh, thousand, hundred. Hindi reads digits (the speech engine says them correctly), so it uses numerals. */
const SCALES: { v: number; bn: string; en: string }[] = [
  { v: 10_000_000, bn: 'কোটি', en: 'crore' },
  { v: 100_000, bn: 'লাখ', en: 'lakh' },
  { v: 1_000, bn: 'হাজার', en: 'thousand' },
  { v: 100, bn: 'শো', en: 'hundred' },
];

/** A whole number in words. Bengali and English are spelled out; Hindi returns the Indian-grouped numeral. */
export function intToWords(n: number, lang: Lang): string {
  const v = Math.floor(Math.abs(n));
  if (lang === 'hi') return new Intl.NumberFormat('en-IN').format(v);
  const parts: string[] = [];
  let rest = v;
  for (const s of SCALES) {
    const q = Math.floor(rest / s.v);
    if (q > 0) { parts.push(`${intToWords(q, lang)} ${lang === 'bn' ? s.bn : s.en}`); rest -= q * s.v; }
  }
  if (rest > 0 || parts.length === 0) {
    parts.push(lang === 'bn' ? BN_0_99[rest]! : enBelow100(rest));
  }
  const text = parts.join(' ');
  return lang === 'en' && parts.length > 1 && rest > 0 ? text.replace(/ ([^ ]+(?:-[^ ]+)?)$/, ' and $1') : text;
}

/** Rupee amount in words, paise only when present. 25921 -> "পঁচিশ হাজার নয় শো একুশ টাকা". */
export function rupeesInWords(amount: number, lang: Lang): string {
  const total = Math.round(Math.abs(amount) * 100);
  const rupees = Math.floor(total / 100);
  const paise = total % 100;
  if (lang === 'hi') return `${intToWords(rupees, 'hi')} रुपये${paise ? ` ${paise} पैसे` : ''}`;
  if (lang === 'en') return `${intToWords(rupees, 'en')} rupees${paise ? ` and ${intToWords(paise, 'en')} paise` : ''}`;
  return `${intToWords(rupees, 'bn')} টাকা${paise ? ` ${intToWords(paise, 'bn')} পয়সা` : ''}`;
}

const BN_MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const HI_MONTHS = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-11-13" -> a date as it is spoken ("তেরো নভেম্বর দুই হাজার ছাব্বিশ"). Anything that is not YYYY-MM-DD is returned unchanged. */
export function spokenDate(ymd: string, lang: Lang): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (lang === 'bn') return `${intToWords(day, 'bn')} ${BN_MONTHS[month - 1]} ${intToWords(year, 'bn')}`;
  return `${day} ${(lang === 'hi' ? HI_MONTHS : EN_MONTHS)[month - 1]} ${year}`;
}
