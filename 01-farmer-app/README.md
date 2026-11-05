# FPO-SETU farmer app (web build, prototype)

Academic prototype, RD61003, CRDIST, IIT Kharagpur, Group 7. Not a government, banking or payment service. Ledger is live Hyperledger Fabric 2.5; external integrations are simulated.

The farmer's window onto the shared lot record: what happened to my lot, and what was I paid. Bengali by default, Hindi and English on a switch. Labelled **Web demo**.

## What is in this build
| Screen | Route | Notes |
|---|---|---|
| Language picker | `/language` | first launch |
| Login | `/login` | phone, then the demo OTP shown on screen; makes and registers the device key |
| Home | `/home` | waiting-for-signature card, season summary, lot cards with net credit |
| Lot detail | `/lot/{sscc}` (inbound link) | timeline with proof chips, "pledged to bank", consumer QR |
| Confirm lot (F2) | `/confirm/{sscc}` | "আমি নিশ্চিত করছি" signs `payloadToSign` with this phone's key; receipt and proof sheet |
| Statement | `/statement`, `/statement/{sscc}` (inbound link) | gross, each deduction, net, simulated UPI ref, "পড়ে শোনান" read-aloud |
| Profile, About, Credits | `/profile`, `/about`, `/credits` | |

Not in this build: VLE mode (plot capture, onboarding), consent screen, crop diary, prices, erase-my-data, offline outbox, Expo Go / APK. See `CLAUDE.md`.

## Demo login
Phone `9000000001` (Anima Das), OTP `123456` (shown on screen). Against the mock this farmer has one settled lot with a statement (`089012340000004517`), a pledged lot (`...4524`) and a draft waiting for her signature (`...4906`).

## Run
See `HUMAN_STEPS.md`. Short version: `node ../shared/mock/server.mjs`, then `pnpm install && pnpm dev`.

## Verify
`pnpm check` (typecheck + 38 unit tests), then `pnpm build:mock && pnpm e2e` (17 Playwright tests on the production bundle against the mock). Screenshots: `docs/screenshots/`.

## How this app connects to the others
```
farmer app --(REST + SSE, ngrok header)--> gateway --> Fabric (4 orgs, 3 channels)
     |  \--(index-only fallback, read)---> read-api --> Postgres index
     |--> each tx links to the governance explorer  {URL_GOV}/ledger/tx/{txId}
     \--> each lot's QR is the consumer page        {URL_CONSUMER}/00/{sscc}
inbound: {URL_FARMER_WEB}/lot/{sscc} and /statement/{sscc} (tested); fposetu://lot/{sscc} and fposetu://statement/{sscc} (scheme configured, native not tested in this web-only build)
```

## Simulated here
The weighing and quality devices, UPI references (shown as "SIM ..."), the e-NWR repository and OTP delivery. In mock mode every tx ID starts with `FIXTURE-` and is not a ledger transaction.
