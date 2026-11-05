# What the human does (01-farmer-app)

## Run it locally against the mock
```
node ../shared/mock/server.mjs     # terminal 1
pnpm install && pnpm dev           # terminal 2, opens http://localhost:3001
```
Language tile, then phone `9000000001`, "Send OTP", the demo OTP `123456` is shown on screen, type it.

## Deploy to Vercel (when you are ready for live data)
1. New Project, import the repo, **Root Directory `01-farmer-app`**, **name `fposetu-farmer`** (so the URL is `https://fposetu-farmer.vercel.app`, as RUNBOOK section 0 expects). Framework preset: Other. Leave Install and Build commands as they are: `vercel.json` sets `pnpm install` and `pnpm build`. Node 22.x.
2. Settings, Environment Variables (Production and Preview):
   - `EXPO_PUBLIC_DATA_SOURCE` = `live` (the build refuses anything else)
   - `EXPO_PUBLIC_API_URL` = `https://repaying-chant-consumer.ngrok-free.dev`
   - `EXPO_PUBLIC_READ_API_URL` = `https://read-api-ten.vercel.app`
   - optional: `EXPO_PUBLIC_URL_*` from `.env.example`
3. Make sure `https://fposetu-farmer.vercel.app` (or the pattern `https://fposetu-*.vercel.app`) is in `CORS_ORIGINS` of the gateway and of the read-API (RUNBOOK section 5). Set `URL_FARMER_WEB` on the read-API too.
4. Open the URL on a phone over mobile data. Use `https`: the signing key needs a secure context.

If the install step fails with `ERR_PNPM_IGNORED_BUILDS`, a dependency with a build script was added: list it under `allowBuilds` in `pnpm-workspace.yaml` (reproduce with `CI=1 pnpm install --frozen-lockfile` in an empty store).

## Needs a person
- A native Bengali speaker to review `src/i18n/bn.json` (every string is `_review`) and the number words in `src/lib/numberWords.ts`.
- Real photographs for empty states (PORTAL_COMMON P4), if wanted.
- Contract owner (00-core-ledger): the two items in `CONTRACT_REQUESTS.md`.
