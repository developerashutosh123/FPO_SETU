const IST = 'Asia/Kolkata';

/** DD-MM-YYYY in IST (contract section 3.4). Accepts a date-only string (YYYY-MM-DD, kept as is) or an ISO timestamp. */
export function formatDate(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: IST, day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}-${p.month}-${p.year}`;
}

/** DD-MM-YYYY, HH:MM IST (24-hour) for an ISO timestamp. Date-only or unparseable input falls back to formatDate. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(d.getTime())) return formatDate(iso);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: IST, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${formatDate(iso)}, ${p.hour}:${p.minute} IST`;
}

/** First 8 and last 6 characters of a tx ID, for display. The full ID stays in the link and the title. */
export const shortTx = (tx: string) => (tx.length > 18 ? `${tx.slice(0, 8)}…${tx.slice(-6)}` : tx);
