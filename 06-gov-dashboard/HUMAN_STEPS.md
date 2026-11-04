# Human steps for 06-gov-dashboard

Nothing here is needed to run against the mock. Do these at P5/P6.

1. **Vercel project** named `fposetu-gov`, root directory `06-gov-dashboard`, Node 22, framework Next.js. Leave Install and Build commands empty.
2. **Environment variables** (Production and Preview; redeploy after changing, they are baked in at build time):
   - `NEXT_PUBLIC_DATA_SOURCE` = `live` (the build fails otherwise)
   - `NEXT_PUBLIC_API_URL` = `https://repaying-chant-consumer.ngrok-free.dev`
   - `NEXT_PUBLIC_READ_API_URL` = `https://read-api-ten.vercel.app`
   - `NEXT_PUBLIC_URL_FPO` = the FPO console production URL (gives the board its "Open in FPO console" link; the observer never gets it)
   - `NEXT_PUBLIC_URL_GOV` = `https://fposetu-gov.vercel.app` (not read yet; reserved for the demo bar)
3. **CORS:** add `https://fposetu-gov.vercel.app` (or the real URL if Vercel adds a suffix) to `CORS_ORIGINS` on the gateway and the read-API, or use the `https://fposetu-*.vercel.app` pattern from RUNBOOK section 5.
4. Tell the 00-core-ledger chat the four items in `CONTRACT_REQUESTS.md`.
5. Real-browser check of the ngrok interstitial: open `https://fposetu-gov.vercel.app/ledger` on a phone over mobile data. RUNBOOK section 3 notes this was only emulated with curl.
