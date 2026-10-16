import { ERROR_HTTP_STATUS, type ApiError, type ErrorCode } from './contract/contract.js';

export class HttpError extends Error {
  readonly status: number;
  constructor(readonly code: ErrorCode, message: string, readonly extra: { txId?: string; details?: unknown } = {}) {
    super(message);
    this.status = ERROR_HTTP_STATUS[code];
  }
  toBody(): ApiError {
    return { error: { code: this.code, message: this.message, ...(this.extra.txId ? { txId: this.extra.txId } : {}), ...(this.extra.details !== undefined ? { details: this.extra.details } : {}) } };
  }
}

export const notFound = (what: string) => new HttpError('ERR_NOT_FOUND', `${what} was not found.`);
export const invalid = (message: string, details?: unknown) => new HttpError('ERR_VALIDATION', message, { details });
export const forbidden = (message: string) => new HttpError('ERR_FORBIDDEN_ROLE', message);

const CODES = Object.keys(ERROR_HTTP_STATUS) as ErrorCode[];

/** Chaincode errors start with their code ("ERR_DOUBLE_FINANCING: ..."). Pull the code and the text out of any Fabric error message. */
export function parseChaincodeMessage(text: string): { code: ErrorCode; message: string } | undefined {
  for (const code of CODES) {
    const i = text.indexOf(`${code}: `);
    if (i >= 0) {
      const rest = text.slice(i + code.length + 2);
      const end = rest.search(/["\n]|\s+at\s+\w+\.|\\n/);
      return { code, message: (end > 0 ? rest.slice(0, end) : rest).trim().replace(/\\"/g, '"') };
    }
  }
  return undefined;
}
