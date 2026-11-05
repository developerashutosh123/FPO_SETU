import type { ErrorCode } from '../contract/contract';

export type ClientErrorCode = ErrorCode | 'NETWORK' | 'UNKNOWN';

/** Thrown by the API client. The screen turns `code` into a sentence with t(`errors.${code}`): one action-phrased message map per language. */
export class ApiClientError extends Error {
  constructor(public code: ClientErrorCode, public status: number, public serverMessage?: string, public txId?: string, public details?: unknown) {
    super(serverMessage ?? code);
    this.name = 'ApiClientError';
  }
}
export const asApiError = (e: unknown): ApiClientError =>
  e instanceof ApiClientError ? e : new ApiClientError('UNKNOWN', 0, e instanceof Error ? e.message : String(e));
