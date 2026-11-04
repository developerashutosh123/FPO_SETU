import type { ErrorCode } from '@/contract/contract';

export type ClientErrorCode = ErrorCode | 'NETWORK' | 'UNKNOWN';

/** One message map for this portal (English). Phrased as the action the reader can take. */
export const ERROR_MESSAGES: Record<ClientErrorCode, string> = {
  ERR_UNAUTHENTICATED: 'You are not signed in, or your session ended. Sign in again to continue.',
  ERR_FORBIDDEN_ROLE: 'This role cannot open this page. Sign in as the district observer or the FPO board member.',
  ERR_FORBIDDEN_ORG: 'Your organisation is not on the channel that holds this record. Ask the FPO to share the proof link instead.',
  ERR_VALIDATION: 'Check what you entered and try again.',
  ERR_NOT_FOUND: 'Nothing was found for this ID. Check it for typing mistakes, or search by lot, e-NWR or order ID.',
  ERR_INVALID_STATE: 'The record is in a different state than this action needs. Reload and check its latest status.',
  ERR_BAD_FARMER_SIGNATURE: 'The farmer signature did not verify. Ask the VLE to capture it again.',
  ERR_BAD_DEVICE_SIGNATURE: 'A device signature did not verify. Re-read the device and try again.',
  ERR_DOUBLE_FINANCING: 'This lot already has an active lien. It must be released before it can be pledged again.',
  ERR_LOT_PLEDGED: 'This lot is pledged. The lien must be released before it can move.',
  ERR_UNILATERAL_CUSTODY: 'Custody moves only when both sides act. Wait for the other party.',
  ERR_PRICE_HASH_MISMATCH: 'The two submitted prices do not match. Both parties must start again.',
  ERR_PATRONAGE_UNBALANCED: 'The payout lines do not add up to the settlement amount. Review the preview.',
  ERR_LEDGER_UNAVAILABLE: 'The ledger node is asleep, so you are seeing the last indexed state. Try again when the node is back.',
  NETWORK: 'Cannot reach the ledger API. Check your connection and reload.',
  UNKNOWN: 'Something went wrong on our side. Reload the page; if it persists, tell the project team.',
};
