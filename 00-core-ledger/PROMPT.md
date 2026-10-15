# Prompt 00: Core Ledger (Hyperledger Fabric 2.5 + Gateway API + Read-only API)

> **Run this chat first.** Run it inside a **GitHub Codespace** on the `fpo-setu` repo (see `HUMAN_SETUP.md`); you do not need Linux on your PC.
> Kickoff: open a terminal in the Codespace, `cd 00-core-ledger`, run `claude --add-dir ../shared`, then send:
> `Read ../shared/CONTRACT.md, ../shared/contract.ts and this PROMPT.md fully. Then start Phase C0. Stop at every CHECKPOINT.`

---

## Your role

You are the backend and blockchain lead for FPO-SETU. You own:
- the **Hyperledger Fabric v2.5** network,
- the three **Go chaincodes**,
- the **gateway API** that every portal calls,
- the **event indexer**,
- the **read-only fallback API**,
- the **shared contract** (`../shared/`).

Six other Claude Code chats build the portals in parallel, against the contract you publish. Your job is to make that contract true.

The contract in `../shared/CONTRACT.md` overrides anything in this prompt that conflicts with it. **If you need to change the contract, do it in Phase C1 or as early as possible.** For every change: bump `CONTRACT_VERSION`, write a changelog line, and tell the human in your checkpoint report exactly which portals are affected.

## Environment facts (verify, don't assume)
- You run in a GitHub Codespace (Linux container, Docker available via the docker-in-docker feature). The human has **no local Linux**, so every command must work inside the Codespace.
- The Codespace sleeps when idle. Everything must survive a stop/start: `make resume` restarts the containers on existing volumes, and `make rebuild` recreates the network, redeploys and reseeds deterministically in under 20 minutes.
- Public exposure: forward gateway port **8080** with **public** visibility. The URL looks like `https://<codespace-name>-8080.app.github.dev`. The human sets this once (`gh codespace ports visibility 8080:public -c $CODESPACE_NAME`); you write the command into `HUMAN_SETUP` notes. If cross-origin `fetch` from Vercel to the forwarded port fails (interstitial page or auth redirect), fall back to `cloudflared tunnel --url http://localhost:8080`, a quick tunnel that needs no account, and document both.
- **Postgres** is hosted outside the Codespace so that data and the read-only fallback survive Codespace sleep. Use **Supabase** (Mumbai region if available, for the data-residency story) or **Neon**. `DATABASE_URL` comes from the human (see the API-keys table in `HUMAN_SETUP.md`). Use a local Postgres container only for tests.

---

## Phase C0: Recon and devcontainer
1. Read the contract, `contract.ts` and the mid-term documents if they are present in `../docs/`.
2. Create `../.devcontainer/devcontainer.json` at the repo root:
   - Ubuntu base image
   - features: `docker-in-docker`, `go` (1.22+), `node` (22), `github-cli`
   - `hostRequirements: { cpus: 4, memory: "16gb" }`
   - `forwardPorts: [8080]`
   - `postCreateCommand` that installs pnpm, `jq`, `yq` and Claude Code (`npm i -g @anthropic-ai/claude-code`)

   Note in your report that a rebuild is needed if the human opened the Codespace before this existed.
3. Measure the available RAM and CPU. Decide between the **full** profile (3 Raft orderers, 4 peers, 5 CAs) and the **lite** profile (1 Raft orderer, 4 peers, 5 CAs, LevelDB). Both must use the same channels, chaincodes, policies and PDCs. Only the orderer count may differ. Write the decision and the measured numbers to `docs/DECISIONS.md`.
4. Write `HUMAN_STEPS.md` covering every account, key and click you need from the human, then ask all your blocking questions at once (at most 5).

**CHECKPOINT C0**

## Phase C1: Freeze and publish the contract (this unblocks the six portal chats)
1. `../shared/fixtures/`: one realistic JSON file per endpoint group (`auth.json`, `ledger.json`, `lots.json`, `collateral.json`, `orders.json`, `statements.json`, `kpis.json`, `prices.json`, `provenance.json`, `villages.json`).
   - Use the seed IDs, personas and SSCCs that your seed will really create, so fixtures and live data look the same.
   - Every fixture tx ID is a placeholder `"FIXTURE-…"` string, so nobody mistakes fixture data for ledger data.
2. `villages.json`: geocode the 5 villages with OpenStreetMap Nominatim (`format=jsonv2`, a descriptive User-Agent, 1 request per second). Verify that each result lies in the right block of Paschim Medinipur, and record the source URL in each row. If Gopalpur (Keshiary) is ambiguous, list the candidates and ask the human.
3. `../shared/openapi.yaml`: OpenAPI 3.1 describing every endpoint in Section 8 of the contract, with types matching `contract.ts`.
4. `../shared/mock/`: a tiny zero-dependency Node mock server (`node ../shared/mock/server.mjs`, port 4010). It serves the fixtures for every GET and returns realistic receipts for POSTs, using fake tx IDs prefixed `FIXTURE-`. Portals may use it locally **only during development**.
5. Run `tsc --noEmit` on `contract.ts`, and add a unit test for `canonicalJson` and `ssccCheckDigit`.

**CHECKPOINT C1.** Report: "Contract v1.0.x frozen. Portal chats can start now." List what each portal should know.

## Phase C2: Fabric network (`network/`)
Implement Section 7 of the contract:
- **Pin images and binaries** to the latest Fabric **2.5.x** and Fabric CA **1.5.x**. Install them with the official `install-fabric.sh` script, pinning the versions explicitly. Record the versions in `network/VERSIONS.md` and do not use Fabric 3.x.
- `docker-compose` with resource limits:
  - one Fabric CA per org plus the orderer org;
  - orderer(s) using Raft;
  - 4 peers on LevelDB.
- **Identities:** register and enroll them through the CAs, with **attributes** (`role=…`) for every persona in Contract Section 5, plus the device identities `WB-CHG-01` and `QM-CHG-01` (`role=device`). Store the wallet under `wallet/` (gitignored).
- **Channels:** create them with `configtxgen` + `osnadmin channel join`. Fabric 2.5 has no system channel. Join each peer to the channels listed in the contract.
- **Scripts:** `network/scripts/network.sh up|down|reset|status`. All of them are idempotent.
- **Makefile targets:** `make up`, `make resume`, `make rebuild`, `make status`, `make logs`.
- **Verify:**
  - `peer channel list` for every peer;
  - `osnadmin channel list` for the orderer(s);
  - the Raft leader;
  - `docker stats --no-stream` totals.

**CHECKPOINT C2.** Paste the outputs.

## Phase C3: Chaincode (`chaincode/`, Go, `fabric-contract-api-go`)
Three contracts per contract Section 7. Rules to implement **and unit-test** (counterfeiter mocks, following the `fabric-samples` asset-transfer pattern):

**`lot-lifecycle`**
- **Submitter checks:** check the submitter's MSP ID and `role` attribute with the `cid` package. For example, only `FpoOrgMSP` with `role=vle|operator` may commission a lot.
- **F1 and the state machine:** F1 stores `farmerToken → {devicePubKeyHex, consentHash, plotIds[], polygonHashes[]}`. The status machine follows contract Section 3.2 exactly, and any illegal transition returns `ERR_INVALID_STATE`.
- **F2:** verify the farmer's ECDSA P-256 signature over `canonicalJSON(payload)` with Go `crypto/ecdsa` + `sha256`. On a mismatch, return `ERR_BAD_FARMER_SIGNATURE`. Write a Go test that uses the **same canonical bytes** that TypeScript `canonicalJson()` produces: generate a test vector with Node and commit it to `chaincode/testdata/`.
- **F3:** verify the device signature in the same way (`ERR_BAD_DEVICE_SIGNATURE`).
- **F4 custody:** `proposeTransfer` sets a **state-based endorsement policy** on the lot key requiring both the from-org and the to-org. `acceptTransfer` checks that `GetMSPID() == toOrg`. A unilateral accept must fail with `ERR_UNILATERAL_CUSTODY`. A `PLEDGED` lot cannot be proposed (`ERR_LOT_PLEDGED`).
- **Pledge status:** `lot-lifecycle` exposes `setPledged(sscc, bool)`, which only an `FpoOrgMSP` `role=warehouse` identity may call. The gateway calls it after `markLien` and `releaseLien` commit, so the lot status follows the lien.
- **F7:** the patronage vector must reconcile. `sum(net) + fpoMargin == settlementAmount`, within ₹1 for rounding, otherwise `ERR_PATRONAGE_UNBALANCED`. Never write price-per-kg on this channel. In `docs/DECISIONS.md`, explain that per-member payouts on trace-channel reveal an approximate price to its members, and why this trade-off was accepted.
- **DPDP erasure:** `markUnverifiable(farmerToken)` flags the farmer's lots `UNVERIFIABLE` for origin and emits `PersonalDataErased`.

**`pledge-lien`**
- `markLien` does a **cross-channel read** of the lot from `lot-lifecycle` on trace-channel (`InvokeChaincode`; this is query-only) to check that it exists and is `IN_STORAGE` and graded.
- **One active lien per e-NWR and per SSCC**: a second lien returns `ERR_DOUBLE_FINANCING` with the existing lien's tx ID in the message. Loan terms go to `loanTermsPDC` via the transient map.

**`order-settlement`**
- `agreePrice` is **two-step**: the FPO submits `{orderId, priceHash}` and keeps the price + salt in the transient map → `tradePricePDC`; the buyer submits the same, and the call commits when both hashes match (`ERR_PRICE_HASH_MISMATCH` otherwise).
- `GetPrivateDataHash` is used to verify. Write a test proving that a non-member org cannot read the PDC.

**Every function** emits its event from contract Section 3.3, with an EPCIS-shaped payload containing **no PII and no price**.

**Deployment:**
- `scripts/deployCC.sh` runs the full lifecycle: package, install on the relevant peers, approve for each org, check commit readiness, commit.
- Endorsement policies and collections follow contract Section 7.
- Run `make test` (all Go tests, ≥80% coverage on rule logic) and `go vet`.

**CLI smoke test** (`scripts/cli-smoke.sh`): the F1-F7 happy path plus the 4 negative cases (bad farmer signature, unilateral accept, double lien, PDC read by the Regulator).

**CHECKPOINT C3.** Paste the test results and the smoke-test tx IDs.

## Phase C4: Gateway, indexer, adapters, seed (`gateway/`)

**Stack:**
- Node 22, TypeScript strict, **Fastify**, `@hyperledger/fabric-gateway`, `@grpc/grpc-js`, Zod.
- Drizzle ORM on Postgres (`DATABASE_URL`).
- `@fastify/swagger` serving `../shared/openapi.yaml` at `/docs`.
- Copy `../shared/contract.ts` into `src/contract/` with a sync script; the server's types must be the contract types.

Fabric has no official Python gateway SDK, which is why this is Node and not the FastAPI written in the mid-term report. Record that in `docs/DECISIONS.md`.

**What to implement:**
- **Endpoints:** implement every endpoint in contract Section 8 with the exact paths, roles, payloads, error codes and `LedgerReceipt` shape. Server-side field filtering per role must follow contract Section 9.4. Write a test per row of that table.
- **Identity mapping:** each JWT user maps to an enrolled Fabric identity (custodial prototype pattern; production would use per-org HSM keys; note this in DECISIONS). Members submit through the FPO identity, but their **device signature** is what F2 verifies.
- **Receipts:** after `submit`, wait for commit status, then fill `blockNumber` and `endorsers`. Read endorsers from the processed transaction via `qscc GetTransactionByID`, decoding with `@hyperledger/fabric-protos`.
- **Explorer endpoints:** the `/ledger/*` routes are built on `qscc` (`GetChainInfo`, `GetBlockByNumber`, `GetTransactionByID`, `GetBlockByTxID`) plus `/ledger/status` from peer/orderer health.
- **Indexer:**
  - `network.getChaincodeEvents()` per channel+chaincode, with a Postgres-backed checkpointer.
  - It upserts `ledger_events`, `lots_view`, `liens_view`, `orders_view`, `patronage_view` and `blocks_view` (block headers per channel), so the read-only API can serve the explorer too.
  - It feeds **SSE** at `/events/stream`.
- **Simulated adapters** in `src/adapters/` behind interfaces: AgriStack, ENWRRepository (NERL/CCRL), UPI, eNAM, ONDC, Bhashini, AccountAggregator, NCGTC. Each reports `mode:'simulated'` via `/config/public`.
- **AgmarknetAdapter is real.** Use the data.gov.in API ("Current Daily Price of Various Commodities from Various Markets (Mandi)") with `DATAGOVIN_API_KEY` for Potato, Brinjal, Cauliflower, Tomato, and Paddy/Rice if reported, at Medinipur (West), Ghatal, Garbeta and Purba Medinipur markets.
  - The daily API only covers the current day, so also run a **daily snapshot job** that appends to `price_series`.
  - For history, ask the human to download CSVs from the AGMARKNET portal for the last 2 seasons. Load them with `scripts/load-agmarknet-csv.ts`.
  - **Never synthesise prices.** Paddy MSP comes from PIB/CACP press releases, cited.
- **Simulated devices:** `POST /devices/:deviceId/read` returns realistic potato/paddy readings (research plausible ranges and cite them in `docs/DATA_SOURCES.md`), signed with the device key so that F3 verification is real.
- **Deductions:**
  - Cold storage rent: use the West Bengal government's notified rate for the season, cited.
  - Hamali, market fee and commission: researched and cited. If only ranges exist, use the midpoint and say so.
- **Security:**
  - CORS allowlist from the env (`CORS_ORIGINS`, all 6 Vercel domains + localhost).
  - `@fastify/helmet`, `@fastify/rate-limit`.
  - The JWT secret comes from the env. No secrets in git; `.env.example` is complete.
- **Seed** (`scripts/seed-ledger.ts`): creates the demo world from contract Sections 4.5 and 5 **through real transactions**. It is deterministic (fixed RNG seed), runs with a concurrency limit, and finishes in under 15 minutes.
  - **Personas:** the named personas own the golden-journey lots.
  - **Lot volume:** ~400 potato lots, ~60 paddy lots and ~80 vegetable lots.
  - **Lots in every state:** some pledged, some sold, some settled with patronage, a few with cold-chain breaches, a few audit divergences, one rejected double-financing attempt, and one DPDP-erased farmer.
- **E2E:** `scripts/e2e-journey.ts` runs contract Section 6 steps 1-10 against the API and asserts every effect, including the negative cases. `pnpm e2e` must be green.

**CHECKPOINT C4.** Paste the e2e output, a sample `/ledger/tx/:id` showing multi-org endorsers, and the SSE output.

## Phase C5: Read-only fallback API and public exposure

**Read-only API** (`read-api/`): a Next.js project deployed to **Vercel**, route handlers only.
- It serves every **GET** endpoint of contract Section 8 from the Postgres index, using the same JSON shapes, with the header `X-Ledger-Mode: index-only`.
- `/ledger/status` returns `mode:'index-only'` and `lastIndexedAt`.
- All POSTs return `503 ERR_LEDGER_UNAVAILABLE`.
- This keeps every portal viewable 24/7 while the Codespace sleeps. **Be honest:** the explorer pages say the data comes from the index of the last-known chain state, not a live peer query.

**Client failover** (documented in `shared/CONTRACT.md` changelog as v1.1 if you add details): portals call `API_URL`. If `/health` fails within 2.5 s, they switch to `READ_API_URL` and show the amber banner.

**Public exposure:**
- Make the gateway's port 8080 public.
- Test CORS from a Vercel preview origin.
- Write `docs/RUNBOOK.md`:
  - start the Codespace 15 minutes before a demo;
  - `make resume`;
  - verify `/health`;
  - set the idle timeout to the maximum in GitHub settings before demo day;
  - the fallback tunnel;
  - what to do if state is lost (`make rebuild`, ~20 min).

**CHECKPOINT C5.** Report the live gateway URL, the read-API URL, and the curl outputs of both `/health` endpoints.

## Phase C6: Always-on option and hand-off
- `deploy/vm/`: optional scripts to move this exact stack to a cloud VM later, without any Linux on the human's PC (the human SSHes from Windows PowerShell, or you run them from the Codespace). Include Caddy for automatic TLS (an `sslip.io` hostname if there is no domain) and systemd units. Do not execute these unless the human asks.
- **Final docs:**
  - `README.md` (what, why, architecture diagram, 3-command local run)
  - `docs/DECISIONS.md` (every deviation from the mid-term report)
  - `docs/DATA_SOURCES.md`
  - `docs/RUNBOOK.md`
  - `docs/PROFESSOR_DEMO.md` (a 7-minute script across the six portals, including the 3 key moments: the double-lien rejection, the private price hash, and the farmer statement read aloud)

**FINAL CHECKPOINT**

---

## Never do
- Fake a tx ID, block number or endorsement anywhere, including the read-API.
- Put PII or prices in chaincode events, logs, or public state.
- Name a real FPO, bank or buyer as an operator in seed data.
- Upgrade to Fabric 3.x, or swap Fabric for another chain because it is easier.
- Edit a portal folder. If a portal is broken because of the contract, tell the human which portal and what changed.
