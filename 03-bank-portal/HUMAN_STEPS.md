# Human steps (03-bank-portal)

1. **Vercel project** named `fposetu-bank`, Root Directory `03-bank-portal`, Node 22. Leave Install and Build commands empty (defaults). `pnpm-workspace.yaml` already approves the esbuild and sharp build scripts (`allowBuilds`), so the install will not stop with ERR_PNPM_IGNORED_BUILDS.
2. **Environment variables** (Production and Preview; redeploy after changing, they are baked in at build time):
   - `NEXT_PUBLIC_DATA_SOURCE=live`
   - `NEXT_PUBLIC_API_URL=https://repaying-chant-consumer.ngrok-free.dev`
   - `NEXT_PUBLIC_READ_API_URL=https://read-api-ten.vercel.app`
   - `NEXT_PUBLIC_URL_FPO`, `NEXT_PUBLIC_URL_GOV` (and the others if you like); `NEXT_PUBLIC_URL_BANK=https://fposetu-bank.vercel.app`
   - `NEXT_PUBLIC_DEMO_MODE=true` for the professor demo (shows "Attempt duplicate pledge (demo)")
3. Add the bank domain to `CORS_ORIGINS` (gateway `.env`, then the read-api project); `https://fposetu-*.vercel.app` covers it.
4. **CGS-NPF terms:** read the NCGTC scheme document and fill in the tooltip (see `docs/DATA_SOURCES.md`).
