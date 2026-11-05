import { kvGetJson, kvSet } from './kv';

/**
 * "This is not right" on a draft. The contract (1.0.4) has no endpoint to reject a draft, so nothing is written to the gateway:
 * the farmer simply does not sign, and this phone stops listing the draft. See CONTRACT_REQUESTS.md.
 */
export const DECLINED_KEY = 'fposetu.farmer.declined';
export const getDeclined = () => kvGetJson<string[]>(DECLINED_KEY) ?? [];
export const setDeclined = (ssccs: string[]) => kvSet(DECLINED_KEY, JSON.stringify(ssccs));
