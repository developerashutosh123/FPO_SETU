# gateway/

The one API every portal calls: Fastify on Node 22 (TypeScript strict), the Fabric Gateway SDK, Drizzle on Postgres. It also runs the event indexer, the SSE stream, the status-mirror worker, the simulated adapters and the real AGMARKNET adapter.

Fabric has no official Python gateway SDK, which is why this is Node and not the FastAPI of the mid-term report (DECISIONS D18).

## What is where

| Path | What |
|---|---|
| `src/contract/` | Copies of `shared/contract.ts`, the endpoint table and `openapi.yaml` (`pnpm sync:contract`). Never edit. A test fails if they drift. |
| `src/app.ts` | Registers every endpoint from the shared table, so roles cannot drift from the contract. Helmet, CORS allowlist, rate limit, `/docs`. |
| `src/routes/` | One file per area: system and explorer, farmers and diary, lots and devices, storage and finance, trade, patronage and statements, analytics, public. |
| `src/fabric/` | gRPC client per org, identities from `wallet/`, submit with receipts, block and transaction decoder. |
| `src/indexer/` | Follows block events per channel, stores blocks, transactions, VALID events, refreshes entity views, feeds SSE. |
| `src/adapters/` | Simulated adapters behind interfaces; `agmarknet.ts` is real. |
| `src/services/` | Valuation, deductions, KPIs, passport and role filtering, simulated devices, label PDF, ids, crypto. |
| `src/db/schema.ts`, `drizzle/` | Postgres schema and generated SQL migrations. |
| `config/rates.json` | Deduction rates and lender parameters, each with a status. Unsourced rates are `null` and block statements (see docs/DATA_SOURCES.md). |
| `scripts/` | `e2e-journey.ts`, `seed-ledger.ts`, `load-agmarknet-csv.ts`, `migrate.ts`, `sync-contract.mjs`. |
| `test/` | Vitest: role matrix over every endpoint, one group per row of CONTRACT.md 9.4, decoder on real blocks, indexer, mirror queue, SSE. |

## Run it

```
cp .env.example .env          # fill DATABASE_URL, DIRECT_URL, the three secrets (openssl rand -hex 32), DATAGOVIN_API_KEY
pnpm install
pnpm db:migrate               # once per database; uses DIRECT_URL
pnpm start                    # needs: make up && make deploy in the parent folder
```
`GET /health` answers `ok:false` with 503 when the ledger is not reachable, which makes the portals switch to the read-only API. `GET /docs` is the OpenAPI UI.

## Test it

```
make test-db                  # parent folder: a throwaway Postgres on port 54329 (never real data)
pnpm check                    # typecheck + 113 vitest cases
pnpm e2e                      # steps 1-10 of the golden journey through HTTP on the live network, 103 checks
```
The e2e run uses `test/e2e-rates.json` and one TEST price row, both only in a throwaway database. The ledger keeps every run's lots, so each run starts its counters at a random offset.

## Seed it (after `make rebuild`, with real prices and rates)

```
pnpm load:csv data/agmarknet/*.csv       # real price history
pnpm seed --scale mini                   # check first: about 25 lots, every branch once
pnpm seed                                # 150 members, about 540 lots in every state; about 44 minutes against Supabase Mumbai (DECISIONS D27)
```
The seed drives the same HTTP routes a portal uses, so every record on the ledger came from real transactions. It refuses to start while prices or deduction rates are missing, or if the database already has lots.
