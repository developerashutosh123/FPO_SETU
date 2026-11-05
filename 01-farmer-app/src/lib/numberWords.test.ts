import { describe, expect, it } from 'vitest';
import { intToWords, rupeesInWords, spokenDate } from './numberWords';

describe('Bengali number words', () => {
  it.each([
    [0, 'শূন্য'], [7, 'সাত'], [21, 'একুশ'], [29, 'ঊনত্রিশ'], [42, 'বিয়াল্লিশ'], [99, 'নিরানব্বই'], [100, 'এক শো'], [177, 'এক শো সাতাত্তর'],
    [1000, 'এক হাজার'], [3142, 'তিন হাজার এক শো বিয়াল্লিশ'], [25921, 'পঁচিশ হাজার নয় শো একুশ'], [31031, 'একত্রিশ হাজার একত্রিশ'],
    [100000, 'এক লাখ'], [120450, 'এক লাখ বিশ হাজার চার শো পঞ্চাশ'], [10000000, 'এক কোটি'], [2026, 'দুই হাজার ছাব্বিশ'],
  ])('%i', (n, words) => expect(intToWords(n, 'bn')).toBe(words));

  it('amounts in rupees, with paise only when there are some', () => {
    expect(rupeesInWords(25921, 'bn')).toBe('পঁচিশ হাজার নয় শো একুশ টাকা');
    expect(rupeesInWords(12.5, 'bn')).toBe('বারো টাকা পঞ্চাশ পয়সা');
  });
  it('dates', () => expect(spokenDate('2026-11-13', 'bn')).toBe('তেরো নভেম্বর দুই হাজার ছাব্বিশ'));
});

describe('English and Hindi', () => {
  it('English uses Indian grouping', () => {
    expect(intToWords(25921, 'en')).toBe('twenty-five thousand nine hundred and twenty-one');
    expect(intToWords(120450, 'en')).toBe('one lakh twenty thousand four hundred and fifty');
    expect(rupeesInWords(177, 'en')).toBe('one hundred and seventy-seven rupees');
  });
  it('Hindi reads grouped numerals', () => expect(rupeesInWords(25921, 'hi')).toBe('25,921 रुपये'));
});
