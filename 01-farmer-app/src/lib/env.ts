/** Build-time configuration. Metro inlines `process.env.EXPO_PUBLIC_*` only when it is written out in full, so no dynamic lookups here. */
const trim = (s: string | undefined) => (s ?? '').replace(/\/+$/, '');

export const DATA_SOURCE: 'mock' | 'live' = process.env.EXPO_PUBLIC_DATA_SOURCE === 'live' ? 'live' : 'mock';
/** mock: the mock gateway (node ../shared/mock/server.mjs). live: the gateway behind the tunnel. */
export const PRIMARY_URL = DATA_SOURCE === 'mock' ? trim(process.env.EXPO_PUBLIC_MOCK_URL) || 'http://localhost:4010' : trim(process.env.EXPO_PUBLIC_API_URL);
export const READ_API_URL = trim(process.env.EXPO_PUBLIC_READ_API_URL);

/** Env wins over GET /config/public (CONTRACT.md section 9.1). */
export const ENV_PORTAL_URLS = {
  farmerWeb: trim(process.env.EXPO_PUBLIC_URL_FARMER_WEB),
  fpo: trim(process.env.EXPO_PUBLIC_URL_FPO),
  bank: trim(process.env.EXPO_PUBLIC_URL_BANK),
  buyer: trim(process.env.EXPO_PUBLIC_URL_BUYER),
  consumer: trim(process.env.EXPO_PUBLIC_URL_CONSUMER),
  gov: trim(process.env.EXPO_PUBLIC_URL_GOV),
};
