import type { ErrorCode } from '@/contract/contract';

export type ClientErrorCode = ErrorCode | 'NETWORK' | 'UNKNOWN';

/** One message map for this portal (English). Phrased as the action the reader can take. */
export const ERROR_MESSAGES: Record<ClientErrorCode, string> = {
  ERR_UNAUTHENTICATED: 'You are not signed in, or your session ended. Sign in again to continue.',
  ERR_FORBIDDEN_ROLE: 'Your role cannot do this. Sign in as the credit officer (arindam.bank).',
  ERR_FORBIDDEN_ORG: 'Your organisation is not on the channel that holds this record.',
  ERR_VALIDATION: 'Check the loan amount, tenure and rate, then submit again.',
  ERR_NOT_FOUND: 'Nothing was found for this ID. Check it for typing mistakes, or search by e-NWR or SSCC.',
  ERR_INVALID_STATE: 'The loan or lot is in a different state than this action needs. Reload and check its latest status.',
  ERR_BAD_FARMER_SIGNATURE: 'A signature did not verify. Ask the FPO to capture it again.',
  ERR_BAD_DEVICE_SIGNATURE: 'A device signature did not verify. Ask the FPO to re-read the device.',
  ERR_DOUBLE_FINANCING: 'This receipt already has an active lien. It must be released before it can be pledged again.',
  ERR_LOT_PLEDGED: 'This lot is pledged. The lien must be released before it can move.',
  ERR_UNILATERAL_CUSTODY: 'Custody moves only when both sides act.',
  ERR_PRICE_HASH_MISMATCH: 'The two submitted prices do not match.',
  ERR_PATRONAGE_UNBALANCED: 'The payout lines do not add up to the settlement amount.',
  ERR_LEDGER_UNAVAILABLE: 'The ledger node is asleep, so writes are paused. You can still read the last indexed state. Try again when the node is back.',
  NETWORK: 'Cannot reach the ledger API. Check your connection and reload.',
  UNKNOWN: 'Something went wrong on our side. Reload the page; if it persists, tell the project team.',
};
