/**
 * CORS allowlist match. Entries are exact origins ("https://fpo.example.com") or carry one or more "*" that each stand for ONE hostname
 * label ("https://fpo-console-*-myteam.vercel.app" matches every preview deployment of that project; it does not match "a.b" or a
 * different scheme or port). Exact entries behave as before; a bare "*" is not accepted.
 */
const cache = new Map<string, RegExp>();
const patternOf = (entry: string): RegExp => {
  let re = cache.get(entry);
  if (!re) {
    re = new RegExp(`^${entry.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]+')}$`);
    cache.set(entry, re);
  }
  return re;
};

export function originAllowed(allowed: readonly string[], origin: string): boolean {
  for (const entry of allowed) {
    if (entry === origin) return true;
    if (entry.includes('*') && entry !== '*' && patternOf(entry).test(origin)) return true;
  }
  return false;
}
