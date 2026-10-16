/**
 * FPO-SETU shared contract: canonical types and helpers.
 * Owned by 00-core-ledger. Portals COPY this file via scripts/sync-contract.mjs; never edit the copy.
 * Any change: bump CONTRACT_VERSION and add a line to the changelog in shared/CONTRACT.md.
 */
export const CONTRACT_VERSION = '1.0.3' as const;

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
  'SettlementExecuted', 'PatronageDistributed', 'PersonalDataErased', 'LotStatusChanged',
] as const;
export type LedgerEventName = (typeof LEDGER_EVENTS)[number];

export type ErrorCode =
  | 'ERR_UNAUTHENTICATED' | 'ERR_FORBIDDEN_ROLE' | 'ERR_FORBIDDEN_ORG' | 'ERR_VALIDATION'
  | 'ERR_NOT_FOUND' | 'ERR_INVALID_STATE' | 'ERR_BAD_FARMER_SIGNATURE' | 'ERR_BAD_DEVICE_SIGNATURE'
  | 'ERR_DOUBLE_FINANCING' | 'ERR_LOT_PLEDGED' | 'ERR_UNILATERAL_CUSTODY' | 'ERR_PRICE_HASH_MISMATCH'
  | 'ERR_PATRONAGE_UNBALANCED' | 'ERR_LEDGER_UNAVAILABLE';

/** HTTP status the gateway uses for each error code (v1.0.1). */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  ERR_UNAUTHENTICATED: 401, ERR_FORBIDDEN_ROLE: 403, ERR_FORBIDDEN_ORG: 403, ERR_VALIDATION: 400, ERR_NOT_FOUND: 404,
  ERR_INVALID_STATE: 409, ERR_BAD_FARMER_SIGNATURE: 422, ERR_BAD_DEVICE_SIGNATURE: 422, ERR_DOUBLE_FINANCING: 409,
  ERR_LOT_PLEDGED: 409, ERR_UNILATERAL_CUSTODY: 403, ERR_PRICE_HASH_MISMATCH: 409, ERR_PATRONAGE_UNBALANCED: 422,
  ERR_LEDGER_UNAVAILABLE: 503,
};

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
  /** Raft elects a leader per channel. `leaderOf` lists the channels this orderer leads; `raftLeader` is true when it leads trace-channel. */
  orderers: { name: string; up: boolean; raftLeader: boolean; leaderOf?: Channel[] }[];
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
/** assessedValue = quantityQtl x priceBasis.modalPerQtl x (1 - haircutPct/100). eligibleLoan = assessedValue x ltvPct/100. */
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
export interface Loan {
  loanId: string; enwr: string; sscc?: string; amount: number; status: 'SANCTIONED' | 'DISBURSED' | 'REPAID' | 'RELEASED'; proofs: Proof[];
  /** Loan terms live in loanTermsPDC (FPO, Bank). Present only for credit_officer and ceo. */
  tenureDays?: number; ratePct?: number; repaidAmount?: number;
}

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
export interface KpiCriterion { key: string; label: string; met: boolean | null; evidence: string }
/** `criteria` is set only on the month12_gate KPI: value = number of criteria met, `met: null` means not yet determinable. */
export interface Kpi { key: string; label: string; value: number | null; unit: string; target?: string; numerator?: number; denominator?: number; computedFrom: string; asOf: string; criteria?: KpiCriterion[] }
export interface PricePoint { date: string; market: string; commodity: string; min: number; max: number; modal: number; source: string }
export interface Village {
  code: VillageCode; name: string; nameBn: string; block: string; gp?: string; lat: number; lon: number;
  role: 'PILOT' | 'COMPARISON';
  /** LANDMARK: a mapped feature inside the village. BLOCK_CENTROID: the village is not in OpenStreetMap, so the block centre is shown. Never a village centroid. */
  precision: 'LANDMARK' | 'BLOCK_CENTROID';
  source: string; note?: string;
}

// ---------- Signing formats (F2, F3) ----------
/** Payload the farmer's device signs for F2. Sign `canonicalJson(payload)` (UTF-8 bytes) with ECDSA P-256 / SHA-256. */
export interface LotCommissionPayload {
  sscc: string; farmerToken: string; plotId: string; commodity: Commodity;
  bagCount: number; estWeightKg: number; harvestOrUnloadDate: string;
}
/**
 * Wire formats for every signature and public key in the system:
 *  - `signatureHex`: 128 hex chars = r || s, 32 bytes each, big-endian (IEEE P1363, what Web Crypto produces). Not DER.
 *  - `publicKeyHex` / `devicePublicKeyHex`: 130 hex chars = uncompressed SEC1 point 0x04 || X || Y (Web Crypto `exportKey('raw')`).
 *  - Lowercase hex, no 0x prefix.
 */
export type SignatureHex = string;
export type PublicKeyHex = string;

// ---------- Request and response bodies (v1.0.1): one named type per endpoint body ----------
export type Receipted<T> = LedgerReceipt & { resource: T };

// Auth and system
export interface LoginRequest { username: string; password: string; portal: Portal }
export interface OtpRequest { phone: string }
export interface OtpRequestResponse { sent: true; demoOtp: string }
export interface OtpVerifyRequest { phone: string; otp: string }
export interface HealthResponse {
  ok: boolean; ledgerMode: LedgerMode; contractVersion: string;
  channels: Partial<Record<Channel, { height: number }>>;
}
export type AdapterMode = 'simulated' | 'live';
export interface PublicConfig { portalUrls: PortalUrls; contractVersion: string; adapterModes: Record<string, AdapterMode> }

// Ledger explorer
export interface BlockTx { txId: string; chaincode: string; fn: string; validationCode: string; creatorMsp: OrgMsp; timestamp: string }
export interface BlockDetail extends BlockSummary { txs: BlockTx[] }
export interface SearchHit { kind: 'tx' | 'lot' | 'enwr' | 'order'; id: string; channel?: Channel; label: string }
export type LedgerBlocksResponse = BlockSummary[];
export type LedgerSearchResponse = SearchHit[];

// Farmers
export interface GeoJsonPolygon { type: 'Polygon'; coordinates: number[][][] }
export interface RegisterFarmerRequest {
  name: string; nameLocal: string; gender: 'F' | 'M' | 'O'; phone: string; village: VillageCode;
  plot: { geojson: GeoJsonPolygon; areaHa: number; crops: Commodity[] };
  consent: { version: string; lang: 'bn' | 'hi' | 'en'; acceptedAt: string };
  devicePublicKeyHex?: PublicKeyHex;
}
export interface DeviceKeyRequest { publicKeyHex: PublicKeyHex }
export interface DeviceKeyRegistered { farmerToken: string; devicePublicKeyHex: PublicKeyHex }
export interface ErasureResult { farmerToken: string; erased: true; lotsMarkedUnverifiable: number }

// Crop diary
export interface DiaryInputRequest {
  product: string; activeIngredient: string; dose: string; appliedOn: string; phiDays: number; crop: Commodity;
  plotId?: string; farmerId?: string; // farmerId only when a VLE records on a member's behalf
}
export interface DiaryInput extends DiaryInputRequest {
  id: string; farmerId: string; hash: string; phiClearOn: string; proof?: Proof;
}

// Lots
export interface LotDraftRequest {
  farmerId: string; plotId: string; commodity: Commodity; variety?: string;
  bagCount: number; estWeightKg: number; harvestOrUnloadDate: string;
}
export interface PendingLotDraft extends LotDraft {
  commodity: Commodity; variety?: string; village: VillageCode; bagCount: number; estWeightKg: number;
  harvestOrUnloadDate: string; createdBy: string; createdAt: string;
}
export interface FarmerSignRequest { signatureHex: SignatureHex }
export interface DeviceReadRequest { sscc: string }
export type DeviceReadResponse = SignedReading<WeighbridgeReading> | SignedReading<QualityReading>;
export interface QualityRequest {
  weighbridgeReading: SignedReading<WeighbridgeReading>; qualityReading: SignedReading<QualityReading>; grade: Grade;
}
export interface TransformRequest { toProcessing: true; reason: string }
export interface CustodyProposeRequest { toOrg: OrgMsp; vehicleNo: string; loggerId: string }
export interface ConditionDigestRequest { window: string; minC: number; maxC: number; avgC: number; breaches: number; digestHash: string }
export type LotListItem = Pick<
  LotPassport,
  'sscc' | 'humanRef' | 'commodity' | 'variety' | 'status' | 'village' | 'bagCount' | 'estWeightKg' | 'netKg' | 'grade' | 'harvestOrUnloadDate'
> & { proof?: Proof };
export interface CatalogueItem {
  sscc: string; humanRef: string; commodity: Commodity; variety?: string; grade: Grade; netKg: number; quantityQtl: number;
  village: VillageCode; block: string; harvestOrUnloadDate: string;
  residueTested: boolean; phiCompliant: boolean; coldChain: { continuous: boolean; breaches: number };
  facilityName?: string; proof?: Proof;
}

// Storage and finance
export interface DepositRequest { sscc: string; facility: FacilityType; facilityName: string; bags: number; depositedAt: string }
export interface Deposit {
  depositId: string; sscc: string; facility: FacilityType; facilityName: string; bags: number; depositedAt: string;
  enwr?: string; repository?: 'NERL' | 'CCRL'; proof?: Proof;
}
export interface EnwrIssued { depositId: string; enwr: string; repository: 'NERL' | 'CCRL'; simulatedAdapter: true }
export interface LienRequest { loanId: string; amount: number; tenureDays: number; ratePct: number }
export interface RepayRequest { amount: number }

// Trade
export interface CreateOrderRequest { ssccs: string[]; channel: SalesChannel; deliveryBy: string }
/**
 * `priceHash = sha256Hex(canonicalJson({orderId, pricePerQtl, salt}))`. Both parties submit it; the call commits when both hashes match.
 * If `salt` is omitted the gateway derives it: first 32 hex chars of HMAC-SHA256(PRICE_SALT_SECRET, orderId). Both submissions then agree without sharing a salt out of band.
 */
export interface AgreePriceRequest { pricePerQtl: number; salt?: string }
export interface PriceAgreementState { orderId: string; priceHash: string; state: 'AWAITING_COUNTERPARTY' | 'AGREED' }
export interface OrderPrice {
  orderId: string; pricePerQtl: number; salt: string; priceHash: string; quantityQtl: number; totalAmount: number;
  agreedAt: string; proof: Proof;
}
export interface AcceptQualityRequest { accepted: boolean; notes?: string }
export interface SettleRequest { amount: number; upiRef: string }

// Patronage and statements
export interface PatronageLine {
  farmerToken: string; name: string; sscc: string; kg: number; gross: number; deductions: Deduction[]; net: number;
}
/**
 * Reconciliation rule (chaincode F7): sum(gross) = settlementAmount, and for every line gross = net + sum(deductions).
 * Therefore sum(net) + sum(all deductions, FPO_MARGIN included) = settlementAmount, within INR 1 total for rounding.
 */
export interface PatronagePreview {
  orderId: string; settlementAmount: number; lines: PatronageLine[];
  totals: { gross: number; deductions: number; fpoMargin: number; net: number }; reconciles: boolean;
}
export interface PatronageRunRequest { orderId: string }
export interface PatronageRun {
  runId: string; orderId: string; memberCount: number; settlementAmount: number;
  totals: { gross: number; deductions: number; fpoMargin: number; net: number }; distributedAt: string; proofs: Proof[];
}

// Analytics
export interface KpisResponse { items: Kpi[]; asOf: string }
export interface MspEntry {
  crop: 'paddy'; season: string; grade: 'COMMON' | 'GRADE_A'; pricePerQtl: number; announcedOn: string; source: string; sourceUrl?: string;
}
export interface MspResponse { crop: 'paddy'; items: MspEntry[] }
export interface AuditItem { sscc: string; humanRef: string; village: VillageCode; status: 'PENDING' | 'MATCH' | 'DIVERGENT'; auditedOn?: string; note?: string }
export interface AuditSample {
  drawnOn: string; sampleRatePct: number; items: AuditItem[]; audited: number; divergent: number; divergenceRatePct: number | null;
}
export interface AttestorReputation { attestor: string; kind: 'FACILITY' | 'DEVICE' | 'OPERATOR'; score: number; attestations: number; divergences: number }

// Public
export interface ScanReportRequest { sscc: string; approxLocation?: string; suspicious?: boolean; note?: string }
export interface ScanReportResponse { received: true; id: string }

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
/**
 * Canonical JSON: object keys sorted recursively (UTF-16 code-unit order; keep keys ASCII), no whitespace.
 * Used for every signature. Only JSON-safe values are allowed: string, finite number, boolean, null, arrays, plain objects.
 * `undefined` object properties are dropped. Anything else (NaN, Infinity, bigint, function, symbol, undefined in an array or at top level) throws,
 * because silently coercing it to null would sign different bytes than the verifier sees.
 * Cross-language rule: the Go verifier must not HTML-escape (<, >, &) and must emit raw UTF-8 (including U+2028/2029). Prefer integers over floats in signed payloads.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) throw new Error('canonicalJson: non-finite number');
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) throw new Error('canonicalJson: only plain objects are allowed');
      const obj = value as Record<string, unknown>;
      return `{${Object.keys(obj)
        .filter((k) => obj[k] !== undefined)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
        .join(',')}}`;
    }
    default:
      throw new Error(`canonicalJson: unsupported type ${typeof value}`);
  }
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
