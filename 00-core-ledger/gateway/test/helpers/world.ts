// Seeds a throwaway database with one realistic index: a member, her sold-and-pledged lot, a deposit, a lien, an order and a patronage run.
import type { Db } from '../../src/db/client.js';
import { depositsView, farmers, ledgerEvents, liensView, loanTerms, lotsView, ordersView, patronageView, plots, tradePrices } from '../../src/db/schema.js';
import { PERSONAS, stableUuid } from '../../src/auth/personas.js';

export const W = {
  farmerId: stableUuid('anima.das'), token: 'FT-9c2e41a07b55d3f1', sscc: '089012340000004517', humanRef: 'WB-PSM-KGP2-POT-FPO07-2026-R-00451',
  enwr: 'ENWR-NERL-2026-004211', orderId: 'ORD-2026-00087', loanId: 'LN-2026-00040', price: 1580, runId: 'PR-2026-11-001',
  tx: (n: number) => n.toString(16).padStart(64, '0'),
};

export async function seedWorld(db: Db) {
  const phone = PERSONAS.find((p) => p.username === 'anima.das')!.phone!;
  await db.insert(farmers).values({ id: W.farmerId, token: W.token, name: 'Anima Das', nameLocal: 'অনিমা দাস', gender: 'F', phone, village: 'CHANGUAL', joinedOn: '2026-03-02', devicePublicKeyHex: '04' + 'ab'.repeat(64) });
  await db.insert(plots).values({ plotId: 'PL-7Q2M9X4K1A', farmerId: W.farmerId, areaHa: 0.8, crops: ['POTATO', 'PADDY'], polygonHash: 'f'.repeat(64) });
  const lot = {
    sscc: W.sscc, humanRef: W.humanRef, commodity: 'POTATO', variety: 'Kufri Jyoti', village: 'CHANGUAL', farmerToken: W.token, plotId: 'PL-7Q2M9X4K1A', bagCount: 40, estWeightKg: 2000, harvestOrUnloadDate: '2026-11-02',
    status: 'SOLD', originStatus: 'VERIFIED', grade: 'A', netKg: 1964, weighbridge: JSON.stringify({ at: '2026-11-04T10:15:00Z', deviceId: 'WB-CHG-01', grossKg: 3204, netKg: 1964, tareKg: 1240 }),
    quality: JSON.stringify({ at: '2026-11-04T10:17:00Z', deviceId: 'QM-CHG-01', potato: { cutsPct: 1.2, greeningPct: 0.8, rotPct: 0.4, sizeGradeMm: '45-55' } }), weighbridgeSigHex: '', qualitySigHex: '', facility: 'COLD_STORAGE', facilityRef: 'DEP-2026-00201', lienRef: 'LIEN-2026-00040',
    orderId: W.orderId, priceHash: 'e'.repeat(64), qualityOutcome: '', custody: [], digests: [], patronageRunId: '', createdAt: '2026-11-04T10:00:00Z', updatedAt: '2026-11-08T10:00:00Z', lastTxId: W.tx(7), farmerSignatureHex: '',
  };
  await db.insert(lotsView).values({ sscc: W.sscc, humanRef: W.humanRef, commodity: 'POTATO', variety: 'Kufri Jyoti', village: 'CHANGUAL', farmerToken: W.token, plotId: 'PL-7Q2M9X4K1A', status: 'SOLD', originStatus: 'VERIFIED', grade: 'A', bagCount: 40, estWeightKg: 2000, netKg: 1964, harvestOrUnloadDate: '2026-11-02', orderId: W.orderId, lot, lastTxId: W.tx(7) });
  await db.insert(depositsView).values({ depositId: 'DEP-2026-00201', sscc: W.sscc, deposit: { depositId: 'DEP-2026-00201', sscc: W.sscc, facility: 'COLD_STORAGE', facilityName: 'Rupnarayan Cold Storage (demo)', bags: 40, depositedAt: '2026-11-05', enwr: W.enwr, repository: 'NERL', txId: W.tx(3) } });
  await db.insert(liensView).values({ enwr: W.enwr, sscc: W.sscc, loanId: W.loanId, active: true, lien: { lienId: 'LIEN-2026-00040', enwr: W.enwr, sscc: W.sscc, loanId: W.loanId, bank: 'BankOrgMSP', active: true, txId: W.tx(5) }, loan: { loanId: W.loanId, enwr: W.enwr, sscc: W.sscc, lienId: 'LIEN-2026-00040', status: 'DISBURSED' } });
  await db.insert(loanTerms).values({ loanId: W.loanId, enwr: W.enwr, sscc: W.sscc, amount: 54000, tenureDays: 180, ratePct: 9.5, salt: 's'.repeat(16) });
  await db.insert(ordersView).values({ orderId: W.orderId, status: 'PRICE_AGREED', order: { orderId: W.orderId, channel: 'DIRECT', ssccs: [W.sscc], status: 'PRICE_AGREED', deliveryBy: '2026-11-18', priceHash: 'e'.repeat(64), agreedAt: '2026-11-08T10:00:00Z', qualityOutcome: '' } });
  await db.insert(tradePrices).values({ orderId: W.orderId, pricePerQtl: W.price, salt: 'x'.repeat(32), priceHash: 'e'.repeat(64), agreed: true, upiRef: '604512339876' });
  await db.insert(patronageView).values({ runId: W.runId, orderId: W.orderId, distributedAt: new Date('2026-11-13T10:00:00Z'), run: { runId: W.runId, orderId: W.orderId, settlementAmount: 31031, fpoMargin: 620, distributedAt: '2026-11-13T10:00:00Z', lines: [{ farmerToken: W.token, sscc: W.sscc, kg: 1964, gross: 31031, deductions: [{ type: 'FPO_MARGIN', amount: 620 }], net: 30411 }] } });
  const ev = (id: number, event: string, extra: Record<string, unknown> = {}) => ({ channel: 'trace-channel', blockNumber: id, txId: W.tx(id), seq: 0, event, sscc: W.sscc, orderId: null, enwr: null, at: new Date(`2026-11-0${Math.min(id, 9)}T10:00:00Z`), payload: { eventType: event, refs: {} }, ...extra });
  await db.insert(ledgerEvents).values([ev(1, 'LotCommissioned'), ev(2, 'LotGraded'), ev(3, 'DepositRecorded', { channel: 'finance-channel' }), ev(5, 'LienMarked', { channel: 'finance-channel', enwr: W.enwr }), ev(8, 'PriceAgreed', { channel: 'trade-channel', sscc: null, orderId: W.orderId })]);
}
