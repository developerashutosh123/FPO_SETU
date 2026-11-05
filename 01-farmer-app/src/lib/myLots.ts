import type { Commodity, LotListItem, LotPassport, LotStatus, PendingLotDraft, StatementLine } from '../contract/contract';
import { api } from './api';
import { ApiClientError } from './errors';

export interface MyLot {
  sscc: string; humanRef: string; commodity?: Commodity; status?: LotStatus; grade?: string; kg?: number; bags?: number;
  statement?: StatementLine; draft?: PendingLotDraft;
}
export interface MyLots { lots: MyLot[]; drafts: PendingLotDraft[]; statements: StatementLine[]; fromListEndpoint: boolean }

/** Set once the gateway answers GET /lots with "not for your role"; the contract (1.0.4) does not list `member` for it. */
let listForbidden = false;

async function fromList(signal?: AbortSignal): Promise<LotListItem[] | null> {
  if (listForbidden) return null;
  try {
    const page = await api.listMyLots(signal);
    return page.items;
  } catch (e) {
    if (e instanceof ApiClientError && (e.code === 'ERR_FORBIDDEN_ROLE' || e.code === 'ERR_FORBIDDEN_ORG')) { listForbidden = true; return null; }
    throw e;
  }
}

/**
 * The farmer's lots. Preferred source: GET /lots (works once the gateway lets a member list their own lots, see CONTRACT_REQUESTS.md).
 * Until then: the lots with a payment statement plus the drafts waiting for a signature, each statement lot enriched from its passport.
 */
export async function loadMyLots(signal?: AbortSignal): Promise<MyLots> {
  const [drafts, statementPage, listed] = await Promise.all([
    api.pendingDrafts(signal).catch(() => [] as PendingLotDraft[]),
    api.statements(signal).catch(() => ({ items: [] as StatementLine[] })),
    fromList(signal),
  ]);
  const statements = statementPage.items;
  const stmtBy = new Map(statements.map((s) => [s.sscc, s]));
  const draftBy = new Map(drafts.map((d) => [d.sscc, d]));

  let lots: MyLot[];
  if (listed) {
    lots = listed.map((l) => ({
      sscc: l.sscc, humanRef: l.humanRef, commodity: l.commodity, status: l.status, grade: l.grade, kg: l.netKg ?? l.estWeightKg, bags: l.bagCount,
      statement: stmtBy.get(l.sscc), draft: draftBy.get(l.sscc),
    }));
  } else {
    const passports = new Map<string, LotPassport>();
    await Promise.all(statements.map(async (s) => { try { passports.set(s.sscc, await api.lot(s.sscc, signal)); } catch { /* the card still shows the statement */ } }));
    lots = [
      ...drafts.map((d): MyLot => ({ sscc: d.sscc, humanRef: d.humanRef, commodity: d.commodity, status: 'PENDING_FARMER_SIGNATURE', kg: d.estWeightKg, bags: d.bagCount, draft: d })),
      ...statements.map((s): MyLot => {
        const p = passports.get(s.sscc);
        return { sscc: s.sscc, humanRef: s.humanRef, commodity: p?.commodity, status: p?.status, grade: s.grade, kg: s.kg, bags: p?.bagCount, statement: s };
      }),
    ];
  }
  return { lots, drafts, statements, fromListEndpoint: !!listed };
}
