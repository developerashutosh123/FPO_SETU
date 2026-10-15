/**
 * FPO-SETU shared contract: canonical types and helpers.
 * Owned by 00-core-ledger. Portals COPY this file via scripts/sync-contract.mjs; never edit the copy.
 * Any change: bump CONTRACT_VERSION and add a line to the changelog in shared/CONTRACT.md.
 */
export const CONTRACT_VERSION = '1.0.0' as const;

// ---------- Orgs, roles, channels ----------
export type OrgMsp = 'FpoOrgMSP' | 'BankOrgMSP' | 'BuyerOrgMSP' | 'RegulatorOrgMSP';
export type Role =
  | 'member' | 'vle' | 'ceo' | 'operator' | 'warehouse' | 'board'
  | 'credit_officer' | 'buyer_manager' | 'observer';
export type Portal = 'farmer' | 'fpo' | 'bank' | 'buyer' | 'consumer' | 'gov';
export type Channel = 'trace-channel' | 'finance-channel' | 'trade-channel';
export type LedgerMode = 'live' | 'index-only';

export const ORG_DISPLAY: Record<OrgMsp, string> = {
  FpoOrgMSP: 'Kharagpur Krishak Sanghati Producer Company Ltd',
  BankOrgMSP: 'Subarnarekha Krishi Bank',
  BuyerOrgMSP: 'Gangetic Fresh Foods Pvt Ltd',
  RegulatorOrgMSP: 'District Agri-Finance Monitoring Cell (demo observer)',
};

// ---------- Domain enums ----------
export type Commodity = 'POTATO' | 'PADDY' | 'BRINJAL' | 'CAULIFLOWER';
export type Grade = 'A' | 'B' | 'C';
export type LotStatus =
  | 'PENDING_FARMER_SIGNATURE' | 'COMMISSIONED' | 'GRADED' | 'IN_STORAGE' | 'PLEDGED'
  | 'LISTED' | 'SOLD' | 'IN_TRANSIT' | 'DELIVERED' | 'SETTLED' | 'CLOSED'
  | 'TRANSFORMED' | 'REJECTED' | 'UNVERIFIABLE';
export type LienStatus = 'NONE' | 'ACTIVE' | 'RELEASED';
export type FacilityType = 'COLD_STORAGE' | 'WAREHOUSE';
export type SalesChannel = 'DIRECT' | 'ONDC' | 'ENAM';
export type VillageCode = 'CHANGUAL' | 'GOLGRAM' | 'GOPALPUR' | 'SANKOA' | 'DUAN';

export const LEDGER_EVENTS = [
  'FarmerOnboarded', 'PlotRegistered', 'ConsentGranted', 'InputApplied', 'LotCommissioned',
  'LotGraded', 'QualityCredentialIssued', 'LotTransformed', 'DepositRecorded', 'ENWRIssued',
  'LienMarked', 'LoanDisbursed', 'LoanRepaid', 'LienReleased', 'OrderCreated', 'PriceAgreed',
  'CustodyProposed', 'CustodyAccepted', 'ConditionDigestAnchored', 'QualityAccepted',
  'SettlementExecuted', 'PatronageDistributed', 'PersonalDataErased',
] as const;
export type LedgerEventName = (typeof LEDGER_EVENTS)[number];

export type ErrorCode =
  | 'ERR_UNAUTHENTICATED' | 'ERR_FORBIDDEN_ROLE' | 'ERR_FORBIDDEN_ORG' | 'ERR_VALIDATION'
  | 'ERR_NOT_FOUND' | 'ERR_INVALID_STATE' | 'ERR_BAD_FARMER_SIGNATURE' | 'ERR_BAD_DEVICE_SIGNATURE'
  | 'ERR_DOUBLE_FINANCING' | 'ERR_LOT_PLEDGED' | 'ERR_UNILATERAL_CUSTODY' | 'ERR_PRICE_HASH_MISMATCH'
  | 'ERR_PATRONAGE_UNBALANCED' | 'ERR_LEDGER_UNAVAILABLE';

// ---------- Ledger primitives ----------
export interface LedgerReceipt {
  txId: string;
  channel: Channel;
  chaincode: 'lot-lifecycle' | 'pledge-lien' | 'order-settlement';
  fn: string;
  blockNumber: number;
  validationCode: 'VALID';
  endorsers: OrgMsp[];
  committedAt: string; // ISO 8601
}
export interface Proof { txId: string; blockNumber: number; channel: Channel }
export interface ApiError { error: { code: ErrorCode; message: string; txId?: string; details?: unknown } }
export interface Page<T> { items: T[]; nextCursor?: string }

export interface LedgerStatus {
  mode: LedgerMode;
  lastIndexedAt?: string;
  peers: { name: string; org: OrgMsp; up: boolean; heights: Partial<Record<Channel, number>> }[];
  orderers: { name: string; up: boolean; raftLeader: boolean }[];
  channels: { name: Channel; height: number; members: OrgMsp[] }[];
}
export interface BlockSummary { channel: Channel; number: number; dataHash: string; previousHash: string; txCount: number; time: string }
export interface TxDetail {
  txId: string; channel: Channel; chaincode: string; fn: string; blockNumber: number; blockHash: string;
  validationCode: string; timestamp: string; creatorMsp: OrgMsp; endorsers: OrgMsp[];
  rwset: { reads: string[]; writes: string[] }; // keys only
}
export interface StreamEvent {
  event: LedgerEventName; sscc?: string; orderId?: string; enwr?: string;
  txId: string; blockNumber: number; channel: Channel; at: string;
}

// ---------- Auth ----------
export interface SessionUser { id: string; username: string; role: Role; org: OrgMsp; displayName: string; portal: Portal }
export interface LoginResponse { token: string; user: SessionUser }

// ---------- Farmers ----------
export interface FarmerPublic { farmerToken: string; village: VillageCode; gender: 'F' | 'M' | 'O'; joinedOn: string; erased: boolean }
export interface FarmerPrivate extends FarmerPublic {
  id: string; name: string; nameLocal: string; phone: string; preferredLang: 'bn' | 'hi' | 'en';
  plots: { plotId: string; areaHa: number; crops: Commodity[]; polygonHash: string }[];
}

// ---------- Lots ----------
export interface WeighbridgeReading { deviceId: string; grossKg: number; tareKg: number; netKg: number; at: string }
export interface QualityReading {
  deviceId: string; at: string;
  potato?: { sizeGradeMm: '>55' | '45-55' | '35-45' | '<35'; greeningPct: number; rotPct: number; cutsPct: number };
  paddy?: { moisturePct: number; foreignMatterPct: number; brokenPct: number };
  vegetable?: { uniformityPct: number; damagePct: number };
}
export interface SignedReading<T> { reading: T; signatureHex: string; deviceId: string }

export interface CustodyHop { from: OrgMsp; to: OrgMsp; place: string; proposedAt: string; acceptedAt?: string; proof?: Proof }
export interface LotPassport {
  sscc: string; humanRef: string; commodity: Commodity; variety?: string;
  status: LotStatus; village: VillageCode; farmerToken: string; plotId: string;
  bagCount: number; estWeightKg: number; netKg?: number; grade?: Grade;
  harvestOrUnloadDate: string;
  phiCompliant?: boolean; residueTested?: boolean;
  quality?: { weighbridge: WeighbridgeReading; reading: QualityReading; deviceVerified: boolean };
  storage?: { facility: FacilityType; facilityName: string; depositedAt: string; enwr?: string; repository?: 'NERL' | 'CCRL' };
  lien?: { status: LienStatus; lienId?: string; bank?: OrgMsp; proof?: Proof };
  custody: CustodyHop[];
  coldChain?: { continuous: boolean; breaches: number; digests: { window: string; avgC: number; proof: Proof }[] };
  order?: { orderId: string; channel: SalesChannel; priceHash?: string; settled: boolean };
  integrity: { merkleRoot?: string; docs: { name: string; sha256: string; viewable: boolean }[] };
  proofs: Proof[]; // all tx touching this lot, chronological
}
export interface LotDraft { sscc: string; humanRef: string; payloadToSign: string /* canonical JSON */ }

// ---------- Finance ----------
export interface Collateral {
  lot: Pick<LotPassport, 'sscc' | 'humanRef' | 'commodity' | 'grade' | 'village' | 'status'>;
  enwr: string; repository: 'NERL' | 'CCRL'; facilityName: string;
  quantityQtl: number; assessedValue: number;
  priceBasis: { source: string; market: string; date: string; modalPerQtl: number };
  haircutPct: number; ltvPct: 70; eligibleLoan: number;
  lien: { status: LienStatus; lienId?: string; bank?: OrgMsp; proof?: Proof };
  storageConditionHistory: { at: string; avgC?: number; note: string }[];
  attestorReputation: { attestor: string; score: number }[];
  cgsNpfEligible: boolean; cgsNpfReason: string;
}
export interface Loan { loanId: string; enwr: string; amount: number; status: 'SANCTIONED' | 'DISBURSED' | 'REPAID' | 'RELEASED'; proofs: Proof[] }

// ---------- Trade ----------
export interface Order {
  orderId: string; ssccs: string[]; channel: SalesChannel; status: 'OPEN' | 'PRICE_AGREED' | 'IN_TRANSIT' | 'DELIVERED' | 'SETTLED';
  priceHash?: string; deliveryBy: string; proofs: Proof[];
}
export interface Deduction { type: 'HAMALI' | 'MARKET_FEE' | 'COMMISSION' | 'TRANSPORT' | 'COLD_STORAGE_RENT' | 'FPO_MARGIN' | 'LOAN_RECOVERY'; amount: number }
export interface StatementLine {
  sscc: string; humanRef: string; kg: number; grade: Grade; buyerType: string;
  gross: number; deductions: Deduction[]; net: number; upiRef?: string; paidOn?: string; proofs: Proof[];
}

// ---------- Public / analytics ----------
export interface Provenance {
  sscc: string; humanRef: string; commodity: Commodity; variety?: string;
  village: string; block: string; district: 'Paschim Medinipur'; harvestOrUnloadDate: string; grade?: Grade;
  residueTested: boolean; phiCompliant: boolean; coldChain: { continuous: boolean; breaches: number };
  journey: { step: string; place: string; at: string; orgType: 'FPO' | 'COLD_STORAGE' | 'WAREHOUSE' | 'BUYER' | 'TRANSPORT' }[];
  proofs: Proof[]; ledgerMode: LedgerMode;
}
export interface Kpi { key: string; label: string; value: number | null; unit: string; target?: string; numerator?: number; denominator?: number; computedFrom: string; asOf: string }
export interface PricePoint { date: string; market: string; commodity: string; min: number; max: number; modal: number; source: string }
export interface Village { code: VillageCode; name: string; nameBn: string; block: string; gp?: string; lat: number; lon: number; role: 'PILOT' | 'COMPARISON'; source: string }

// ---------- Deep links ----------
export interface PortalUrls { farmerWeb: string; fpo: string; bank: string; buyer: string; consumer: string; gov: string }
export const deepLink = {
  farmerLot: (u: PortalUrls, sscc: string) => `${u.farmerWeb}/lot/${sscc}`,
  fpoLot: (u: PortalUrls, sscc: string) => `${u.fpo}/lots/${sscc}`,
  fpoOrder: (u: PortalUrls, id: string) => `${u.fpo}/orders/${id}`,
  fpoCollateral: (u: PortalUrls, enwr: string) => `${u.fpo}/collateral/${enwr}`,
  bankCollateral: (u: PortalUrls, enwr: string) => `${u.bank}/collateral/${enwr}`,
  bankLoan: (u: PortalUrls, id: string) => `${u.bank}/loans/${id}`,
  buyerLot: (u: PortalUrls, sscc: string) => `${u.buyer}/lots/${sscc}`,
  buyerOrder: (u: PortalUrls, id: string) => `${u.buyer}/orders/${id}`,
  consumer: (u: PortalUrls, sscc: string) => `${u.consumer}/00/${sscc}`,
  govTx: (u: PortalUrls, txId: string) => `${u.gov}/ledger/tx/${txId}`,
  govBlock: (u: PortalUrls, ch: Channel, n: number) => `${u.gov}/ledger/block/${ch}/${n}`,
  govLot: (u: PortalUrls, sscc: string) => `${u.gov}/lots/${sscc}`,
};

// ---------- Helpers (must behave identically everywhere) ----------
/** Canonical JSON: object keys sorted recursively, no whitespace. Used for every signature. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(',')}}`;
}

/** GS1 mod-10 check digit for the first 17 digits of an SSCC. */
export function ssccCheckDigit(first17: string): number {
  if (!/^\d{17}$/.test(first17)) throw new Error('SSCC body must be 17 digits');
  const sum = first17
    .split('')
    .reverse()
    .reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10;
}
export function isValidSscc(sscc: string): boolean {
  return /^\d{18}$/.test(sscc) && ssccCheckDigit(sscc.slice(0, 17)) === Number(sscc[17]);
}
// Self-check: '089012340000004517' is valid.

/** Indian currency format, e.g. 120450 -> "₹1,20,450". */
export const formatINR = (n: number, opts: { decimals?: number } = {}) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: opts.decimals ?? 0 }).format(n);
/** DD-MM-YYYY in IST. */
export const formatDateIST = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(new Date(iso)).replace(/\//g, '-');
export const shortHash = (h: string, n = 6) => `${h.slice(0, n)}…${h.slice(-4)}`;

export const FOOTER_TEXT =
  'Academic prototype - RD61003, CRDIST, IIT Kharagpur - Group 7. Not a government, banking or payment service. Ledger is live Hyperledger Fabric 2.5; external integrations are simulated.';
