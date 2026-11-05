import type { ErrorCode } from '@/contract/contract';

export type ClientErrorCode = ErrorCode | 'NETWORK' | 'UNKNOWN';

/** One message map for this portal (English). Phrased as the action the reader can take. */
export const ERROR_MESSAGES: Record<ClientErrorCode, string> = {
  ERR_UNAUTHENTICATED: 'You are not signed in, or your session ended. Sign in again to continue.',
  ERR_FORBIDDEN_ROLE: 'Your role cannot do this. Sign in with the account that owns this step (operator, warehouse clerk or CEO).',
  ERR_FORBIDDEN_ORG: 'Your organisation is not on the channel that holds this record.',
  ERR_VALIDATION: 'Check the values you entered, then submit again.',
  ERR_NOT_FOUND: 'Nothing was found for this ID. Check it for typing mistakes.',
  ERR_INVALID_STATE: 'The lot or order is in a different state than this action needs. Reload and check its latest status.',
  ERR_BAD_FARMER_SIGNATURE: 'The farmer signature did not verify. Ask the farmer to confirm the lot again in the app.',
  ERR_BAD_DEVICE_SIGNATURE: 'A device signature did not verify. Read the weighbridge and the quality meter again.',
  ERR_DOUBLE_FINANCING: 'This receipt already has an active lien. It must be released before it can be pledged again.',
  ERR_LOT_PLEDGED: 'This lot is pledged to a bank. Ask the bank to release the lien, then dispatch again.',
  ERR_UNILATERAL_CUSTODY: 'Custody moves only when both sides act. Wait for the buyer to accept.',
  ERR_PRICE_HASH_MISMATCH: 'The two submitted prices do not match. Agree the number with the buyer, then both submit it again.',
  ERR_PATRONAGE_UNBALANCED: 'The payout lines do not add up to the settlement amount.',
  ERR_LEDGER_UNAVAILABLE: 'The ledger node is asleep, so writes are paused. You can still read the last indexed state. Try again when the node is back.',
  NETWORK: 'Cannot reach the ledger API. Check your connection and reload.',
  UNKNOWN: 'Something went wrong on our side. Reload the page; if it persists, tell the project team.',
};
