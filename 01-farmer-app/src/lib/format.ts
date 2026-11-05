import { formatDateIST, formatINR } from '../contract/contract';

export { formatDateIST, formatINR };
/** 14:05 IST. */
export const formatTimeIST = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
/** `2026-11-13` (a plain date from the API) as DD-MM-YYYY without a timezone shift. */
export const formatPlainDate = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}` : formatDateIST(d));
export const formatKg = (kg: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(kg);
