#!/usr/bin/env node
// A production build must read the live gateway. Mock data never ships (PORTAL_COMMON.md section B).
const src = process.env.EXPO_PUBLIC_DATA_SOURCE;
if (src !== 'live') {
  console.error(`build refused: EXPO_PUBLIC_DATA_SOURCE is ${JSON.stringify(src)}, expected "live".\nSet EXPO_PUBLIC_DATA_SOURCE=live, EXPO_PUBLIC_API_URL and EXPO_PUBLIC_READ_API_URL in the Vercel project (see 00-core-ledger/docs/RUNBOOK.md section 0).\nFor a local check of the web bundle against the mock use: pnpm build:mock`);
  process.exit(1);
}
for (const k of ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_READ_API_URL']) {
  if (!process.env[k]) { console.error(`build refused: ${k} is not set.`); process.exit(1); }
}
console.log('check-build-env: live data source, API and read-API URLs set');
