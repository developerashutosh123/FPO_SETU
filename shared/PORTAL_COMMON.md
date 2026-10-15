# Common Rules for All Six Portal Chats (01-06)

Read this after `CONTRACT.md` and before your own `PROMPT.md`. If anything here conflicts with `CONTRACT.md`, the contract wins.

## A. Before you write any code
1. Check that `../shared/contract.ts` exists and print its `CONTRACT_VERSION`.
2. Check that `../shared/fixtures/` and `../shared/mock/server.mjs` exist. If they do not, **stop**: the 00-core-ledger chat has not finished Phase C1. Tell the human to finish that first.
3. Create `scripts/sync-contract.mjs`. It copies `../shared/contract.ts` → `src/contract/contract.ts` and `../shared/design/tokens.css` → `src/styles/tokens.css`, and adds a header comment saying "generated, do not edit". Run it in `predev` and `prebuild` **only when `../shared` exists**. On Vercel only the copies are used, so commit them.
4. Write your own `CLAUDE.md` with the commands, the folder conventions, and a "never do" list (Section F).

## B. Data access (identical pattern in every portal)
- Write a single `src/lib/api.ts` typed with contract types. It:
  - calls `NEXT_PUBLIC_API_URL` (or `EXPO_PUBLIC_API_URL`);
  - on `/health` failure or timeout (2.5 s), switches to `NEXT_PUBLIC_READ_API_URL` and sets `ledgerMode='index-only'`;
  - reads `X-Ledger-Mode` from every response;
  - maps `ApiError.code` to friendly, action-phrased messages (one message map per portal, in its language);
  - attaches the JWT.
- **Development modes** (env `NEXT_PUBLIC_DATA_SOURCE`):
  - `mock` → `http://localhost:4010` (run `node ../shared/mock/server.mjs`)
  - `live` → the gateway

  The production build **fails** unless the value is `live`; add a check in `next.config` or the build script.
- **Live updates:** subscribe to `GET /events/stream` (SSE) through one hook (`useLedgerStream`). Reconnect with backoff. In `index-only` mode, poll `/ledger/status` every 30 s instead.
- Never compute ledger facts on the client. Show what the API returns, and show `proof` wherever a record has one.

## C. Shared UI elements (contract Section 9.3, styled in your portal's theme)
Build these first, as components:
- `<LedgerProofDrawer proof docs?>`
- `<LedgerStatusPill>`
- `<OfflineBanner>`
- `<ActivityToasts>`
- `<DemoBar step>`
- `<PortalFooter>`
- `/credits`
- `/about`

Behaviour must match the contract exactly. The `/about` page shows the same architecture diagram in every portal (six surfaces → one gateway → Fabric with 4 orgs and 3 channels) and highlights where this portal sits.

The **Re-verify** button: fetch the document bytes the user may see, compute SHA-256 with `crypto.subtle.digest`, and compare the result with the on-chain hash from the API. Show both hashes and a clear match or mismatch.

## D. Cross-portal links
- Use only the `deepLink` helpers from `contract.ts` and the URLs in env vars or `/config/public`.
- Every tx ID links to the Gov explorer. Every SSCC offers "Open in…" for the portals the role is allowed to see (contract Section 9.4).
- Implement every **inbound** route other portals link to (listed in your PROMPT under "Inbound links"). A missing inbound route breaks the professor demo.
- Write a Playwright test `connectivity.spec.ts` that visits each inbound route with a seeded ID and checks the page renders real content (not a 404 or an empty state).

## E. Phases and checkpoints (same for every portal)
- **P0 Recon and scaffold.** Read the docs, scaffold the app, sync the contract, set up lint/typecheck/test, write `HUMAN_STEPS.md`, and ask all blocking questions at once. **CHECKPOINT P0.**
- **P1 Shell.** Layout, theme (`data-portal`), fonts, auth (demo logins from contract Section 5), the shared UI elements, and the API client with failover, running against the mock server. **CHECKPOINT P1:** screenshots.
- **P2 Core pages.** Every page in your PROMPT, against the mock server. Design the empty, loading and error states. **CHECKPOINT P2:** screenshots of every page at desktop and mobile widths in `docs/screenshots/`.
- **P3 Connectivity.** Deep links in and out, SSE toasts, the demo bar, and the `connectivity.spec.ts` test. **CHECKPOINT P3.**
- **P4 Realism pass.** Real images (contract Section 10), copy review against the banned-patterns list, Bengali `_review` markers, accessibility (axe-core with zero serious issues), and Lighthouse. Remove every placeholder. **CHECKPOINT P4:** before/after screenshots.
- **P5 Live integration.** The human gives you the live `API_URL` and `READ_API_URL`. Switch to `live`, then:
  - run your golden-journey Playwright steps against the real gateway;
  - verify that a tx ID shown in your UI opens in the Gov explorer with the right endorsers;
  - test index-only mode by pointing `API_URL` at a dead host and confirming the banner shows and writes are disabled.

  **CHECKPOINT P5.**
- **P6 Deploy.** Deploy to Vercel. If the Vercel CLI is logged in, use it; otherwise write click-by-click steps in `HUMAN_STEPS.md`. Settings: project root is this folder, all `NEXT_PUBLIC_*` env vars set, `NEXT_PUBLIC_DATA_SOURCE=live`. Then run a smoke test against the production URL and update `README.md` with the URL, the demo logins, and a "how this portal connects to the others" diagram. **FINAL CHECKPOINT.**

## F. Never do (all portals)
- Generate fake tx IDs, block numbers, endorsers, prices or KPIs. If data is missing, show a designed empty state that says why.
- Show data the role may not see (contract Section 9.4). The gateway filters it, but never render a field just because it happens to arrive.
- Edit `../shared/` or any other portal's folder. Contract change requests go in `CONTRACT_REQUESTS.md`, and you tell the human.
- Use AI-generated images, real institutional logos, the State Emblem, or banned design patterns.
- Ship with `NEXT_PUBLIC_DATA_SOURCE=mock`.
