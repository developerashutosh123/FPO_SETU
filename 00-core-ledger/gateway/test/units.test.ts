import { createHmac, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { canonicalJson, formatINR, ssccCheckDigit } from '../src/contract/contract.js';
import { HttpError, parseChaincodeMessage } from '../src/errors.js';
import { mapFabricError } from '../src/fabric/client.js';
import { decodeBlock } from '../src/fabric/decode.js';
import { expandEvents } from '../src/indexer/indexer.js';
import { parseRecords, isoDate, type DataGovRecord } from '../src/adapters/agmarknet.js';
import { assess } from '../src/services/valuation.js';
import { computeDeductions, loadRates } from '../src/services/rates.js';
import { derivedPriceSalt, farmerToken, hashCanonical, priceHash, sha256Hex, verifyP256 } from '../src/services/crypto.js';
import { simulateQuality, simulateWeighbridge } from '../src/services/devices.js';
import { humanRefOf, ssccFromSerial } from '../src/services/ids.js';
import { lotLabelPdf } from '../src/services/label.js';
import { addDays, istDate } from '../src/services/dates.js';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { join } from 'node:path';

describe('configuration', () => {
  it('names every missing or weak setting', () => {
    expect(() => loadConfig({} as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL[\s\S]*JWT_SECRET[\s\S]*FARMER_TOKEN_SECRET[\s\S]*PRICE_SALT_SECRET/);
    expect(() => loadConfig({ DATABASE_URL: 'x', JWT_SECRET: 'short', FARMER_TOKEN_SECRET: 'x'.repeat(32), PRICE_SALT_SECRET: 'x'.repeat(32) } as NodeJS.ProcessEnv)).toThrow(/at least 32/);
    const c = loadConfig({ DATABASE_URL: 'x', JWT_SECRET: 'x'.repeat(32), FARMER_TOKEN_SECRET: 'y'.repeat(32), PRICE_SALT_SECRET: 'z'.repeat(32), CORS_ORIGINS: 'https://a.example, https://b.example' } as NodeJS.ProcessEnv);
    expect(c.corsOrigins).toEqual(['https://a.example', 'https://b.example']);
    expect(c.PORT).toBe(8080);
  });
});

describe('error mapping', () => {
  it('pulls the chaincode error code and text out of a Fabric message', () => {
    const m = parseChaincodeMessage('endorsement failure during invoke. response: status:500 message:"ERR_DOUBLE_FINANCING: e-NWR X already has an active lien (tx abc)"');
    expect(m).toEqual({ code: 'ERR_DOUBLE_FINANCING', message: 'e-NWR X already has an active lien (tx abc)' });
    expect(parseChaincodeMessage('nothing to see')).toBeUndefined();
  });
  it('maps SDK errors: chaincode rule, unreachable peer, commit failure', () => {
    expect(mapFabricError({ message: 'x', details: [{ message: 'ERR_LOT_PLEDGED: lot is pledged' }] }).code).toBe('ERR_LOT_PLEDGED');
    expect(mapFabricError({ message: '14 UNAVAILABLE: No connection established' }).code).toBe('ERR_LEDGER_UNAVAILABLE');
    expect(mapFabricError({ name: 'CommitError', message: 'ENDORSEMENT_POLICY_FAILURE', transactionId: 'a'.repeat(64) }).extra.txId).toBe('a'.repeat(64));
    const h = new HttpError('ERR_NOT_FOUND', 'gone');
    expect(mapFabricError(h)).toBe(h);
    expect(h.status).toBe(404);
  });
});

describe('indexer event expansion', () => {
  const block = decodeBlock(readFileSync(join(__dirname, 'fixtures/blocks/commission-lot.pb')));
  const tx = block.txs.find((t) => t.fn === 'CommissionLot')!;
  it('turns a real LotCommissioned event into one row with the SSCC', () => {
    const rows = expandEvents('trace-channel', block.number, tx);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event: 'LotCommissioned', txId: tx.txId, channel: 'trace-channel', seq: 0 });
    expect(rows[0]!.sscc).toMatch(/^\d{18}$/);
  });
  it('expands alsoEmitted into one row per ledger event, same transaction, increasing seq', () => {
    const payload = { eventType: 'FarmerOnboarded', refs: { farmerToken: 'FT-1' }, epcList: [], alsoEmitted: ['PlotRegistered', 'ConsentGranted', 'NotAnEvent'] };
    const rows = expandEvents('trace-channel', 5, { ...tx, events: [{ name: 'FarmerOnboarded', chaincode: 'lot-lifecycle', payload: Buffer.from(JSON.stringify(payload)) }] });
    expect(rows.map((r) => [r.event, r.seq])).toEqual([['FarmerOnboarded', 0], ['PlotRegistered', 1], ['ConsentGranted', 2]]);
    expect(rows.every((r) => r.sscc === null)).toBe(true);
  });
  it('keeps the order id and e-NWR from refs and leaves multi-lot events without a single SSCC', () => {
    const payload = { eventType: 'PatronageDistributed', refs: { orderId: 'ORD-2026-00087', runId: 'PR-2026-11-001' }, epcList: ['089012340000004517', '089012340000004524'] };
    const [r] = expandEvents('trace-channel', 9, { ...tx, events: [{ name: 'PatronageDistributed', chaincode: 'lot-lifecycle', payload: Buffer.from(JSON.stringify(payload)) }] });
    expect(r).toMatchObject({ orderId: 'ORD-2026-00087', sscc: null });
    expect(expandEvents('trace-channel', 1, { ...tx, events: [{ name: 'x', chaincode: 'c', payload: Buffer.from('not json') }] })).toEqual([]);
  });
});

describe('crypto helpers', () => {
  it('farmer token is FT- plus 16 hex of the HMAC, stable per farmer and secret', () => {
    const t = farmerToken('s'.repeat(32), '11111111-1111-4111-8111-111111111111');
    expect(t).toMatch(/^FT-[0-9a-f]{16}$/);
    expect(t).toBe(`FT-${createHmac('sha256', 's'.repeat(32)).update('11111111-1111-4111-8111-111111111111').digest('hex').slice(0, 16)}`);
    expect(farmerToken('t'.repeat(32), '11111111-1111-4111-8111-111111111111')).not.toBe(t);
  });
  it('price hash is sha256 of the canonical JSON and the derived salt is the same for both parties', () => {
    const salt = derivedPriceSalt('p'.repeat(32), 'ORD-2026-00087');
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
    expect(salt).toBe(derivedPriceSalt('p'.repeat(32), 'ORD-2026-00087'));
    expect(priceHash('ORD-2026-00087', 1580, salt)).toBe(sha256Hex(`{"orderId":"ORD-2026-00087","pricePerQtl":1580,"salt":"${salt}"}`));
    expect(priceHash('ORD-2026-00087', 1581, salt)).not.toBe(priceHash('ORD-2026-00087', 1580, salt));
    expect(hashCanonical({ b: 1, a: 2 })).toBe(hashCanonical({ a: 2, b: 1 }));
  });
  it('verifies P-256 signatures in the contract wire format and rejects everything else', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const j = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
    const pub = '04' + Buffer.from(j.x, 'base64url').toString('hex') + Buffer.from(j.y, 'base64url').toString('hex');
    const msg = canonicalJson({ sscc: '089012340000004517', bagCount: 40 });
    const sig = sign('sha256', Buffer.from(msg), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('hex');
    expect(verifyP256(pub, sig, msg)).toBe(true);
    expect(verifyP256(pub, sig, msg.replace('40', '41'))).toBe(false);
    expect(verifyP256(pub, sig.slice(2) + '00', msg)).toBe(false);
    expect(verifyP256('04' + '11'.repeat(64), sig, msg)).toBe(false);
    expect(verifyP256('nothex', sig, msg)).toBe(false);
  });
});

describe('identifiers', () => {
  it('SSCC and human reference follow the contract', () => {
    expect(ssccFromSerial(451)).toBe('089012340000004517');
    const s = ssccFromSerial(1234);
    expect(ssccCheckDigit(s.slice(0, 17))).toBe(Number(s[17]));
    expect(humanRefOf('CHANGUAL', 'POTATO', 451, 2026)).toBe('WB-PSM-KGP2-POT-FPO07-2026-R-00451');
    expect(humanRefOf('GOPALPUR', 'PADDY', 470, 2026)).toBe('WB-PSM-KSY-PAD-FPO07-2026-K-00470');
    expect(humanRefOf('GOLGRAM', 'POTATO', 460, 2026)).toBe('WB-PSM-DBR-POT-FPO07-2026-R-00460');
  });
  it('dates are IST and addDays handles month ends', () => {
    expect(istDate(new Date('2026-11-14T20:00:00Z'))).toBe('2026-11-15');
    expect(addDays('2026-11-28', 7)).toBe('2026-12-05');
    expect(formatINR(120450).replace(/\s/g, '')).toBe('₹1,20,450');
  });
});

describe('rates and deductions', () => {
  const test = loadRates('test/e2e-rates.json');
  it('computes every deduction and rounds to the rupee', () => {
    const d = computeDeductions(test, { kg: 1964, gross: 31031 });
    expect(Object.fromEntries(d.map((x) => [x.type, x.amount]))).toEqual({ HAMALI: 196, MARKET_FEE: 155, COMMISSION: 310, TRANSPORT: 491, COLD_STORAGE_RENT: 1964, FPO_MARGIN: 621 });
  });
  it('refuses to compute while a rate is unsourced, and names the missing rates', () => {
    const real = JSON.parse(JSON.stringify(test)); for (const k of Object.keys(real.deductions)) { real.deductions[k].perQtl = null; real.deductions[k].pct = null; } // every rate unsourced
    expect(() => computeDeductions(real, { kg: 1000, gross: 10000 })).toThrowError(/COLD_STORAGE_RENT.*HAMALI|HAMALI.*COLD_STORAGE_RENT/);
    try { computeDeductions(real, { kg: 1, gross: 1 }); } catch (e) { expect((e as HttpError).code).toBe('ERR_VALIDATION'); expect((e as HttpError).extra.details).toEqual({ missing: expect.arrayContaining(['HAMALI', 'MARKET_FEE', 'COMMISSION', 'TRANSPORT', 'COLD_STORAGE_RENT']) }); }
  });
  it('valuation follows the contract formula and gives no value without a price basis', () => {
    expect(assess(test, 'POTATO', 19.64, { source: 's', market: 'm', date: 'd', modalPerQtl: 1350 })).toEqual({ haircutPct: 20, assessedValue: 21211, eligibleLoan: 14848 });
    expect(assess(test, 'POTATO', 19.64, undefined)).toEqual({ haircutPct: 20, assessedValue: 0, eligibleLoan: 0 });
  });
});

describe('AGMARKNET parsing (the records below are parser input only, never stored or shown as prices)', () => {
  const rec = (o: Partial<DataGovRecord>): DataGovRecord => ({ state: 'West Bengal', district: 'Paschim Medinipur', market: 'Medinipur(West)', commodity: 'Potato', variety: 'Jyoti', arrival_date: '14/11/2026', min_price: '1', max_price: '3', modal_price: '2', ...o });
  it('keeps tracked markets and commodities, converts dates, drops rows that do not parse and never repairs them', () => {
    const rows = parseRecords([rec({}), rec({ market: 'Kolkata' }), rec({ commodity: 'Mango' }), rec({ modal_price: 'NA' }), rec({ arrival_date: 'soon' }), rec({ min_price: '0' }), rec({ market: 'Ghatal', commodity: 'Paddy(Dhan)(Common)' })], 'test');
    expect(rows.map((r) => [r.market, r.commodity, r.date])).toEqual([['Medinipur(West)', 'Potato', '2026-11-14'], ['Ghatal', 'Paddy(Dhan)(Common)', '2026-11-14']]);
    expect(isoDate('2026-11-14')).toBe('2026-11-14');
  });
});

describe('simulated devices', () => {
  const now = new Date('2026-11-04T10:15:00Z');
  it('weighbridge: net within -2% to +1% of the nominal bag weight; gross = net + tare; reproducible', () => {
    for (let n = 0; n < 50; n++) {
      const r = simulateWeighbridge({ sscc: '089012340000004517', bagCount: 40 }, n, now);
      expect(r.netKg).toBeGreaterThanOrEqual(1960); expect(r.netKg).toBeLessThanOrEqual(2020); expect(r.grossKg - r.tareKg).toBe(r.netKg);
    }
    expect(simulateWeighbridge({ sscc: '089012340000004517', bagCount: 40 }, 3, now)).toEqual(simulateWeighbridge({ sscc: '089012340000004517', bagCount: 40 }, 3, now));
  });
  it('paddy readings stay inside the uniform specification (moisture 17.0, foreign matter 1.0, damaged 5.0)', () => {
    for (let n = 0; n < 200; n++) {
      const p = simulateQuality('PADDY', `0890123400000${String(n).padStart(5, '0')}`, n, now).paddy!;
      expect(p.moisturePct).toBeLessThanOrEqual(17); expect(p.foreignMatterPct).toBeLessThanOrEqual(1); expect(p.brokenPct).toBeLessThanOrEqual(5);
    }
  });
  it('each commodity gets its own section of the quality reading', () => {
    expect(simulateQuality('POTATO', 'x', 0, now).potato).toBeDefined();
    expect(simulateQuality('BRINJAL', 'x', 0, now).vegetable).toBeDefined();
    expect(simulateQuality('CAULIFLOWER', 'x', 0, now).paddy).toBeUndefined();
  });
});

describe('lot label', () => {
  it('is a 100 x 50 mm PDF with a QR', async () => {
    const pdf = await lotLabelPdf({ sscc: '089012340000004517', humanRef: 'WB-PSM-KGP2-POT-FPO07-2026-R-00451', commodity: 'POTATO', variety: 'Kufri Jyoti', grade: 'A', netKg: 1964, village: 'CHANGUAL', consumerUrl: 'https://consumer.example/' });
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-');
    expect(pdf.byteLength).toBeGreaterThan(2000);
    const { width, height } = (await PDFDocument.load(pdf)).getPage(0).getSize();
    expect([Math.round(width / (72 / 25.4)), Math.round(height / (72 / 25.4))]).toEqual([100, 50]);
  });
});

import { parsePriceCsv, csvDate, parseCsv } from '../src/adapters/agmarknet-csv.js';
describe('AGMARKNET CSV loader (the CSV text below is parser input only)', () => {
  const csv = '﻿State Name,District Name,Market Name,Variety,Group,Min Price (Rs./Quintal),Max Price (Rs./Quintal),Modal Price (Rs./Quintal),Reported Date\r\n' +
    'West Bengal,Paschim Medinipur,Medinipur(West),Jyoti,Vegetables,"1,000","1,200","1,100",14 Nov 2026\r\n' +
    'West Bengal,Paschim Medinipur,Medinipur(West),Jyoti,Vegetables,0,1200,1100,15 Nov 2026\r\n' +
    'West Bengal,Paschim Medinipur,Ghatal,Jyoti,Vegetables,900,1100,1000,13/11/2026\r\n' +
    'West Bengal,Howrah,Howrah,Jyoti,Vegetables,900,1100,1000,13/11/2026\r\n' +
    'West Bengal,Paschim Medinipur,Garbeta,Jyoti,Vegetables,900,1100,1000,whenever\r\n';
  it('maps headers by alias, handles thousands separators and date styles, and counts what it drops', () => {
    const r = parsePriceCsv(csv, 'potato.csv', { commodity: 'Potato' });
    expect(r.rows.map((x) => [x.date, x.market, x.minPrice, x.modalPrice])).toEqual([['2026-11-14', 'Medinipur(West)', 1000, 1100], ['2026-11-13', 'Ghatal', 900, 1000]]);
    expect(r.rows[0]!.source).toBe('AGMARKNET CSV potato.csv');
    expect(r.dropped).toEqual({ 'missing or non-positive price': 1, 'market not tracked': 1, 'unreadable date': 1 });
    expect(r.read).toBe(5);
  });
  it('refuses a layout it does not know instead of guessing', () => {
    expect(parsePriceCsv('a,b\n1,2\n', 'x.csv').missingColumns).toEqual(expect.arrayContaining(['date', 'market', 'min', 'max', 'modal']));
    expect(parsePriceCsv(csv, 'x.csv').missingColumns).toEqual(['commodity (or pass --commodity)']);
  });
  it('reads quoted fields and date formats', () => {
    expect(parseCsv('a,"b,c","d""e"\n1,2,3')).toEqual([['a', 'b,c', 'd"e'], ['1', '2', '3']]);
    expect([csvDate('2026-11-14'), csvDate('14/11/2026'), csvDate('14-11-2026'), csvDate('14 Nov 2026'), csvDate('nope')]).toEqual(['2026-11-14', '2026-11-14', '2026-11-14', '2026-11-14', undefined]);
  });
});

describe('shipped config/rates.json', () => {
  it('has a value and an honest status for every deduction; nothing is called SOURCED that is not', () => {
    const real = loadRates('config/rates.json');
    for (const [k, v] of Object.entries(real.deductions)) { expect((v.perQtl ?? v.pct), k).not.toBeNull(); expect(['SECONDARY', 'ASSUMPTION'], `${k} must not claim SOURCED`).toContain(v.status); expect(v.source, k).toMatch(/INDICATIVE/); }
    expect(real.deductions.COMMISSION.pct).toBe(7); expect(real.deductions.COLD_STORAGE_RENT.perQtl).toBe(170);
    expect(() => computeDeductions(real, { kg: 1000, gross: 10000 })).not.toThrow();
  });
});
