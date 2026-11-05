/**
 * The FPO side of F6. The buyer submits the same number independently; the gateway hashes
 * sha256(canonicalJson({orderId, pricePerQtl, salt})) for each submission and commits when the two hashes match.
 * So what matters here is that "1580", "1580.0" and "1,580" all become the same JSON number, and that we never send a salt
 * (the gateway then derives the same salt for both parties, contract section 7).
 */
export const MAX_PRICE_PER_QTL = 1_000_000;

export function parsePricePerQtl(text: string): { ok: true; value: number } | { ok: false; message: string } {
  const cleaned = text.trim().replace(/[₹,\s]/g, '');
  if (!cleaned) return { ok: false, message: 'Enter the price per quintal in rupees.' };
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { ok: false, message: 'Use digits only, with at most two decimal places. Example: 1580 or 1580.50.' };
  const value = Number(cleaned);
  if (!(value > 0)) return { ok: false, message: 'The price must be more than zero.' };
  if (value > MAX_PRICE_PER_QTL) return { ok: false, message: 'The price per quintal cannot be more than ₹10,00,000.' };
  return { ok: true, value };
}

/** UPI references are 12 digits and always shown with the SIM prefix (contract section 3.1). */
export function parseUpiRef(text: string): { ok: true; value: string } | { ok: false; message: string } {
  const digits = text.replace(/^SIM\s*/i, '').replace(/\s/g, '');
  if (!/^\d{12}$/.test(digits)) return { ok: false, message: 'A UPI reference is 12 digits. Example: 604512339876.' };
  return { ok: true, value: digits };
}
