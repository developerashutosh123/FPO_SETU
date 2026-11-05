import { isValidSscc } from '@/contract/contract';

/**
 * Turns what a crate label QR (or a typed value) contains into an SSCC.
 * The label encodes the GS1 Digital Link `{consumer URL}/00/{sscc}` (contract 9.2); a bare 18-digit SSCC and "(00)" element strings also work.
 * Returns null unless the SSCC passes the GS1 mod-10 check, so a misread never reaches the API.
 */
export function ssccFromScan(text: string): string | null {
  const t = text.trim();
  const m = /\/00\/(\d{18})(?:[/?#]|$)/.exec(t) ?? /^\(?00\)?\s*(\d{18})$/.exec(t) ?? /^(\d{18})$/.exec(t);
  const sscc = m?.[1];
  return sscc && isValidSscc(sscc) ? sscc : null;
}
