# 02-fpo-console: FPO operator console

Read first: `../shared/CONTRACT.md`, `../shared/PORTAL_COMMON.md`, `../shared/contract.ts`, `PROMPT.md`, `../00-core-ledger/docs/RUNBOOK.md` section 0 and 3.
Next.js 16 App Router, TypeScript strict, Tailwind 4 with the shared tokens (`data-portal="fpo"`), pnpm. `AGENTS.md` warns that this Next differs from older versions: check `node_modules/next/dist/docs/` before using an API you are unsure of.

## Commands
- `pnpm dev` (port 3002; `predev` copies the contract and tokens from `../shared`)
- `node ../shared/mock/server.mjs` mock gateway on :4010 (`pnpm mock`, quiet)
- `pnpm check` typecheck + vitest. `pnpm test:e2e` Playwright against the mock (starts both servers). `SHOTS=1 pnpm test:e2e tests/shots.spec.ts` writes `docs/screenshots/`.
- `NEXT_PUBLIC_DATA_SOURCE=live NEXT_PUBLIC_API_URL=... NEXT_PUBLIC_READ_API_URL=... pnpm build` (a build without `live` is refused on purpose)

## Layout
- `src/lib/api.ts` is the only module that talks to the gateway: health probe (8 s, retried once) before falling back to the read-API, ngrok header on ngrok hosts, `X-Ledger-Mode` tracking, JWT.
- `src/lib/{grading,price,queue,access}.ts` are pure and unit-tested. `useLedgerStream.ts` is the single SSE reader (fetch-based, so the ngrok header can be sent); `ledgerEvents.tsx` shares it with the views.
- `src/app/<route>/<Route>View.tsx` holds the client page; `page.tsx` stays a thin server file. Roles are enforced by `RequireAuth` through `src/lib/access.ts` (the gateway still enforces them server-side).
- `src/contract/` and `src/styles/tokens.css` are generated copies. Never edit them.

## Never do
- Invent tx IDs, block numbers, endorsers, prices or KPIs. No data from the API means a designed empty state.
- Compute ledger facts in the browser. Price hashes come from the gateway; the UI never sends a salt.
- Render a field because it happened to arrive. Lot lists carry no names or phones; do not add them.
- Edit `../shared/` or another portal. Contract requests go in `CONTRACT_REQUESTS.md`.
- Ship `NEXT_PUBLIC_DATA_SOURCE=mock`, real institutional logos, AI images, emoji icons, em dashes in UI copy.
- Commit outside this folder (seven chats share one repo): `git pull --rebase` first.
