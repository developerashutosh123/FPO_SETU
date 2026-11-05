import type { ErrorCode } from '@/contract/contract';

export type ClientErrorCode = ErrorCode | 'NETWORK' | 'UNKNOWN';

/** One message map for this portal (English). Phrased as the action the reader can take. */
export const ERROR_MESSAGES: Record<ClientErrorCode, string> = {
  ERR_UNAUTHENTICATED: 'You are not signed in, or your session ended. Sign in again to continue.',
  ERR_FORBIDDEN_ROLE: 'This role cannot do this. The buyer portal acts as the procurement manager (rahul.buyer).',
  ERR_FORBIDDEN_ORG: 'Only the FPO and the buyer can read this price. Your organisation is not on the trade channel.',
  ERR_VALIDATION: 'Check the values you entered, then submit again.',
  ERR_NOT_FOUND: 'Nothing was found for this ID. Check it for typing mistakes.',
  ERR_INVALID_STATE: 'The lot or order is in a different state than this action needs. Reload and check its latest status.',
  ERR_BAD_FARMER_SIGNATURE: 'A farmer signature did not verify. Ask the FPO to capture it again.',
  ERR_BAD_DEVICE_SIGNATURE: 'A device signature did not verify. Ask the FPO to re-read the device.',
  ERR_DOUBLE_FINANCING: 'This receipt already has an active lien.',
  ERR_LOT_PLEDGED: 'This lot is pledged and cannot be ordered yet. Pick another lot, or ask the FPO when the pledge is released.',
  ERR_UNILATERAL_CUSTODY: 'Custody moves only when the buyer organisation accepts. The FPO cannot accept on the buyer\'s behalf.',
  ERR_PRICE_HASH_MISMATCH: 'The two submitted prices do not match. Agree the price with the FPO by phone, then both submit it again.',
  ERR_PATRONAGE_UNBALANCED: 'The payout lines do not add up to the settlement amount.',
  ERR_LEDGER_UNAVAILABLE: 'The ledger node is asleep, so writes are paused. You can still read the last indexed state. Try again when the node is back.',
  NETWORK: 'Cannot reach the ledger API. Check your connection and reload.',
  UNKNOWN: 'Something went wrong on our side. Reload the page; if it persists, tell the project team.',
};
