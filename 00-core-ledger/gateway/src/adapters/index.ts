// External government, market and payment systems are simulated behind interfaces (CONTRACT.md Section 2.2).
// Every simulated adapter reports mode 'simulated' through GET /config/public; AGMARKNET is the one real adapter.
import { eq } from 'drizzle-orm';
import type { AdapterMode, Commodity, FacilityType } from '../contract/contract.js';
import type { Db } from '../db/client.js';
import { adapterRegistry } from '../db/schema.js';
import { nextSequence } from '../services/ids.js';
import { AgmarknetAdapter } from './agmarknet.js';

export interface ENWRRepositoryAdapter {
  issue(input: { depositId: string; sscc: string; facility: FacilityType; commodity: Commodity; quantityKg: number; year: number }): Promise<{ enwr: string; repository: 'NERL' | 'CCRL' }>;
}
export interface UpiAdapter { validate(upiRef: string): boolean; record(input: { orderId: string; amount: number; upiRef: string }): Promise<void> }
export interface NcgtcAdapter { eligibility(input: { commodity: Commodity; facility: FacilityType; repository: 'NERL' | 'CCRL'; loanAmount: number }): { eligible: boolean; reason: string } }
export interface AgriStackAdapter { verifyFarmer(input: { farmerId: string; village: string }): Promise<{ verified: boolean; referenceId: string }> }
export interface MarketChannelAdapter { register(input: { orderId: string; channel: 'ONDC' | 'ENAM' }): Promise<{ reference: string }> }
export interface BhashiniAdapter { translate(input: { text: string; to: 'bn' | 'hi' | 'en' }): Promise<{ text: string; simulated: true }> }
export interface AccountAggregatorAdapter { consentHandle(input: { farmerId: string }): Promise<{ handle: string }> }

export interface Adapters {
  enwr: ENWRRepositoryAdapter; upi: UpiAdapter; ncgtc: NcgtcAdapter; agristack: AgriStackAdapter; market: MarketChannelAdapter;
  bhashini: BhashiniAdapter; accountAggregator: AccountAggregatorAdapter; agmarknet: AgmarknetAdapter;
  modes(): Record<string, AdapterMode>;
}

/** Simulated NERL / CCRL e-NWR repository: ENWR-<REPO>-<YYYY>-<6 digits>. Cold-storage receipts go to NERL, warehouse receipts to CCRL (fixture convention). */
class SimEnwr implements ENWRRepositoryAdapter {
  constructor(private db: Db) {}
  async issue(i: { depositId: string; sscc: string; facility: FacilityType; year: number }) {
    const repository = i.facility === 'COLD_STORAGE' ? 'NERL' : 'CCRL';
    const existing = await this.db.select().from(adapterRegistry).where(eq(adapterRegistry.key, `enwr-for:${i.depositId}`));
    if (existing[0]) return existing[0].data as { enwr: string; repository: 'NERL' | 'CCRL' };
    const n = await nextSequence(this.db, `enwr-${repository}-${i.year}`, repository === 'NERL' ? 4211 : 118);
    const enwr = `ENWR-${repository}-${i.year}-${String(n).padStart(6, '0')}`;
    const data = { enwr, repository: repository as 'NERL' | 'CCRL' };
    await this.db.insert(adapterRegistry).values({ key: `enwr-for:${i.depositId}`, kind: 'enwr', data: { ...data, sscc: i.sscc, simulated: true } }).onConflictDoNothing();
    return data;
  }
}

class SimUpi implements UpiAdapter {
  constructor(private db: Db) {}
  validate(upiRef: string) { return /^\d{12}$/.test(upiRef); }
  async record(i: { orderId: string; amount: number; upiRef: string }) {
    await this.db.insert(adapterRegistry).values({ key: `upi:${i.upiRef}`, kind: 'upi', data: { ...i, simulated: true } }).onConflictDoNothing();
  }
}

/**
 * Simulated NCGTC rule for CGS-NPF eligibility. It is NOT an NCGTC decision. Potato is treated as not eligible until the WDRA
 * notification of potato for negotiable warehouse receipts is verified (CONTRACT.md Section 4.2).
 */
class SimNcgtc implements NcgtcAdapter {
  eligibility(i: { commodity: Commodity; facility: FacilityType; repository: 'NERL' | 'CCRL' }) {
    if (i.facility !== 'WAREHOUSE') return { eligible: false, reason: 'Cold-storage receipt. Eligibility of potato under WDRA e-NWR is not yet verified (see DATA_SOURCES). Simulated rule, not an NCGTC decision.' };
    if (i.commodity !== 'PADDY') return { eligible: false, reason: `${i.commodity} is not in the simulated eligible list. Simulated rule, not an NCGTC decision.` };
    return { eligible: true, reason: `e-NWR on a WDRA-registered warehouse (registration shown as simulated), repository ${i.repository}. Simulated rule, not an NCGTC decision.` };
  }
}

export function createAdapters(db: Db, opts: { dataGovInApiKey?: string; fetchImpl?: typeof fetch } = {}): Adapters {
  const agmarknet = new AgmarknetAdapter(db, { apiKey: opts.dataGovInApiKey, fetchImpl: opts.fetchImpl });
  return {
    enwr: new SimEnwr(db), upi: new SimUpi(db), ncgtc: new SimNcgtc(), agmarknet,
    agristack: { async verifyFarmer(i) { return { verified: true, referenceId: `SIM-AGRI-${i.farmerId.slice(0, 8)}` }; } },
    market: { async register(i) { return { reference: `SIM-${i.channel}-${i.orderId}` }; } },
    bhashini: { async translate(i) { return { text: i.text, simulated: true as const }; } },
    accountAggregator: { async consentHandle(i) { return { handle: `SIM-AA-${i.farmerId.slice(0, 8)}` }; } },
    modes: () => ({ agristack: 'simulated', enwrRepository: 'simulated', upi: 'simulated', enam: 'simulated', ondc: 'simulated', bhashini: 'simulated', accountAggregator: 'simulated', ncgtc: 'simulated', devices: 'simulated', agmarknet: 'live' }),
  };
}
