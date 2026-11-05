import { describe, expect, it } from 'vitest';
import { ssccFromScan } from './scan';

// 089012340000004517 is the contract's example SSCC (valid check digit); the demo company prefix 8901234 is fictional.
describe('ssccFromScan', () => {
  it('reads the GS1 Digital Link the crate label encodes', () => {
    expect(ssccFromScan('https://fposetu-consumer.vercel.app/00/089012340000004517')).toBe('089012340000004517');
    expect(ssccFromScan('http://localhost:3005/00/089012340000004517?x=1')).toBe('089012340000004517');
  });
  it('accepts a bare SSCC and a (00) element string, with spaces around', () => {
    expect(ssccFromScan(' 089012340000004517 ')).toBe('089012340000004517');
    expect(ssccFromScan('(00)089012340000004517')).toBe('089012340000004517');
  });
  it('rejects a wrong check digit, a short number and other text', () => {
    expect(ssccFromScan('089012340000004518')).toBeNull();
    expect(ssccFromScan('0890123400000045')).toBeNull();
    expect(ssccFromScan('https://example.com/00/089012340000004518')).toBeNull();
    expect(ssccFromScan('hello')).toBeNull();
  });
});
