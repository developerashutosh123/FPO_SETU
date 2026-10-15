// Deterministic generator for shared/fixtures/*.json. Run: pnpm gen:fixtures
// Everything is derived from one small "world" so fixtures cross-reference correctly (SSCCs, orders, loans, tx IDs).
// Tx IDs and block/data hashes are placeholders prefixed FIXTURE-. Prices, rates and quality numbers are fixture values, not statistics.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTRACT_VERSION, canonicalJson, ssccCheckDigit, ORG_DISPLAY,
  type OrgMsp, type Channel, type Commodity, type Grade, type LotStatus, type VillageCode, type Role, type Portal,
  type Proof, type LotPassport, type FarmerPrivate, type Village, type Collateral, type Loan, type Order, type StatementLine,
  type Deduction, type Kpi, type PricePoint, type Provenance, type LedgerEventName, type StreamEvent, type TxDetail, type BlockSummary,
  type BlockDetail, type SessionUser, type LedgerStatus, type CustodyHop, type FacilityType,
} from '../contract.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'fixtures');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const fx = (label: string) => `FIXTURE-${sha(label).slice(0, 12)}`;
const uuid = (label: string) => { const h = sha(`uuid:${label}`); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
const NOW = Date.UTC(2026, 10, 14, 12, 32, 0); // 14-11-2026 18:02 IST
const iso = (minBefore: number) => new Date(NOW - Math.round(minBefore) * 60_000).toISOString().replace('.000Z', 'Z');
const D = 1440; // minutes per day
const day = (minBefore: number) => iso(minBefore).slice(0, 10);

// ---------------------------------------------------------------- villages (Nominatim, see source fields)
const UA_NOTE = 'Nominatim (OpenStreetMap), queried 15-10-2026 with a descriptive User-Agent at 1 request/second';
const nom = (q: string) => `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&addressdetails=1`;
const VILLAGES: Village[] = [
  { code: 'CHANGUAL', name: 'Changual', nameBn: 'চাঙ্গুয়াল', block: 'Kharagpur-II', gp: 'Changual', lat: 22.3106292, lon: 87.3795312, role: 'PILOT', precision: 'LANDMARK',
    source: `${nom('Changual, Paschim Medinipur')} -> OSM node 7199853335 "Changual BPHC", Kharagpur-II. ${UA_NOTE}.`, note: 'Point is the Changual BPHC building, a landmark in the village, not the village centroid. Inside the Kharagpur-II bounding box (OSM relation 9707865... see block row of villages.json _meta).' },
  { code: 'GOLGRAM', name: 'Golgram', nameBn: 'গোলগ্রাম', block: 'Debra', gp: 'Golgram', lat: 22.4392393, lon: 87.5915109, role: 'PILOT', precision: 'BLOCK_CENTROID',
    source: `${nom('Golgram, Paschim Medinipur')} returned no result; Overpass search for names like Golgram in the district bounding box returned none. Fallback: Debra block centre, OSM relation 9707865 (${nom('Debra, Paschim Medinipur')}).`, note: 'Golgram is not mapped in OpenStreetMap. This is the Debra block centre, not the village. Human must supply village coordinates or an LGD code.' },
  { code: 'GOPALPUR', name: 'Gopalpur', nameBn: 'গোপালপুর', block: 'Keshiary', lat: 22.1310979, lon: 87.2311939, role: 'PILOT', precision: 'BLOCK_CENTROID',
    source: `${nom('Gopalpur, Keshiary')} returned no result; ${nom('Gopalpur, West Bengal, India')} lists Gopalpur villages only in Bankura, Birbhum, Maldah and South 24 Parganas, none in Paschim Medinipur. Fallback: Keshiary block centre, OSM relation 9707867 (${nom('Keshiary, West Bengal')}).`, note: 'Gopalpur (Keshiary) is not mapped in OpenStreetMap. This is the Keshiary block centre, not the village. Human must confirm the village on the Census 2011 directory or LGD and supply coordinates.' },
  { code: 'SANKOA', name: 'Sankoa', nameBn: 'শাঁকোয়া', block: 'Kharagpur-II', gp: 'Sankoa', lat: 22.2859564, lon: 87.4111218, role: 'COMPARISON', precision: 'LANDMARK',
    source: `${nom('Sankoa, Paschim Medinipur')} -> OSM way 325360021 "Sankoa GC High School", Kharagpur-II. ${UA_NOTE}.`, note: 'Point is Sankoa GC High School, a landmark in the village.' },
  { code: 'DUAN', name: 'Duan', nameBn: 'দুয়ান', block: 'Debra', gp: 'Duan', lat: 22.3547622, lon: 87.5849584, role: 'COMPARISON', precision: 'LANDMARK',
    source: `${nom('Duan, Debra')} -> OSM node 2913390420 "Duan" railway halt on NH16, Debra block, postcode 721124. ${UA_NOTE}.`, note: 'Point is Duan railway halt, a landmark at the village.' },
];
const villageName = (c: VillageCode) => VILLAGES.find((v) => v.code === c)!;

// ---------------------------------------------------------------- personas
interface Persona { username: string; displayName: string; role: Role; org: OrgMsp; portal: Portal; extraPortals?: Portal[] }
const PERSONAS: Persona[] = [
  { username: 'anima.das', displayName: 'Anima Das', role: 'member', org: 'FpoOrgMSP', portal: 'farmer' },
  { username: 'subhankar.vle', displayName: 'Subhankar Maity', role: 'vle', org: 'FpoOrgMSP', portal: 'farmer', extraPortals: ['fpo'] },
  { username: 'sujata.ceo', displayName: 'Sujata Jana', role: 'ceo', org: 'FpoOrgMSP', portal: 'fpo' },
  { username: 'debasis.ops', displayName: 'Debasis Mondal', role: 'operator', org: 'FpoOrgMSP', portal: 'fpo' },
  { username: 'ratan.store', displayName: 'Ratan Pal', role: 'warehouse', org: 'FpoOrgMSP', portal: 'fpo' },
  { username: 'arindam.bank', displayName: 'Arindam Ghosh', role: 'credit_officer', org: 'BankOrgMSP', portal: 'bank' },
  { username: 'rahul.buyer', displayName: 'Rahul Agarwal', role: 'buyer_manager', org: 'BuyerOrgMSP', portal: 'buyer' },
  { username: 'observer.gov', displayName: 'District monitoring officer', role: 'observer', org: 'RegulatorOrgMSP', portal: 'gov' },
  { username: 'board.fpo', displayName: 'FPO board member', role: 'board', org: 'FpoOrgMSP', portal: 'gov' },
];
const userOf = (p: Persona, portal: Portal = p.portal): SessionUser => ({ id: uuid(p.username), username: p.username, role: p.role, org: p.org, displayName: p.displayName, portal });
const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const fixtureJwt = (u: SessionUser) => `${b64u({ alg: 'none', typ: 'JWT' })}.${b64u({ sub: u.id, username: u.username, role: u.role, org: u.org, displayName: u.displayName, portal: u.portal, iss: 'FIXTURE' })}.FIXTURE`;

// ---------------------------------------------------------------- farmers
interface FarmerSpec { key: string; name: string; nameLocal: string; gender: 'F' | 'M'; village: VillageCode; phone: string; areaHa: number; crops: Commodity[]; token?: string; plotId?: string; erased?: boolean; joined: string }
const FARMERS: FarmerSpec[] = [
  { key: 'anima', name: 'Anima Das', nameLocal: 'অনিমা দাস', gender: 'F', village: 'CHANGUAL', phone: '9000000001', areaHa: 0.8, crops: ['POTATO', 'PADDY'], token: 'FT-9c2e41a07b55d3f1', plotId: 'PL-7Q2M9X4K1A', joined: '2026-03-02' },
  { key: 'haradhan', name: 'Haradhan Mahato', nameLocal: 'হরধন মাহাতো', gender: 'M', village: 'CHANGUAL', phone: '9000000002', areaHa: 1.2, crops: ['POTATO', 'PADDY'], joined: '2026-03-02' },
  { key: 'parul', name: 'Parul Samanta', nameLocal: 'পারুল সামন্ত', gender: 'F', village: 'CHANGUAL', phone: '9000000003', areaHa: 0.6, crops: ['POTATO'], joined: '2026-03-03' },
  { key: 'kalyani', name: 'Kalyani Giri', nameLocal: 'কল্যাণী গিরি', gender: 'F', village: 'CHANGUAL', phone: '9000000004', areaHa: 0.4, crops: ['BRINJAL', 'CAULIFLOWER'], joined: '2026-03-05' },
  { key: 'santosh', name: '', nameLocal: '', gender: 'M', village: 'CHANGUAL', phone: '', areaHa: 0.5, crops: ['POTATO'], erased: true, joined: '2026-03-05' },
  { key: 'sabita', name: 'Sabita Pal', nameLocal: 'সবিতা পাল', gender: 'F', village: 'GOLGRAM', phone: '9000000006', areaHa: 1.0, crops: ['POTATO'], joined: '2026-03-09' },
  { key: 'gobinda', name: 'Gobinda Bera', nameLocal: 'গোবিন্দ বেরা', gender: 'M', village: 'GOLGRAM', phone: '9000000007', areaHa: 1.5, crops: ['POTATO', 'PADDY'], joined: '2026-03-09' },
  { key: 'dulal', name: 'Dulal Jana', nameLocal: 'দুলাল জানা', gender: 'M', village: 'GOLGRAM', phone: '9000000008', areaHa: 0.9, crops: ['POTATO'], joined: '2026-03-10' },
  { key: 'sukumar', name: 'Sukumar Murmu', nameLocal: 'সুকুমার মুর্মু', gender: 'M', village: 'GOPALPUR', phone: '9000000009', areaHa: 1.1, crops: ['PADDY'], joined: '2026-03-16' },
  { key: 'budhni', name: 'Budhni Hembram', nameLocal: 'বুধনি হেমব্রম', gender: 'F', village: 'GOPALPUR', phone: '9000000010', areaHa: 0.7, crops: ['PADDY'], joined: '2026-03-16' },
];
const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const plotIdOf = (key: string) => { const h = createHash('sha256').update(`plot:${key}`).digest(); return 'PL-' + Array.from({ length: 10 }, (_, i) => B32[h[i]! % 32]).join(''); };
const farmerOf = (key: string) => FARMERS.find((f) => f.key === key)!;
const tokenOf = (f: FarmerSpec) => f.token ?? `FT-${sha(`token:${f.key}`).slice(0, 16)}`;
const plotOf = (f: FarmerSpec) => f.plotId ?? plotIdOf(f.key);
const polygonHash = (f: FarmerSpec) => { const v = villageName(f.village); const d = 0.0006; const o = { type: 'Polygon', coordinates: [[[v.lon, v.lat], [v.lon + d, v.lat], [v.lon + d, v.lat + d], [v.lon, v.lat + d], [v.lon, v.lat]]] }; return sha(canonicalJson(o)); };
const farmerPrivate = (f: FarmerSpec): FarmerPrivate => ({
  farmerToken: tokenOf(f), village: f.village, gender: f.gender, joinedOn: f.joined, erased: !!f.erased,
  id: uuid(`farmer:${f.key}`), name: f.name, nameLocal: f.nameLocal, phone: f.phone, preferredLang: f.village === 'GOPALPUR' ? 'bn' : 'bn',
  plots: [{ plotId: plotOf(f), areaHa: f.areaHa, crops: f.crops, polygonHash: polygonHash(f) }],
});

// ---------------------------------------------------------------- tx registry
type CC = 'lot-lifecycle' | 'pledge-lien' | 'order-settlement';
const CC_CHANNEL: Record<CC, Channel> = { 'lot-lifecycle': 'trace-channel', 'pledge-lien': 'finance-channel', 'order-settlement': 'trade-channel' };
interface TxDef { label: string; cc: CC; fn: string; minBefore: number; creator: OrgMsp; endorsers: OrgMsp[]; reads: string[]; writes: string[]; events: { event: LedgerEventName; sscc?: string; orderId?: string; enwr?: string }[] }
const txDefs: TxDef[] = [];
const FPO: OrgMsp = 'FpoOrgMSP', BANK: OrgMsp = 'BankOrgMSP', BUYER: OrgMsp = 'BuyerOrgMSP', REG: OrgMsp = 'RegulatorOrgMSP';
const TRACE_MAJORITY: OrgMsp[][] = [[FPO, BANK, BUYER], [FPO, BANK, REG], [FPO, BUYER, REG]];
function tx(label: string, cc: CC, fn: string, minBefore: number, creator: OrgMsp, keys: { reads?: string[]; writes: string[] }, events: TxDef['events'], endorsers?: OrgMsp[]): string {
  const maj = TRACE_MAJORITY[parseInt(sha(label).slice(0, 2), 16) % 3]!;
  const e = endorsers ?? (cc === 'lot-lifecycle' ? (creator === FPO ? maj : [...new Set<OrgMsp>([creator, FPO, ...maj])].slice(0, 3)) : cc === 'pledge-lien' ? [FPO, BANK] : [FPO, BUYER]);
  txDefs.push({ label, cc, fn, minBefore, creator, endorsers: e, reads: keys.reads ?? keys.writes, writes: keys.writes, events });
  return label;
}
let TXS: Map<string, { txId: string; channel: Channel; blockNumber: number; def: TxDef; time: string }>;
const HEIGHT: Record<Channel, number> = { 'trace-channel': 1284, 'finance-channel': 311, 'trade-channel': 207 };
function finalizeTxs() {
  TXS = new Map();
  const labels = new Set<string>();
  for (const ch of Object.keys(HEIGHT) as Channel[]) {
    const list = txDefs.filter((t) => CC_CHANNEL[t.cc] === ch).sort((a, b) => b.minBefore - a.minBefore || a.label.localeCompare(b.label));
    list.forEach((def, i) => {
      if (labels.has(def.label)) throw new Error(`duplicate tx label ${def.label}`);
      labels.add(def.label);
      TXS.set(def.label, { txId: fx(def.label), channel: ch, blockNumber: HEIGHT[ch] - list.length + i, def, time: iso(def.minBefore) });
    });
  }
}
const T = (label: string) => { const t = TXS.get(label); if (!t) throw new Error(`unknown tx ${label}`); return t; };
const proof = (label: string): Proof => { const t = T(label); return { txId: t.txId, blockNumber: t.blockNumber, channel: t.channel }; };
const receipt = (label: string) => { const t = T(label); return { txId: t.txId, channel: t.channel, chaincode: t.def.cc, fn: t.def.fn, blockNumber: t.blockNumber, validationCode: 'VALID' as const, endorsers: t.def.endorsers, committedAt: t.time }; };

// ---------------------------------------------------------------- lots
const SSCC_PREFIX = '8901234'; // fictional demo GS1 company prefix
const ssccOf = (serial: number) => { const body = `0${SSCC_PREFIX}${String(serial).padStart(9, '0')}`; return body + ssccCheckDigit(body); };
const BLOCK_CODE: Record<string, string> = { 'Kharagpur-II': 'KGP2', Debra: 'DBR', Keshiary: 'KSY' };
const CROP_CODE: Record<Commodity, string> = { POTATO: 'POT', PADDY: 'PAD', BRINJAL: 'BRJ', CAULIFLOWER: 'CAU' };
const SEASON: Record<Commodity, string> = { POTATO: 'R', PADDY: 'K', BRINJAL: 'R', CAULIFLOWER: 'R' };

type Stage = 'DRAFT' | 'COMMISSIONED' | 'GRADED' | 'IN_STORAGE' | 'PLEDGED' | 'LISTED' | 'SOLD' | 'IN_TRANSIT' | 'DELIVERED' | 'SETTLED' | 'CLOSED' | 'TRANSFORMED' | 'REJECTED' | 'UNVERIFIABLE';
interface LotSpec {
  serial: number; farmer: string; commodity: Commodity; variety: string; bags: number; netKg?: number; grade?: Grade; stage: Stage;
  offset: number; // minutes, to keep timestamps unique
  facility?: FacilityType; facilityName?: string; enwr?: string; repo?: 'NERL' | 'CCRL'; loan?: string; loanReleased?: boolean; order?: string; breach?: boolean; harvest: string;
}
const COLD = 'Rupnarayan Cold Storage (demo)', WH = 'Kansai Agri Warehouse (demo)';
const LOTS: LotSpec[] = [
  { serial: 451, farmer: 'anima', commodity: 'POTATO', variety: 'Kufri Jyoti', bags: 40, netKg: 1964, grade: 'A', stage: 'CLOSED', offset: 0, facility: 'COLD_STORAGE', facilityName: COLD, enwr: 'ENWR-NERL-2026-004211', repo: 'NERL', loan: 'LN-2026-00040', loanReleased: true, order: 'ORD-2026-00087', harvest: '2026-11-02' },
  { serial: 455, farmer: 'haradhan', commodity: 'POTATO', variety: 'Kufri Pukhraj', bags: 60, netKg: 2950, grade: 'A', stage: 'CLOSED', offset: 3, facility: 'COLD_STORAGE', facilityName: COLD, order: 'ORD-2026-00087', harvest: '2026-11-02' },
  { serial: 456, farmer: 'parul', commodity: 'POTATO', variety: 'Kufri Chipsona', bags: 36, netKg: 1790, grade: 'A', stage: 'CLOSED', offset: 6, facility: 'COLD_STORAGE', facilityName: COLD, order: 'ORD-2026-00087', harvest: '2026-11-03' },
  { serial: 452, farmer: 'anima', commodity: 'POTATO', variety: 'Kufri Jyoti', bags: 30, netKg: 1480, grade: 'A', stage: 'PLEDGED', offset: 9, facility: 'COLD_STORAGE', facilityName: COLD, enwr: 'ENWR-NERL-2026-004212', repo: 'NERL', loan: 'LN-2026-00041', harvest: '2026-11-04' },
  { serial: 453, farmer: 'haradhan', commodity: 'POTATO', variety: 'Kufri Pukhraj', bags: 50, netKg: 2480, grade: 'B', stage: 'GRADED', offset: 12, harvest: '2026-11-10' },
  { serial: 454, farmer: 'parul', commodity: 'POTATO', variety: 'Kufri Chipsona', bags: 44, netKg: 2190, grade: 'A', stage: 'LISTED', offset: 15, facility: 'COLD_STORAGE', facilityName: COLD, order: 'ORD-2026-00091', harvest: '2026-11-05' },
  { serial: 460, farmer: 'sabita', commodity: 'POTATO', variety: 'Kufri Jyoti', bags: 80, netKg: 3960, grade: 'A', stage: 'SOLD', offset: 18, facility: 'COLD_STORAGE', facilityName: COLD, order: 'ORD-2026-00088', harvest: '2026-11-03' },
  { serial: 461, farmer: 'gobinda', commodity: 'POTATO', variety: 'Kufri Pukhraj', bags: 70, netKg: 3430, grade: 'A', stage: 'IN_TRANSIT', offset: 21, facility: 'COLD_STORAGE', facilityName: COLD, order: 'ORD-2026-00089', harvest: '2026-11-03' },
  { serial: 462, farmer: 'gobinda', commodity: 'POTATO', variety: 'Kufri Jyoti', bags: 64, netKg: 3120, grade: 'A', stage: 'DELIVERED', offset: 24, facility: 'COLD_STORAGE', facilityName: COLD, order: 'ORD-2026-00090', breach: true, harvest: '2026-11-04' },
  { serial: 496, farmer: 'sabita', commodity: 'POTATO', variety: 'Kufri Jyoti', bags: 24, netKg: 1150, grade: 'B', stage: 'REJECTED', offset: 27, facility: 'COLD_STORAGE', facilityName: COLD, order: 'ORD-2026-00092', harvest: '2026-11-04' },
  { serial: 495, farmer: 'dulal', commodity: 'POTATO', variety: 'Kufri Chipsona', bags: 30, netKg: 1460, grade: 'C', stage: 'TRANSFORMED', offset: 30, harvest: '2026-11-06' },
  { serial: 497, farmer: 'santosh', commodity: 'POTATO', variety: 'Kufri Jyoti', bags: 20, netKg: 980, grade: 'B', stage: 'UNVERIFIABLE', offset: 33, harvest: '2026-11-01' },
  { serial: 470, farmer: 'sukumar', commodity: 'PADDY', variety: 'Swarna (MTU 7029)', bags: 100, netKg: 4900, grade: 'A', stage: 'PLEDGED', offset: 36, facility: 'WAREHOUSE', facilityName: WH, enwr: 'ENWR-CCRL-2026-000118', repo: 'CCRL', loan: 'LN-2026-00042', harvest: '2026-11-08' },
  { serial: 471, farmer: 'budhni', commodity: 'PADDY', variety: 'Swarna (MTU 7029)', bags: 80, netKg: 3920, grade: 'A', stage: 'IN_STORAGE', offset: 39, facility: 'WAREHOUSE', facilityName: WH, enwr: 'ENWR-CCRL-2026-000119', repo: 'CCRL', harvest: '2026-11-09' },
  { serial: 480, farmer: 'kalyani', commodity: 'BRINJAL', variety: 'Round green (local)', bags: 20, stage: 'COMMISSIONED', offset: 42, harvest: '2026-11-12' },
  { serial: 490, farmer: 'anima', commodity: 'POTATO', variety: 'Kufri Jyoti', bags: 40, stage: 'DRAFT', offset: 45, harvest: '2026-11-13' },
];
const STAGE_ORDER: Stage[] = ['DRAFT', 'COMMISSIONED', 'GRADED', 'IN_STORAGE', 'PLEDGED', 'LISTED', 'SOLD', 'IN_TRANSIT', 'DELIVERED', 'SETTLED', 'CLOSED'];
const rank = (s: Stage) => STAGE_ORDER.indexOf(s);
const sscc = (l: LotSpec) => ssccOf(l.serial);
const humanRef = (l: LotSpec) => `WB-PSM-${BLOCK_CODE[villageName(farmerOf(l.farmer).village).block]}-${CROP_CODE[l.commodity]}-FPO07-2026-${SEASON[l.commodity]}-${String(l.serial).padStart(5, '0')}`;
const lotL = (l: LotSpec, step: string) => `lot${l.serial}:${step}`;
const hasPassedStorage = (l: LotSpec) => !!l.facility;

// Order and lot rate placeholders (fixture values only)
const PRICE_PER_QTL: Record<string, number> = { 'ORD-2026-00087': 1580, 'ORD-2026-00088': 1575, 'ORD-2026-00089': 1590, 'ORD-2026-00090': 1570, 'ORD-2026-00092': 1500 };
const MODAL_PLACEHOLDER = 1350, HAIRCUT = 20;
const ORDERS: { id: string; status: Order['status']; lots: number[]; deliveryBy: string; times: { create: number; price1?: number; price2?: number; quality?: number; settle?: number; patronage?: number }; rejected?: boolean }[] = [
  { id: 'ORD-2026-00087', status: 'SETTLED', lots: [451, 455, 456], deliveryBy: '2026-11-12', times: { create: 6.4 * D, price1: 6 * D, price2: 6 * D - 90, quality: 2 * D, settle: 1.5 * D, patronage: 1 * D } },
  { id: 'ORD-2026-00088', status: 'PRICE_AGREED', lots: [460], deliveryBy: '2026-11-18', times: { create: 3.3 * D, price1: 3 * D, price2: 3 * D - 75 } },
  { id: 'ORD-2026-00089', status: 'IN_TRANSIT', lots: [461], deliveryBy: '2026-11-16', times: { create: 4.4 * D, price1: 4 * D, price2: 4 * D - 60 } },
  { id: 'ORD-2026-00090', status: 'DELIVERED', lots: [462], deliveryBy: '2026-11-14', times: { create: 5.4 * D, price1: 5 * D, price2: 5 * D - 45, quality: 0.4 * D } },
  { id: 'ORD-2026-00091', status: 'OPEN', lots: [454], deliveryBy: '2026-11-20', times: { create: 0.5 * D } },
  { id: 'ORD-2026-00092', status: 'DELIVERED', lots: [496], deliveryBy: '2026-11-13', times: { create: 4.9 * D, price1: 4.5 * D, price2: 4.5 * D - 30, quality: 0.4 * D }, rejected: true },
];
const orderOf = (id: string) => ORDERS.find((o) => o.id === id)!;
const lotBySerial = (n: number) => LOTS.find((l) => l.serial === n)!;

// F2/F3 etc. timings per lot (minutes before NOW). Days are chosen so that every order and loan follows its lots.
function registerAllTxs() {
  // farmer registration (F1)
  FARMERS.forEach((f, i) => {
    const tok = tokenOf(f);
    tx(`farmer:${f.key}:register`, 'lot-lifecycle', 'registerFarmerAndPlot', 230 * D - i * 90, FPO, { writes: [`FARMER_${tok}`] },
      [{ event: 'FarmerOnboarded' }, { event: 'PlotRegistered' }, { event: 'ConsentGranted' }]);
  });
  tx('farmer:anima:devicekey', 'lot-lifecycle', 'registerFarmerAndPlot', 229 * D, FPO, { writes: [`FARMER_${tokenOf(farmerOf('anima'))}`] }, [{ event: 'ConsentGranted' }]);
  tx('diary:anima:1', 'lot-lifecycle', 'recordInputEvent', 40 * D, FPO, { writes: [`INPUT_${tokenOf(farmerOf('anima'))}_1`] }, [{ event: 'InputApplied' }]);
  tx('diary:anima:2', 'lot-lifecycle', 'recordInputEvent', 31 * D, FPO, { writes: [`INPUT_${tokenOf(farmerOf('anima'))}_2`] }, [{ event: 'InputApplied' }]);
  tx('erase:santosh', 'lot-lifecycle', 'markUnverifiable', 2 * D + 200, FPO, { writes: [sscc(lotBySerial(497))] }, [{ event: 'PersonalDataErased', sscc: sscc(lotBySerial(497)) }]);

  for (const l of LOTS) {
    const S = sscc(l), r = rank(l.stage), o = l.offset;
    const lot = (step: string, fn: string, min: number, ev: LedgerEventName, cc: CC = 'lot-lifecycle', creator: OrgMsp = FPO, writes = [S], extra: { enwr?: string } = {}) =>
      tx(lotL(l, step), cc, fn, min, creator, { reads: writes, writes }, [{ event: ev, sscc: S, ...extra }]);
    if (l.stage === 'DRAFT') continue; // off-chain only
    lot('commission', 'commissionLot', 10 * D - o, 'LotCommissioned');
    if (r >= 2 || ['TRANSFORMED', 'REJECTED', 'UNVERIFIABLE'].includes(l.stage)) {
      lot('grade', 'attestQuality', 10 * D - 50 - o, 'LotGraded');
    }
    if (hasPassedStorage(l)) {
      lot('deposit', 'recordDeposit', 9 * D - o, 'DepositRecorded', 'pledge-lien', FPO, [`DEPOSIT_${S}`]);
      lot('stored', 'setInStorage', 9 * D - 3 - o, 'LotStatusChanged');
    }
    if (l.enwr) lot('enwr', 'issueENWRRef', 9 * D - 15 - o, 'ENWRIssued', 'pledge-lien', FPO, [`ENWR_${l.enwr}`], { enwr: l.enwr });
    if (l.loan) {
      lot('lien', 'markLien', 8 * D - o, 'LienMarked', 'pledge-lien', BANK, [`LIEN_${l.enwr}`, `LIENSSCC_${S}`], { enwr: l.enwr });
      lot('pledged', 'setPledged', 8 * D - 4 - o, 'LotStatusChanged');
      lot('disburse', 'recordDisbursement', 8 * D - 40 - o, 'LoanDisbursed', 'pledge-lien', BANK, [`LOAN_${l.loan}`], { enwr: l.enwr });
      if (l.loanReleased) {
        lot('repay', 'recordRepayment', 7 * D - o, 'LoanRepaid', 'pledge-lien', BANK, [`LOAN_${l.loan}`], { enwr: l.enwr });
        lot('release', 'releaseLien', 7 * D - 25 - o, 'LienReleased', 'pledge-lien', BANK, [`LIEN_${l.enwr}`, `LIENSSCC_${S}`], { enwr: l.enwr });
        lot('unpledged', 'setPledged', 7 * D - 29 - o, 'LotStatusChanged');
      }
    }
    if (l.order && l.stage !== 'UNVERIFIABLE') {
      lot('listed', 'setListed', orderOf(l.order).times.create - 20 - o, 'LotStatusChanged');
      if (orderOf(l.order).times.price2 !== undefined) lot('sold', 'setSold', orderOf(l.order).times.price2! - 20 - o, 'LotStatusChanged');
    }
    if (['IN_TRANSIT', 'DELIVERED', 'SETTLED', 'CLOSED', 'REJECTED'].includes(l.stage)) {
      const base = l.stage === 'IN_TRANSIT' ? 0.5 * D : l.stage === 'DELIVERED' || l.stage === 'REJECTED' ? 1.2 * D : 3 * D;
      lot('propose', 'proposeTransfer', base + 360 - o, 'CustodyProposed');
      lot('digest', 'anchorConditionDigest', base + 60 - o, 'ConditionDigestAnchored');
    }
    if (['DELIVERED', 'SETTLED', 'CLOSED', 'REJECTED'].includes(l.stage)) {
      const base = l.stage === 'DELIVERED' || l.stage === 'REJECTED' ? 0.5 * D : 2 * D + 120;
      lot('accept', 'acceptTransfer', base - o, 'CustodyAccepted', 'lot-lifecycle', BUYER);
    }
    if (l.stage === 'SETTLED' || l.stage === 'CLOSED') lot('settled', 'setSettled', 1.5 * D - 40 - o, 'LotStatusChanged');
    if (l.stage === 'TRANSFORMED') lot('transform', 'recordTransformation', 8 * D - o, 'LotTransformed');
  }
  for (const od of ORDERS) {
    const sc = od.lots.map((n) => sscc(lotBySerial(n)));
    const t = od.times;
    tx(`order:${od.id}:create`, 'order-settlement', 'createOrder', t.create, BUYER, { writes: [`ORDER_${od.id}`] }, [{ event: 'OrderCreated', orderId: od.id }]);
    if (t.price1 !== undefined) {
      tx(`order:${od.id}:price1`, 'order-settlement', 'agreePrice', t.price1, FPO, { writes: [`ORDER_${od.id}`, `$$h$tradePricePDC$${od.id}`] }, []);
      tx(`order:${od.id}:price2`, 'order-settlement', 'agreePrice', t.price2!, BUYER, { writes: [`ORDER_${od.id}`, `$$h$tradePricePDC$${od.id}`] }, [{ event: 'PriceAgreed', orderId: od.id }]);
    }
    if (t.quality !== undefined) tx(`order:${od.id}:quality`, 'order-settlement', 'acceptQuality', t.quality, BUYER, { writes: [`ORDER_${od.id}`] }, [{ event: 'QualityAccepted', orderId: od.id }]);
    if (t.settle !== undefined) tx(`order:${od.id}:settle`, 'order-settlement', 'recordSettlement', t.settle, FPO, { writes: [`ORDER_${od.id}`] }, [{ event: 'SettlementExecuted', orderId: od.id }]);
    if (t.patronage !== undefined) tx(`order:${od.id}:patronage`, 'lot-lifecycle', 'distributePatronage', t.patronage, FPO, { writes: [`PATRONAGE_${od.id}`, ...sc] }, [{ event: 'PatronageDistributed', orderId: od.id }]);
  }
}

// ---------------------------------------------------------------- derived lot facts
const lotTxs = (l: LotSpec): string[] => {
  const S = sscc(l); const labels: string[] = [];
  for (const [label, t] of TXS) {
    const mine = label.startsWith(`lot${l.serial}:`);
    const viaOrder = l.order && label.startsWith(`order:${l.order}:`);
    if (mine || viaOrder) labels.push(label);
  }
  void S;
  return labels.sort((a, b) => T(b).def.minBefore - T(a).def.minBefore);
};
const grossOf = (l: LotSpec) => Math.round(((l.netKg ?? 0) / 100) * (PRICE_PER_QTL[l.order ?? ''] ?? 0));
function statusOf(l: LotSpec): LotStatus {
  return l.stage === 'DRAFT' ? 'PENDING_FARMER_SIGNATURE' : (l.stage as LotStatus);
}
const lienOf = (l: LotSpec): LotPassport['lien'] => !l.loan ? { status: 'NONE' } : l.loanReleased ? { status: 'RELEASED', lienId: lienId(l), bank: BANK, proof: proof(lotL(l, 'release')) } : { status: 'ACTIVE', lienId: lienId(l), bank: BANK, proof: proof(lotL(l, 'lien')) };
const lienId = (l: LotSpec) => `LIEN-${l.loan!.slice(3)}`;
const potatoReading = (l: LotSpec, at: string) => ({ deviceId: 'QM-CHG-01', at, potato: { sizeGradeMm: (l.grade === 'A' ? '45-55' : l.grade === 'B' ? '35-45' : '<35') as '45-55' | '35-45' | '<35', greeningPct: l.grade === 'A' ? 0.8 : 2.1, rotPct: l.grade === 'A' ? 0.4 : 1.6, cutsPct: l.grade === 'A' ? 1.2 : 2.9 } });
const paddyReading = (l: LotSpec, at: string) => ({ deviceId: 'QM-CHG-01', at, paddy: { moisturePct: 13.6, foreignMatterPct: 0.9, brokenPct: 3.2 } });
const vegReading = (at: string) => ({ deviceId: 'QM-CHG-01', at, vegetable: { uniformityPct: 88, damagePct: 3 } });
const readingOf = (l: LotSpec, at: string) => l.commodity === 'PADDY' ? paddyReading(l, at) : l.commodity === 'POTATO' ? potatoReading(l, at) : vegReading(at);

function passport(l: LotSpec): LotPassport {
  const S = sscc(l); const f = farmerOf(l.farmer); const r = rank(l.stage);
  const p: LotPassport = {
    sscc: S, humanRef: humanRef(l), commodity: l.commodity, variety: l.variety, status: statusOf(l), village: f.village, farmerToken: tokenOf(f), plotId: plotOf(f),
    bagCount: l.bags, estWeightKg: l.bags * 50, harvestOrUnloadDate: l.harvest, custody: [], integrity: { docs: [] }, proofs: [],
  };
  if (l.stage === 'DRAFT') return p;
  const g = TXS.get(lotL(l, 'grade'));
  if (g) {
    const at = g.time;
    const gross = (l.netKg ?? 0) + 1240;
    p.netKg = l.netKg; p.grade = l.grade; p.residueTested = l.grade === 'A'; p.phiCompliant = true;
    p.quality = { weighbridge: { deviceId: 'WB-CHG-01', grossKg: gross, tareKg: 1240, netKg: l.netKg ?? 0, at }, reading: readingOf(l, at), deviceVerified: true };
    p.integrity.docs.push({ name: 'Weighbridge slip', sha256: sha(`doc:wb:${S}`), viewable: true }, { name: 'Quality meter report', sha256: sha(`doc:qm:${S}`), viewable: true });
    p.integrity.merkleRoot = sha(`merkle:${S}`);
  }
  if (l.facility) {
    p.storage = { facility: l.facility, facilityName: l.facilityName!, depositedAt: T(lotL(l, 'deposit')).time, ...(l.enwr ? { enwr: l.enwr, repository: l.repo } : {}) };
  }
  p.lien = lienOf(l);
  if (TXS.has(lotL(l, 'propose'))) {
    const hop: CustodyHop = { from: FPO, to: BUYER, place: 'Debra to Kolkata (Gangetic Fresh Foods)', proposedAt: T(lotL(l, 'propose')).time, proof: proof(lotL(l, 'propose')) };
    if (TXS.has(lotL(l, 'accept'))) { hop.acceptedAt = T(lotL(l, 'accept')).time; hop.proof = proof(lotL(l, 'accept')); }
    p.custody = [hop];
    const dg = T(lotL(l, 'digest'));
    p.coldChain = { continuous: !l.breach, breaches: l.breach ? 1 : 0, digests: [{ window: `${day(dg.def.minBefore + 600)}T22:00Z/${dg.time.slice(0, 16)}Z`, avgC: l.breach ? 6.8 : 4.1, proof: proof(lotL(l, 'digest')) }] };
  }
  if (l.order) {
    const od = orderOf(l.order);
    p.order = { orderId: od.id, channel: 'DIRECT', ...(od.times.price2 !== undefined ? { priceHash: priceHash(od.id) } : {}), settled: od.status === 'SETTLED' };
  }
  p.proofs = lotTxs(l).map(proof);
  return p;
}
const saltOf = (id: string) => sha(`salt:${id}`).slice(0, 32);
const priceHash = (orderId: string) => sha(canonicalJson({ orderId, pricePerQtl: PRICE_PER_QTL[orderId], salt: saltOf(orderId) }));

// ---------------------------------------------------------------- patronage
interface Line { l: LotSpec; kg: number; gross: number; ded: Deduction[]; net: number }
function patronageLines(orderId: string): Line[] {
  return orderOf(orderId).lots.map((n) => {
    const l = lotBySerial(n); const kg = l.netKg!; const qtl = kg / 100; const gross = grossOf(l);
    const ded: Deduction[] = [
      { type: 'HAMALI', amount: Math.round(qtl * 9) },
      { type: 'MARKET_FEE', amount: Math.round(gross * 0.005) },
      { type: 'COMMISSION', amount: Math.round(gross * 0.015) },
      { type: 'TRANSPORT', amount: Math.round(qtl * 28) },
      { type: 'COLD_STORAGE_RENT', amount: Math.round(qtl * 160) },
      { type: 'FPO_MARGIN', amount: Math.round(gross * 0.02) },
    ];
    return { l, kg, gross, ded, net: gross - ded.reduce((a, d) => a + d.amount, 0) };
  });
}

// ---------------------------------------------------------------- build all files
function main() {
  registerAllTxs(); finalizeTxs();
  mkdirSync(outDir, { recursive: true });
  const write = (name: string, meta: Record<string, unknown>, examples: unknown[]) => {
    writeFileSync(join(outDir, name), JSON.stringify({ _meta: { contractVersion: CONTRACT_VERSION, file: name, fixtureWarning: 'FIXTURE DATA. Tx IDs and hashes are placeholders prefixed FIXTURE-. Never show as ledger data.', ...meta }, examples }, null, 2) + '\n');
  };
  type Ex = { endpoint: string; params?: Record<string, string>; query?: Record<string, string>; status?: number; body: unknown };
  const ex = (endpoint: string, body: unknown, params?: Record<string, string>, query?: Record<string, string>, status?: number): Ex => ({ endpoint, ...(params ? { params } : {}), ...(query ? { query } : {}), ...(status ? { status } : {}), body });
  const lots = LOTS.map((l) => ({ l, p: passport(l) }));

  // ---- villages.json
  write('villages.json', { geocoding: 'Nominatim (OpenStreetMap), 15-10-2026, 1 request/second, User-Agent FPO-SETU-academic-prototype/1.0. Block checks: each point lies inside its block bounding box from Nominatim (Kharagpur-II relation 9707865... see source URLs); Debra bbox 22.315-22.563 N, 87.489-87.691 E; Keshiary bbox 22.020-22.242 N, 87.135-87.324 E; Kharagpur-II bbox 22.238-22.459 N, 87.336-87.530 E.', unresolved: ['GOLGRAM', 'GOPALPUR'], review: ['nameBn spelling needs a native speaker'], license: 'Data (c) OpenStreetMap contributors, ODbL 1.0' }, [ex('villages', VILLAGES)]);

  // ---- auth.json (also health and config)
  const loginEx: Ex[] = [];
  for (const p of PERSONAS) for (const portal of [p.portal, ...(p.extraPortals ?? [])]) {
    const u = userOf(p, portal);
    loginEx.push({ endpoint: 'login', query: { username: p.username, portal }, body: { token: fixtureJwt(u), user: u } } as Ex);
  }
  const anima = userOf(PERSONAS[0]!);
  write('auth.json', { demoPassword: 'Setu@2026', demoOtp: '123456', farmerPhone: '9000000001', tokens: 'JWTs are unsigned (alg none, signature FIXTURE). Only the mock server accepts them.' }, [
    ...loginEx,
    ex('otpRequest', { sent: true, demoOtp: '123456' }),
    ex('otpVerify', { token: fixtureJwt(anima), user: anima }),
    ex('health', { ok: true, ledgerMode: 'live', contractVersion: CONTRACT_VERSION, channels: { 'trace-channel': { height: HEIGHT['trace-channel'] }, 'finance-channel': { height: HEIGHT['finance-channel'] }, 'trade-channel': { height: HEIGHT['trade-channel'] } } }),
    ex('configPublic', { portalUrls: { farmerWeb: 'http://localhost:3001', fpo: 'http://localhost:3002', bank: 'http://localhost:3003', buyer: 'http://localhost:3004', consumer: 'http://localhost:3005', gov: 'http://localhost:3006' }, contractVersion: CONTRACT_VERSION,
      adapterModes: { agristack: 'simulated', enwrRepository: 'simulated', upi: 'simulated', enam: 'simulated', ondc: 'simulated', bhashini: 'simulated', accountAggregator: 'simulated', ncgtc: 'simulated', devices: 'simulated', agmarknet: 'live' } }),
  ]);

  // ---- farmers.json (farmers + diary)
  const farmerEx: Ex[] = [
    ex('listFarmers', { items: FARMERS.map(farmerPrivate) }),
    ...FARMERS.map((f) => ex('listFarmers', { items: FARMERS.filter((x) => x.village === f.village).map(farmerPrivate) }, undefined, { village: f.village })).filter((e, i, a) => a.findIndex((x) => JSON.stringify(x.query) === JSON.stringify(e.query)) === i),
    ex('getMyFarmer', farmerPrivate(farmerOf('anima'))),
    ex('registerFarmer', { ...receipt('farmer:haradhan:register'), resource: farmerPrivate(farmerOf('haradhan')) }, undefined, undefined, 201),
    ex('registerDeviceKey', { ...receipt('farmer:anima:devicekey'), resource: { farmerToken: tokenOf(farmerOf('anima')), devicePublicKeyHex: '04' + sha('fixture-device-pub-x') + sha('fixture-device-pub-y') } }),
    ex('erasePersonalData', { ...receipt('erase:santosh'), resource: { farmerToken: tokenOf(farmerOf('santosh')), erased: true, lotsMarkedUnverifiable: 1 } }, { id: farmerPrivate(farmerOf('santosh')).id }),
    ex('listDiaryInputs', { items: [
      { id: uuid('diary:1'), farmerId: farmerPrivate(farmerOf('anima')).id, product: 'Mancozeb 75% WP', activeIngredient: 'Mancozeb', dose: '2.5 g/L', appliedOn: day(40 * D), phiDays: 7, crop: 'POTATO', plotId: plotOf(farmerOf('anima')), hash: sha('diary:1'), phiClearOn: day(33 * D), proof: proof('diary:anima:1') },
      { id: uuid('diary:2'), farmerId: farmerPrivate(farmerOf('anima')).id, product: 'Metalaxyl + Mancozeb', activeIngredient: 'Metalaxyl 8% + Mancozeb 64%', dose: '2.5 g/L', appliedOn: day(31 * D), phiDays: 7, crop: 'POTATO', plotId: plotOf(farmerOf('anima')), hash: sha('diary:2'), phiClearOn: day(24 * D), proof: proof('diary:anima:2') },
    ] }),
    ex('createDiaryInput', { ...receipt('diary:anima:2'), resource: { id: uuid('diary:2'), farmerId: farmerPrivate(farmerOf('anima')).id, product: 'Metalaxyl + Mancozeb', activeIngredient: 'Metalaxyl 8% + Mancozeb 64%', dose: '2.5 g/L', appliedOn: day(31 * D), phiDays: 7, crop: 'POTATO', plotId: plotOf(farmerOf('anima')), hash: sha('diary:2'), phiClearOn: day(24 * D), proof: proof('diary:anima:2') } }, undefined, undefined, 201),
  ];
  write('farmers.json', { note: 'Farmer tokens other than Anima Das are illustrative: live tokens are HMACs of a server secret, so they differ per deployment. Anima Das and the contract example share FT-9c2e41a07b55d3f1 only in fixtures. Diary products, doses and PHI days are illustrative; cited values arrive with the seed (docs/DATA_SOURCES.md).', erasedFarmer: 'santosh (PII blank, erased: true)' }, farmerEx);

  // ---- lots.json
  const SOLD_OUT = new Set<string>();
  void SOLD_OUT;
  const toItem = (p: LotPassport, l: LotSpec) => ({ sscc: p.sscc, humanRef: p.humanRef, commodity: p.commodity, variety: p.variety, status: p.status, village: p.village, bagCount: p.bagCount, estWeightKg: p.estWeightKg, netKg: p.netKg, grade: p.grade, harvestOrUnloadDate: p.harvestOrUnloadDate, ...(p.proofs.length ? { proof: p.proofs[p.proofs.length - 1] } : {}) });
  const itemsAll = lots.map(({ l, p }) => toItem(p, l));
  const lotEx: Ex[] = [
    ex('listLots', { items: itemsAll }),
    ...(['CHANGUAL', 'GOLGRAM', 'GOPALPUR'] as VillageCode[]).map((v) => ex('listLots', { items: itemsAll.filter((i) => i.village === v) }, undefined, { village: v })),
    ...lots.map(({ p }) => ex('getLot', p, { sscc: p.sscc })),
    ex('createLotDraft', { sscc: sscc(lotBySerial(490)), humanRef: humanRef(lotBySerial(490)), payloadToSign: canonicalJson({ sscc: sscc(lotBySerial(490)), farmerToken: tokenOf(farmerOf('anima')), plotId: plotOf(farmerOf('anima')), commodity: 'POTATO', bagCount: 40, estWeightKg: 2000, harvestOrUnloadDate: lotBySerial(490).harvest }) }, undefined, undefined, 201),
    ex('listPendingDrafts', [{ sscc: sscc(lotBySerial(490)), humanRef: humanRef(lotBySerial(490)), payloadToSign: canonicalJson({ sscc: sscc(lotBySerial(490)), farmerToken: tokenOf(farmerOf('anima')), plotId: plotOf(farmerOf('anima')), commodity: 'POTATO', bagCount: 40, estWeightKg: 2000, harvestOrUnloadDate: lotBySerial(490).harvest }), commodity: 'POTATO', variety: 'Kufri Jyoti', village: 'CHANGUAL', bagCount: 40, estWeightKg: 2000, harvestOrUnloadDate: lotBySerial(490).harvest, createdBy: 'subhankar.vle', createdAt: iso(60) }]),
    ex('farmerSign', { ...receipt(lotL(lotBySerial(451), 'commission')), resource: lots.find((x) => x.l.serial === 451)!.p }, { sscc: sscc(lotBySerial(451)) }),
    ex('deviceRead', { reading: { deviceId: 'WB-CHG-01', grossKg: 3204, tareKg: 1240, netKg: 1964, at: T(lotL(lotBySerial(451), 'grade')).time }, signatureHex: sha('fixture-sig-wb-r') + sha('fixture-sig-wb-s'), deviceId: 'WB-CHG-01' }, { deviceId: 'WB-CHG-01' }),
    ex('deviceRead', { reading: potatoReading(lotBySerial(451), T(lotL(lotBySerial(451), 'grade')).time), signatureHex: sha('fixture-sig-qm-r') + sha('fixture-sig-qm-s'), deviceId: 'QM-CHG-01' }, { deviceId: 'QM-CHG-01' }),
    ex('attestQuality', { ...receipt(lotL(lotBySerial(451), 'grade')), resource: lots.find((x) => x.l.serial === 451)!.p }, { sscc: sscc(lotBySerial(451)) }),
    ex('transformLot', { ...receipt(lotL(lotBySerial(495), 'transform')), resource: lots.find((x) => x.l.serial === 495)!.p }, { sscc: sscc(lotBySerial(495)) }),
    ex('proposeCustody', { ...receipt(lotL(lotBySerial(461), 'propose')), resource: lots.find((x) => x.l.serial === 461)!.p }, { sscc: sscc(lotBySerial(461)) }),
    ex('acceptCustody', { ...receipt(lotL(lotBySerial(462), 'accept')), resource: lots.find((x) => x.l.serial === 462)!.p }, { sscc: sscc(lotBySerial(462)) }),
    ex('anchorConditionDigest', { ...receipt(lotL(lotBySerial(461), 'digest')), resource: lots.find((x) => x.l.serial === 461)!.p }, { sscc: sscc(lotBySerial(461)) }),
    ex('listCatalogue', { items: lots.filter(({ p }) => (p.status === 'GRADED' || p.status === 'IN_STORAGE') && p.lien?.status !== 'ACTIVE').map(({ p }) => ({ sscc: p.sscc, humanRef: p.humanRef, commodity: p.commodity, variety: p.variety, grade: p.grade!, netKg: p.netKg!, quantityQtl: p.netKg! / 100, village: p.village, block: villageName(p.village).block, harvestOrUnloadDate: p.harvestOrUnloadDate, residueTested: !!p.residueTested, phiCompliant: !!p.phiCompliant, coldChain: { continuous: true, breaches: 0 }, ...(p.storage ? { facilityName: p.storage.facilityName } : {}), ...(p.proofs.length ? { proof: p.proofs[p.proofs.length - 1] } : {}) })) }),
  ];
  write('lots.json', { lotCount: LOTS.length, goldenLot: sscc(lotBySerial(451)), signLiveDraft: sscc(lotBySerial(490)), note: 'Bag size assumed 50 kg for every commodity (verify against a West Bengal source before using in copy). Quality and weighbridge numbers are fixture values.', statuses: [...new Set(lots.map(({ p }) => p.status))] }, lotEx);

  // ---- collateral.json
  const collateralLots = LOTS.filter((l) => l.enwr);
  const collateralOf = (l: LotSpec): Collateral => {
    const p = lots.find((x) => x.l.serial === l.serial)!.p; const qtl = (l.netKg ?? 0) / 100;
    const paddy = l.commodity === 'PADDY';
    const modal = paddy ? 2441 : MODAL_PLACEHOLDER; const haircut = paddy ? 10 : HAIRCUT;
    const assessed = Math.round(qtl * modal * (1 - haircut / 100));
    return {
      lot: { sscc: p.sscc, humanRef: p.humanRef, commodity: p.commodity, grade: p.grade, village: p.village, status: p.status }, enwr: l.enwr!, repository: l.repo!, facilityName: l.facilityName!,
      quantityQtl: qtl, assessedValue: assessed,
      priceBasis: paddy ? { source: 'MSP KMS 2026-27, common paddy (CCEA 13-05-2026, secondary-source verified; PIB link added at C4)', market: 'All-India MSP', date: '2026-05-13', modalPerQtl: 2441 } : { source: 'FIXTURE-PLACEHOLDER (not AGMARKNET data)', market: 'Medinipur (West)', date: day(1 * D), modalPerQtl: MODAL_PLACEHOLDER },
      haircutPct: haircut, ltvPct: 70, eligibleLoan: Math.round(assessed * 0.7), lien: lienOf(l)!,
      storageConditionHistory: [{ at: T(lotL(l, 'deposit')).time, avgC: paddy ? undefined : 3.4, note: paddy ? 'Warehouse intake inspection (simulated)' : 'Cold-store temperature digest (simulated logger)' }],
      attestorReputation: [{ attestor: l.facilityName!, score: paddy ? 88 : 92 }, { attestor: 'Weighbridge WB-CHG-01', score: 97 }],
      cgsNpfEligible: paddy, cgsNpfReason: paddy ? 'e-NWR on a WDRA-registered warehouse (registration shown as simulated). Rule is a simulated NCGTC adapter, not an NCGTC decision.' : 'Cold-storage receipt. Whether potato is notified for e-NWR under WDRA is not yet verified (see DATA_SOURCES).',
    };
  };
  const loanOf = (l: LotSpec): Loan => {
    const c = collateralOf(l);
    const status: Loan['status'] = l.loanReleased ? 'RELEASED' : 'DISBURSED';
    const proofs = ['lien', 'disburse', ...(l.loanReleased ? ['repay', 'release'] : [])].map((s) => proof(lotL(l, s)));
    return { loanId: l.loan!, enwr: l.enwr!, sscc: sscc(l), amount: c.eligibleLoan, status, proofs, tenureDays: 180, ratePct: 9.5, repaidAmount: l.loanReleased ? Math.round(c.eligibleLoan * 1.02) : 0 };
  };
  const loanLots = LOTS.filter((l) => l.loan);
  write('collateral.json', { note: 'Valuation: assessedValue = qtl x modal x (1 - haircut); eligibleLoan = 70% of assessedValue. Potato price basis, haircut %, loan tenure and rate are fixture placeholders. Paddy basis is the paddy MSP (secondary-source verified).' }, [
    ex('listCollateral', { items: collateralLots.map(collateralOf) }),
    ...collateralLots.flatMap((l) => [ex('listCollateral', { items: [collateralOf(l)] }, undefined, { enwr: l.enwr! }), ex('listCollateral', { items: [collateralOf(l)] }, undefined, { sscc: sscc(l) })]),
    ex('recordDeposit', { ...receipt(lotL(lotBySerial(451), 'deposit')), resource: { depositId: 'DEP-2026-00201', sscc: sscc(lotBySerial(451)), facility: 'COLD_STORAGE', facilityName: COLD, bags: 40, depositedAt: T(lotL(lotBySerial(451), 'deposit')).time, enwr: 'ENWR-NERL-2026-004211', repository: 'NERL', proof: proof(lotL(lotBySerial(451), 'deposit')) } }, undefined, undefined, 201),
    ex('listDeposits', { items: LOTS.filter((l) => l.facility).map((l, i) => ({ depositId: `DEP-2026-${String(201 + i).padStart(5, '0')}`, sscc: sscc(l), facility: l.facility!, facilityName: l.facilityName!, bags: l.bags, depositedAt: T(lotL(l, 'deposit')).time, ...(l.enwr ? { enwr: l.enwr, repository: l.repo } : {}), proof: proof(lotL(l, 'deposit')) })) }),
    ex('issueEnwr', { ...receipt(lotL(lotBySerial(451), 'enwr')), resource: { depositId: 'DEP-2026-00201', enwr: 'ENWR-NERL-2026-004211', repository: 'NERL', simulatedAdapter: true } }, { id: 'DEP-2026-00201' }),
    ex('markLien', { ...receipt(lotL(lotBySerial(452), 'lien')), resource: loanOf(lotBySerial(452)) }, { enwr: 'ENWR-NERL-2026-004212' }, undefined, 201),
    ex('markLien', { error: { code: 'ERR_DOUBLE_FINANCING', message: 'This lot already has an active lien (tx ' + proof(lotL(lotBySerial(452), 'lien')).txId + '). Release it before pledging again.', txId: proof(lotL(lotBySerial(452), 'lien')).txId } }, { enwr: 'ENWR-NERL-2026-004212' }, { simulate: 'ERR_DOUBLE_FINANCING' }, 409),
    ex('disburseLoan', { ...receipt(lotL(lotBySerial(452), 'disburse')), resource: loanOf(lotBySerial(452)) }, { loanId: 'LN-2026-00041' }),
    ex('repayLoan', { ...receipt(lotL(lotBySerial(451), 'repay')), resource: loanOf(lotBySerial(451)) }, { loanId: 'LN-2026-00040' }),
    ex('releaseLien', { ...receipt(lotL(lotBySerial(451), 'release')), resource: loanOf(lotBySerial(451)) }, { loanId: 'LN-2026-00040' }),
    ex('listLoans', { items: loanLots.map(loanOf) }),
    ex('listLoans', { items: loanLots.filter((l) => !l.loanReleased).map(loanOf) }, undefined, { status: 'DISBURSED' }),
    ...loanLots.map((l) => ex('getLoan', loanOf(l), { loanId: l.loan! })),
  ]);

  // ---- orders.json
  const orderOfBody = (od: (typeof ORDERS)[number]): Order => ({
    orderId: od.id, ssccs: od.lots.map((n) => sscc(lotBySerial(n))), channel: 'DIRECT', status: od.status, ...(od.times.price2 !== undefined ? { priceHash: priceHash(od.id) } : {}), deliveryBy: od.deliveryBy,
    proofs: [...TXS.keys()].filter((k) => k.startsWith(`order:${od.id}:`)).sort((a, b) => T(b).def.minBefore - T(a).def.minBefore).map(proof),
  });
  const priceBody = (od: (typeof ORDERS)[number]) => { const qtl = od.lots.reduce((a, n) => a + lotBySerial(n).netKg!, 0) / 100; return { orderId: od.id, pricePerQtl: PRICE_PER_QTL[od.id]!, salt: saltOf(od.id), priceHash: priceHash(od.id), quantityQtl: qtl, totalAmount: Math.round(qtl * PRICE_PER_QTL[od.id]!), agreedAt: T(`order:${od.id}:price2`).time, proof: proof(`order:${od.id}:price2`) }; };
  const agreed = ORDERS.filter((o) => o.times.price2 !== undefined);
  const o87 = orderOf('ORD-2026-00087');
  write('orders.json', { note: 'Prices (pricePerQtl, totalAmount) are fixture placeholders. In the live system they are readable only through GET /orders/{id}/price by FPO and Buyer roles; the public order carries priceHash only. priceHash = sha256(canonicalJson({orderId, pricePerQtl, salt})).' }, [
    ex('listOrders', { items: ORDERS.map(orderOfBody) }),
    ex('listOrders', { items: ORDERS.filter((o) => o.status === 'OPEN').map(orderOfBody) }, undefined, { status: 'OPEN' }),
    ex('listOrders', { items: ORDERS.filter((o) => o.status === 'SETTLED').map(orderOfBody) }, undefined, { status: 'SETTLED' }),
    ...ORDERS.map((o) => ex('getOrder', orderOfBody(o), { orderId: o.id })),
    ...agreed.map((o) => ex('getOrderPrice', priceBody(o), { orderId: o.id })),
    ex('getOrderPrice', { error: { code: 'ERR_FORBIDDEN_ORG', message: 'Only the FPO and the Buyer can read this price.' } }, { orderId: 'ORD-2026-00087' }, { simulate: 'ERR_FORBIDDEN_ORG' }, 403),
    ex('createOrder', { ...receipt('order:ORD-2026-00091:create'), resource: orderOfBody(orderOf('ORD-2026-00091')) }, undefined, undefined, 201),
    ex('agreePrice', { ...receipt('order:ORD-2026-00088:price1'), resource: { orderId: 'ORD-2026-00088', priceHash: priceHash('ORD-2026-00088'), state: 'AWAITING_COUNTERPARTY' } }, { orderId: 'ORD-2026-00088' }),
    ex('agreePrice', { ...receipt('order:ORD-2026-00088:price2'), resource: { orderId: 'ORD-2026-00088', priceHash: priceHash('ORD-2026-00088'), state: 'AGREED' } }, { orderId: 'ORD-2026-00088' }, { simulate: 'AGREED' }),
    ex('agreePrice', { error: { code: 'ERR_PRICE_HASH_MISMATCH', message: 'The two submitted prices do not match. Both parties must submit the same price and salt.' } }, { orderId: 'ORD-2026-00088' }, { simulate: 'ERR_PRICE_HASH_MISMATCH' }, 409),
    ex('acceptQuality', { ...receipt('order:ORD-2026-00090:quality'), resource: orderOfBody(orderOf('ORD-2026-00090')) }, { orderId: 'ORD-2026-00090' }),
    ex('settleOrder', { ...receipt('order:ORD-2026-00087:settle'), resource: orderOfBody(o87) }, { orderId: 'ORD-2026-00087' }),
  ]);

  // ---- statements.json
  const lines87 = patronageLines('ORD-2026-00087');
  const totals = (ls: Line[]) => { const gross = ls.reduce((a, x) => a + x.gross, 0); const ded = ls.reduce((a, x) => a + x.ded.reduce((b, d) => b + d.amount, 0), 0); const fpo = ls.reduce((a, x) => a + x.ded.filter((d) => d.type === 'FPO_MARGIN').reduce((b, d) => b + d.amount, 0), 0); return { gross, deductions: ded, fpoMargin: fpo, net: ls.reduce((a, x) => a + x.net, 0) }; };
  const t87 = totals(lines87);
  if (t87.net + t87.deductions !== t87.gross) throw new Error('patronage fixture does not reconcile');
  const stmt = (x: Line): StatementLine => ({ sscc: sscc(x.l), humanRef: humanRef(x.l), kg: x.kg, grade: x.l.grade!, buyerType: 'Processor and organised retail (Kolkata)', gross: x.gross, deductions: x.ded, net: x.net, upiRef: '604512339876', paidOn: day(1 * D), proofs: [proof(lotL(x.l, 'commission')), proof('order:ORD-2026-00087:price2'), proof('order:ORD-2026-00087:settle'), proof('order:ORD-2026-00087:patronage')] });
  const animaLine = lines87.find((x) => x.l.farmer === 'anima')!;
  write('statements.json', { note: 'Deduction rates (hamali, market fee, commission, transport, cold-storage rent, FPO margin) are fixture placeholders. Cited, notified rates arrive with the seed (docs/DATA_SOURCES.md). UPI reference is simulated.', reconciliation: 'sum(net) + sum(all deductions incl. FPO_MARGIN) = settlementAmount' }, [
    ex('myStatements', { items: [stmt(animaLine)] }),
    ex('patronagePreview', { orderId: 'ORD-2026-00087', settlementAmount: t87.gross, lines: lines87.map((x) => ({ farmerToken: tokenOf(farmerOf(x.l.farmer)), name: farmerOf(x.l.farmer).name, sscc: sscc(x.l), kg: x.kg, gross: x.gross, deductions: x.ded, net: x.net })), totals: t87, reconciles: true }),
    ex('patronageRun', { ...receipt('order:ORD-2026-00087:patronage'), resource: { runId: 'PR-2026-11-001', orderId: 'ORD-2026-00087', memberCount: lines87.length, settlementAmount: t87.gross, totals: t87, distributedAt: T('order:ORD-2026-00087:patronage').time, proofs: [proof('order:ORD-2026-00087:patronage')] } }, undefined, undefined, 201),
    ex('patronageRun', { error: { code: 'ERR_PATRONAGE_UNBALANCED', message: 'Payouts and deductions do not add up to the settlement amount (difference above INR 1).' } }, undefined, { simulate: 'ERR_PATRONAGE_UNBALANCED' }, 422),
    ex('listPatronageRuns', { items: [{ runId: 'PR-2026-11-001', orderId: 'ORD-2026-00087', memberCount: lines87.length, settlementAmount: t87.gross, totals: t87, distributedAt: T('order:ORD-2026-00087:patronage').time, proofs: [proof('order:ORD-2026-00087:patronage')] }] }),
  ]);

  // ---- prices.json
  const pricePts: PricePoint[] = [];
  const potatoSeries = [[1000, 1200, 1100], [1000, 1200, 1100], [1000, 1250, 1150], [1050, 1250, 1150], [1050, 1250, 1150], [1050, 1300, 1200], [1100, 1300, 1200]];
  potatoSeries.forEach(([mn, mx, md], i) => pricePts.push({ date: day((6 - i + 1) * D), market: 'Medinipur (West)', commodity: 'Potato', min: mn!, max: mx!, modal: md!, source: 'FIXTURE-PLACEHOLDER (not AGMARKNET data)' }));
  write('prices.json', { warning: 'These rows are NOT AGMARKNET data. They are round placeholder numbers so that charts can be laid out. The real series come from data.gov.in and AGMARKNET CSVs in phase C4. Never show them as market prices; any row whose source starts with FIXTURE must be rendered as placeholder.', unit: 'INR per quintal' }, [
    ex('prices', { items: pricePts }),
    ex('prices', { items: pricePts }, undefined, { commodity: 'Potato' }),
    ex('pricesMsp', { crop: 'paddy', items: [
      { crop: 'paddy', season: 'KMS 2025-26', grade: 'COMMON', pricePerQtl: 2369, announcedOn: '2025-05-28', source: 'CCEA decision, PIB release of 28-05-2025 (figure confirmed from news reports; PIB URL added at C4)' },
      { crop: 'paddy', season: 'KMS 2025-26', grade: 'GRADE_A', pricePerQtl: 2389, announcedOn: '2025-05-28', source: 'CCEA decision, PIB release of 28-05-2025 (figure confirmed from news reports; PIB URL added at C4)' },
      { crop: 'paddy', season: 'KMS 2026-27', grade: 'COMMON', pricePerQtl: 2441, announcedOn: '2026-05-13', source: 'CCEA decision, PIB release of 13-05-2026 (figure confirmed from news reports; PIB URL added at C4)' },
      { crop: 'paddy', season: 'KMS 2026-27', grade: 'GRADE_A', pricePerQtl: 2461, announcedOn: '2026-05-13', source: 'CCEA decision, PIB release of 13-05-2026 (figure confirmed from news reports; PIB URL added at C4)' },
    ] }, undefined, { crop: 'paddy' }),
  ]);

  // ---- kpis.json (+ audit, reputation)
  const members = FARMERS.filter((f) => !f.erased);
  const memberLots = (f: FarmerSpec) => LOTS.filter((l) => l.farmer === f.key && l.stage !== 'DRAFT');
  const storable = members.filter((f) => memberLots(f).some((l) => l.facility));
  const withLien = members.filter((f) => memberLots(f).some((l) => l.loan));
  const women = members.filter((f) => memberLots(f).length > 0 && f.gender === 'F');
  const withLots = members.filter((f) => memberLots(f).length > 0);
  const accepted = LOTS.filter((l) => ['DELIVERED', 'SETTLED', 'CLOSED'].includes(l.stage) && l.stage !== 'REJECTED');
  const accKg = accepted.reduce((a, l) => a + l.netKg!, 0), commKg = accepted.reduce((a, l) => a + l.bags * 50, 0);
  const loanValue = loanLots.reduce((a, l) => a + loanOf(l).amount, 0);
  const payDays = ((T('order:ORD-2026-00087:price2').def.minBefore - T('order:ORD-2026-00087:patronage').def.minBefore) / D);
  const AUDIT = [
    { l: lotBySerial(451), status: 'MATCH' as const, note: 'Re-weighed within tolerance' }, { l: lotBySerial(460), status: 'MATCH' as const }, { l: lotBySerial(462), status: 'DIVERGENT' as const, note: 'Re-inspection grade B, attested grade A' },
    { l: lotBySerial(470), status: 'MATCH' as const }, { l: lotBySerial(471), status: 'PENDING' as const },
  ];
  const audited = AUDIT.filter((a) => a.status !== 'PENDING').length, divergent = AUDIT.filter((a) => a.status === 'DIVERGENT').length;
  const asOf = iso(0);
  const world = `fixture world (${members.length} members, ${LOTS.length} lots)`;
  const kpi = (key: string, label: string, value: number | null, unit: string, computedFrom: string, target?: string, numerator?: number, denominator?: number): Kpi => ({ key, label, value, unit, ...(target ? { target } : {}), ...(numerator !== undefined ? { numerator } : {}), ...(denominator !== undefined ? { denominator } : {}), computedFrom, asOf });
  const r1 = (n: number) => Math.round(n * 10) / 10;
  write('kpis.json', { note: 'KPIs here are computed from the small fixture world, not the real seed. KPIs that need data the fixtures do not have are null with the reason in computedFrom. month12_gate stays null: the four criteria are in the mid-term report, which was not provided.' }, [
    ex('kpis', { asOf, items: [
      kpi('price_premium', 'Realised price premium', null, '%', 'Needs the AGMARKNET modal series for the same week; not in fixtures', '+8%'),
      kpi('post_harvest_loss', 'Post-harvest loss', r1((1 - accKg / commKg) * 100), '%', `${world}: accepted kg taken as graded net kg of delivered lots, weight-weighted`, '< 8%', accKg, commKg),
      kpi('pledge_reach', 'Pledge finance reach', r1((withLien.length / storable.length) * 100), '%', `${world}: members with a lien / members with stored lots. Value facilitated INR ${loanValue.toLocaleString('en-IN')}`, '35%', withLien.length, storable.length),
      kpi('payment_cycle', 'Payment cycle', r1(payDays), 'days', `${world}: PriceAgreed to PatronageDistributed, order ORD-2026-00087 (one order, so the median is that value)`, '< 7 days'),
      kpi('statement_views', 'Statement views', null, '%', 'Telemetry (MemberStatementViewed) is not seeded in fixtures', '70%'),
      kpi('time_to_trace', 'Time to trace (p50)', null, 'ms', 'Measured on the live /public/provenance endpoint; not in fixtures', '< 5 s'),
      kpi('audit_divergence', 'Audit divergence', r1((divergent / audited) * 100), '%', `${world}: divergent re-inspections / lots audited`, '< 5%', divergent, audited),
      kpi('women_participation', "Women's participation", r1((women.length / withLots.length) * 100), '%', `${world}: women with at least one lot / members with at least one lot`, '>= 40%', women.length, withLots.length),
      kpi('month12_gate', 'Month-12 gate', null, 'criteria met', 'The four criteria come from the mid-term report, which was not provided', 'all 4'),
    ] }),
    ex('auditSample', { drawnOn: day(2 * D), sampleRatePct: 5, items: AUDIT.map((a) => ({ sscc: sscc(a.l), humanRef: humanRef(a.l), village: farmerOf(a.l.farmer).village, status: a.status, ...(a.status !== 'PENDING' ? { auditedOn: day(1 * D) } : {}), ...(a.note ? { note: a.note } : {}) })), audited, divergent, divergenceRatePct: r1((divergent / audited) * 100) }),
    ex('attestorReputation', [
      { attestor: COLD, kind: 'FACILITY', score: 92, attestations: 31, divergences: 1 }, { attestor: WH, kind: 'FACILITY', score: 88, attestations: 12, divergences: 0 },
      { attestor: 'WB-CHG-01', kind: 'DEVICE', score: 97, attestations: 52, divergences: 0 }, { attestor: 'QM-CHG-01', kind: 'DEVICE', score: 95, attestations: 52, divergences: 1 },
    ]),
  ]);

  // ---- provenance.json
  const place = (l: LotSpec) => villageName(farmerOf(l.farmer).village).name;
  const prov = (l: LotSpec): Provenance => {
    const p = lots.find((x) => x.l.serial === l.serial)!.p; const v = villageName(p.village);
    const journey: Provenance['journey'] = [];
    const add = (step: string, pl: string, label: string, orgType: Provenance['journey'][number]['orgType']) => { if (TXS.has(label)) journey.push({ step, place: pl, at: T(label).time, orgType }); };
    add('Lot commissioned with the farmer signature', place(l), lotL(l, 'commission'), 'FPO');
    add('Graded and weighed on a signed weighbridge', place(l), lotL(l, 'grade'), 'FPO');
    add('Stored', l.facilityName ?? '', lotL(l, 'deposit'), l.facility === 'WAREHOUSE' ? 'WAREHOUSE' : 'COLD_STORAGE');
    add('Dispatched', 'Debra to Kolkata', lotL(l, 'propose'), 'TRANSPORT');
    add('Received by the buyer', 'Kolkata', lotL(l, 'accept'), 'BUYER');
    return { sscc: p.sscc, humanRef: p.humanRef, commodity: p.commodity, variety: p.variety, village: v.name, block: v.block, district: 'Paschim Medinipur', harvestOrUnloadDate: p.harvestOrUnloadDate, grade: p.grade, residueTested: !!p.residueTested, phiCompliant: !!p.phiCompliant, coldChain: { continuous: p.coldChain?.continuous ?? true, breaches: p.coldChain?.breaches ?? 0 }, journey, proofs: p.proofs, ledgerMode: 'live' };
  };
  const provLots = LOTS.filter((l) => l.stage !== 'DRAFT' && l.stage !== 'UNVERIFIABLE');
  write('provenance.json', { note: 'No names or phone numbers. UNVERIFIABLE lot 497 returns ERR_NOT_FOUND-like handling in live mode: origin link is broken after erasure.' }, [
    ...provLots.map((l) => ex('publicProvenance', prov(l), { sscc: sscc(l) })),
    ex('scanReport', { received: true, id: uuid('scan:1') }),
  ]);

  // ---- ledger.json
  const peers = [['fpo', FPO, ['trace-channel', 'finance-channel', 'trade-channel']], ['bank', BANK, ['trace-channel', 'finance-channel']], ['buyer', BUYER, ['trace-channel', 'trade-channel']], ['regulator', REG, ['trace-channel', 'finance-channel']]] as const;
  const status: LedgerStatus = {
    mode: 'live',
    peers: peers.map(([n, org, chs]) => ({ name: `peer0.${n}.setu.local`, org, up: true, heights: Object.fromEntries(chs.map((c) => [c, HEIGHT[c]])) })),
    orderers: [{ name: 'orderer1.setu.local', up: true, raftLeader: true }],
    channels: [{ name: 'trace-channel', height: HEIGHT['trace-channel'], members: [FPO, BANK, BUYER, REG] }, { name: 'finance-channel', height: HEIGHT['finance-channel'], members: [FPO, BANK, REG] }, { name: 'trade-channel', height: HEIGHT['trade-channel'], members: [FPO, BUYER] }],
  };
  const blockOf = (label: string): BlockSummary => { const t = T(label); return { channel: t.channel, number: t.blockNumber, dataHash: fx(`dh:${t.channel}:${t.blockNumber}`), previousHash: fx(`dh:${t.channel}:${t.blockNumber - 1}`), txCount: 1, time: t.time }; };
  const byChannel = (ch: Channel) => [...TXS.entries()].filter(([, t]) => t.channel === ch).sort((a, b) => b[1].blockNumber - a[1].blockNumber);
  const txBody = (label: string): TxDetail => { const t = T(label); return { txId: t.txId, channel: t.channel, chaincode: t.def.cc, fn: t.def.fn, blockNumber: t.blockNumber, blockHash: fx(`bh:${t.channel}:${t.blockNumber}`), validationCode: 'VALID', timestamp: t.time, creatorMsp: t.def.creator, endorsers: t.def.endorsers, rwset: { reads: t.def.reads, writes: t.def.writes } }; };
  const blockDetail = (label: string): BlockDetail => { const t = T(label); return { ...blockOf(label), txs: [{ txId: t.txId, chaincode: t.def.cc, fn: t.def.fn, validationCode: 'VALID', creatorMsp: t.def.creator, timestamp: t.time }] }; };
  const streamEv = (label: string): StreamEvent[] => { const t = T(label); return t.def.events.map((e) => ({ event: e.event, ...(e.sscc ? { sscc: e.sscc } : {}), ...(e.orderId ? { orderId: e.orderId } : {}), ...(e.enwr ? { enwr: e.enwr } : {}), txId: t.txId, blockNumber: t.blockNumber, channel: t.channel, at: t.time })); };
  const allLabels = [...TXS.keys()];
  const chronological = allLabels.sort((a, b) => T(b).def.minBefore - T(a).def.minBefore);
  write('ledger.json', { note: 'All tx IDs and block/data hashes are FIXTURE- placeholders. Heights match the contract examples (trace 1,284, finance 311, trade 207). Only the newest blocks exist in the fixtures: older block numbers return ERR_NOT_FOUND from the mock. Lite profile: one Raft orderer, so there is no fault tolerance and raftLeader is that single node.' }, [
    ex('ledgerStatus', status),
    ex('ledgerBlocks', (['trace-channel', 'finance-channel', 'trade-channel'] as Channel[]).flatMap((c) => byChannel(c).slice(0, 5).map(([l]) => blockOf(l))).sort((a, b) => b.time.localeCompare(a.time))),
    ...(['trace-channel', 'finance-channel', 'trade-channel'] as Channel[]).map((c) => ex('ledgerBlocks', byChannel(c).slice(0, 10).map(([l]) => blockOf(l)), undefined, { channel: c })),
    ...allLabels.map((l) => ex('ledgerBlock', blockDetail(l), { channel: T(l).channel, number: String(T(l).blockNumber) })),
    ...allLabels.map((l) => ex('ledgerTx', txBody(l), { txId: T(l).txId })),
    ex('ledgerSearch', [{ kind: 'lot', id: sscc(lotBySerial(451)), label: humanRef(lotBySerial(451)) }], undefined, { q: sscc(lotBySerial(451)) }),
    ex('ledgerSearch', [{ kind: 'enwr', id: 'ENWR-NERL-2026-004211', label: 'e-NWR ENWR-NERL-2026-004211', channel: 'finance-channel' }], undefined, { q: 'ENWR-NERL-2026-004211' }),
    ex('ledgerSearch', [{ kind: 'order', id: 'ORD-2026-00087', label: 'Order ORD-2026-00087', channel: 'trade-channel' }], undefined, { q: 'ORD-2026-00087' }),
    ...chronological.flatMap((l) => streamEv(l)).map((e) => ex('eventsStream', e)),
  ]);
  console.log(`fixtures written to ${outDir}: ${LOTS.length} lots, ${TXS.size} placeholder txs, contract ${CONTRACT_VERSION}`);
  void ORG_DISPLAY; void o87;
}
main();
