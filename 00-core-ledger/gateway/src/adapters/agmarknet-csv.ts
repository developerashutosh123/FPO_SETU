// Loader for AGMARKNET history exports (CSV downloaded by hand from the AGMARKNET portal). Column names differ between report types,
// so headers are matched by alias. Rows that do not parse are counted and dropped, never repaired or invented.
import { TRACKED_COMMODITIES, TRACKED_MARKETS, type PriceRow } from './agmarknet.js';

const ALIASES = {
  date: ['reported date', 'price date', 'arrival date', 'arrival_date', 'date', 'reporting date'],
  market: ['market name', 'market', 'mandi', 'mandi name'],
  commodity: ['commodity', 'commodity name'],
  variety: ['variety'],
  min: ['min price (rs./quintal)', 'min price', 'min_price', 'minimum price', 'min price (rs/quintal)'],
  max: ['max price (rs./quintal)', 'max price', 'max_price', 'maximum price', 'max price (rs/quintal)'],
  modal: ['modal price (rs./quintal)', 'modal price', 'modal_price', 'modal price (rs/quintal)'],
} as const;

/** Minimal RFC 4180 CSV reader (quoted fields, doubled quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; }
    else f += c;
  }
  row.push(f); if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
export function csvDate(s: string): string | undefined {
  const t = s.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t); if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  m = /^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -,]+(\d{4})$/.exec(t); if (m && MONTHS[m[2]!.toLowerCase()]) return `${m[3]}-${MONTHS[m[2]!.toLowerCase()]}-${m[1]!.padStart(2, '0')}`;
  return undefined;
}
const num = (s: string | undefined) => { const n = Number((s ?? '').replace(/[,\s]/g, '')); return Number.isFinite(n) && n > 0 ? n : undefined; };
const norm = (s: string) => s.toLowerCase().replace(/[\s()]/g, '');

export interface CsvResult { rows: PriceRow[]; read: number; dropped: Record<string, number>; missingColumns: string[] }

export function parsePriceCsv(text: string, fileLabel: string, opts: { commodity?: string } = {}): CsvResult {
  const table = parseCsv(text.replace(/^﻿/, ''));
  const header = (table[0] ?? []).map((h) => h.trim().toLowerCase());
  const col = (k: keyof typeof ALIASES) => header.findIndex((h) => (ALIASES[k] as readonly string[]).includes(h));
  const idx = { date: col('date'), market: col('market'), commodity: col('commodity'), variety: col('variety'), min: col('min'), max: col('max'), modal: col('modal') };
  const missingColumns: string[] = (['date', 'market', 'min', 'max', 'modal'] as const).filter((k) => idx[k] < 0);
  if (idx.commodity < 0 && !opts.commodity) missingColumns.push('commodity (or pass --commodity)');
  const dropped: Record<string, number> = {};
  const drop = (why: string) => { dropped[why] = (dropped[why] ?? 0) + 1; };
  const rows: PriceRow[] = [];
  if (missingColumns.length) return { rows, read: Math.max(table.length - 1, 0), dropped, missingColumns };
  const markets = TRACKED_MARKETS.map(norm), commodities = TRACKED_COMMODITIES.map(norm);
  for (const r of table.slice(1)) {
    const date = csvDate(r[idx.date] ?? ''), market = (r[idx.market] ?? '').trim(), commodity = (idx.commodity >= 0 ? r[idx.commodity] ?? '' : opts.commodity ?? '').trim();
    const min = num(r[idx.min]), max = num(r[idx.max]), modal = num(r[idx.modal]);
    if (!date) { drop('unreadable date'); continue; }
    if (!min || !max || !modal) { drop('missing or non-positive price'); continue; }
    if (!markets.some((m) => norm(market).includes(m))) { drop('market not tracked'); continue; }
    if (!commodities.some((c) => norm(commodity).includes(c))) { drop('commodity not tracked'); continue; }
    rows.push({ date, market, commodity, variety: idx.variety >= 0 ? (r[idx.variety] ?? '').trim() : '', minPrice: min, maxPrice: max, modalPrice: modal, source: `AGMARKNET CSV ${fileLabel}` });
  }
  return { rows, read: table.length - 1, dropped, missingColumns };
}
