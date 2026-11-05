# Human steps (04-buyer-portal)

1. **Vercel project** named `fposetu-buyer`, Root Directory `04-buyer-portal`, Node 22. Leave Install and Build commands empty. `pnpm-workspace.yaml` approves the esbuild and sharp build scripts (`allowBuilds`).
2. **Environment variables** (Production and Preview; redeploy after changing):
   - `NEXT_PUBLIC_DATA_SOURCE=live`
   - `NEXT_PUBLIC_API_URL=https://repaying-chant-consumer.ngrok-free.dev`
   - `NEXT_PUBLIC_READ_API_URL=https://read-api-ten.vercel.app`
   - `NEXT_PUBLIC_URL_BUYER=https://fposetu-buyer.vercel.app`; `NEXT_PUBLIC_URL_FPO`, `NEXT_PUBLIC_URL_CONSUMER`, `NEXT_PUBLIC_URL_GOV` if the names differ
   - `NEXT_PUBLIC_DEMO_MODE=true` for the professor demo (demo bar and the "Try accepting as the FPO" button)
3. Add the buyer domain to `CORS_ORIGINS` (gateway `.env`, then the read-api project); `https://fposetu-*.vercel.app` covers it.
4. **Camera:** the QR scan needs HTTPS (Vercel is) and a camera permission prompt. Test once on a phone; the camera path is only covered by a stubbed test here.
5. **Map tiles** load from tile.openstreetmap.org; no key needed.
6. Photography and `/credits` are not done yet (P4).
