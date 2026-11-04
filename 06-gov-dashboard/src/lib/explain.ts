import { isValidSscc, type TxDetail } from '@/contract/contract';
import { joinList, shortOrg } from './format';

/** What a transaction's keys point at. Read from the key names the API returns; never invented. */
export interface TxSubjects { sscc?: string; enwr?: string; orderId?: string; loanId?: string; farmerToken?: string }

export function subjectsOf(keys: string[]): TxSubjects {
  const text = keys.join(' ');
  const sscc = (text.match(/(?<!\d)\d{18}(?!\d)/g) ?? []).find(isValidSscc);
  return {
    sscc,
    enwr: text.match(/ENWR-[A-Z]{4}-\d{4}-\d{6}/)?.[0],
    orderId: text.match(/ORD-\d{4}-\d{5}/)?.[0],
    loanId: text.match(/LN-\d{4}-\d{5}/)?.[0],
    farmerToken: text.match(/FT-[0-9a-f]{16}/)?.[0],
  };
}

type Phrase = (s: TxSubjects) => string;
const lot = (s: TxSubjects) => (s.sscc ? `lot ${s.sscc}` : 'a lot');
const order = (s: TxSubjects) => (s.orderId ? `order ${s.orderId}` : 'an order');
const enwr = (s: TxSubjects) => s.enwr ?? 'an e-NWR';

const PHRASES: Record<string, Phrase> = {
  registerFarmerAndPlot: (s) => `registered a farmer and plot${s.farmerToken ? ` under token ${s.farmerToken}` : ''}`,
  recordInputEvent: (s) => `anchored the hash of a crop-diary input${s.farmerToken ? ` for ${s.farmerToken}` : ''}`,
  commissionLot: (s) => `commissioned ${lot(s)} with the farmer's device signature`,
  attestQuality: (s) => `recorded device-signed weight and quality readings for ${lot(s)}`,
  recordDeposit: (s) => `recorded a storage deposit for ${lot(s)}`,
  issueENWRRef: (s) => `recorded the reference of ${enwr(s)}`,
  markLien: (s) => `recorded a lien on ${enwr(s)}`,
  releaseLien: (s) => `released the lien on ${enwr(s)}`,
  recordDisbursement: (s) => `recorded the disbursement of ${s.loanId ?? 'a loan'}`,
  recordRepayment: (s) => `recorded a repayment on ${s.loanId ?? 'a loan'}`,
  createOrder: (s) => `created ${order(s)}`,
  agreePrice: (s) => `agreed a price for ${order(s)}; the price stays in private data and only its hash is on the ledger`,
  acceptQuality: (s) => `recorded the buyer's quality decision on ${order(s)}`,
  recordSettlement: (s) => `recorded the settlement of ${order(s)}`,
  proposeTransfer: (s) => `proposed a custody transfer of ${lot(s)}`,
  acceptTransfer: (s) => `accepted custody of ${lot(s)}`,
  anchorConditionDigest: (s) => `anchored a cold-chain condition digest for ${lot(s)}`,
  recordTransformation: (s) => `graded ${lot(s)} out to processing`,
  markUnverifiable: (s) => `marked ${lot(s)} unverifiable after a personal-data erasure`,
  distributePatronage: (s) => `distributed patronage for ${order(s)}`,
  setInStorage: (s) => `moved ${lot(s)} to IN_STORAGE`,
  setPledged: (s) => `updated the pledged flag on ${lot(s)}`,
  setListed: (s) => `moved ${lot(s)} to LISTED`,
  setSold: (s) => `moved ${lot(s)} to SOLD`,
  setSettled: (s) => `moved ${lot(s)} to SETTLED`,
};

/** Short label for timelines, e.g. "Lien marked". */
export const FN_LABEL: Record<string, string> = {
  registerFarmerAndPlot: 'Farmer and plot registered', recordInputEvent: 'Crop-diary input anchored', commissionLot: 'Lot commissioned',
  attestQuality: 'Quality attested', recordDeposit: 'Deposit recorded', issueENWRRef: 'e-NWR referenced', markLien: 'Lien marked',
  releaseLien: 'Lien released', recordDisbursement: 'Loan disbursed', recordRepayment: 'Loan repaid', createOrder: 'Order created',
  agreePrice: 'Price agreed (hash only)', acceptQuality: 'Quality decision recorded', recordSettlement: 'Settlement recorded',
  proposeTransfer: 'Custody proposed', acceptTransfer: 'Custody accepted', anchorConditionDigest: 'Cold-chain digest anchored',
  recordTransformation: 'Graded out to processing', markUnverifiable: 'Marked unverifiable', distributePatronage: 'Patronage distributed',
  setInStorage: 'Status: in storage', setPledged: 'Status: pledge flag updated', setListed: 'Status: listed', setSold: 'Status: sold', setSettled: 'Status: settled',
};
export const fnLabel = (fn: string) => FN_LABEL[fn] ?? fn;

/** One plain-English sentence for the transaction page, built only from fields the API returned. */
export function summarizeTx(tx: Pick<TxDetail, 'fn' | 'endorsers' | 'creatorMsp' | 'rwset'>): string {
  const subjects = subjectsOf([...tx.rwset.writes, ...tx.rwset.reads]);
  const phrase = (PHRASES[tx.fn] ?? (() => `ran ${tx.fn}`))(subjects);
  const orgs = [...new Set(tx.endorsers)].map(shortOrg);
  const actor = orgs.length === 2 ? `${joinList(orgs)} jointly` : orgs.length === 1 ? orgs[0]! : shortOrg(tx.creatorMsp);
  return `${actor} ${phrase}.`;
}
