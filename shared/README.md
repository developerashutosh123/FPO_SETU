# shared/ (owned by 00-core-ledger)

The contract every portal builds against. Portals **copy** `contract.ts` and `design/tokens.css`; they never import from this folder at build time.

| File | What |
|---|---|
| `CONTRACT.md` | Rules, IDs, personas, endpoints. Version in the title. |
| `contract.ts` | Types and helpers (`canonicalJson`, `ssccCheckDigit`, `ERROR_HTTP_STATUS`, deep links). |
| `openapi.yaml` | OpenAPI 3.1, generated. Do not edit by hand. |
| `fixtures/*.json` | Example responses. Every tx ID and hash is a `FIXTURE-` placeholder. |
| `mock/server.mjs` | Zero-dependency mock gateway for development. |
| `testvectors/canonical-json.json` | Vectors the Go verifier must reproduce byte for byte. |

## Run the mock

```
node ../shared/mock/server.mjs            # http://localhost:4010, demo password Setu@2026
node ../shared/mock/server.mjs --index-only   # behaves like the read-only fallback: X-Ledger-Mode: index-only, writes 503
node ../shared/mock/server.mjs --no-auth      # skip role checks
```
Open `http://localhost:4010/__mock` for the mode and fixture notes. Hooks: send `X-Mock-Error: ERR_DOUBLE_FINANCING` (or `?simulate=`) to force any error code; `POST /__mock/reset` clears minted state.
The mock is stateful only where a portal needs it: a second lien on the same e-NWR is rejected with the first lien's tx; the two-step price agreement needs two matching submissions; writes mint a new `FIXTURE-` receipt that `/ledger/tx/:id` and `/events/stream` then show.

## Fixture format

Each file is `{ _meta, examples: [{ endpoint, params?, query?, status?, body }] }`. `endpoint` is the `operationId` in `openapi.yaml`. `body` is exactly the response. Tests validate every example against the contract schemas.

## The demo world in the fixtures (the seed will create the same IDs)

- Golden-journey lot: `089012340000004517`, `WB-PSM-KGP2-POT-FPO07-2026-R-00451`, Anima Das, 40 bags, closed, order `ORD-2026-00087`, e-NWR `ENWR-NERL-2026-004211`, loan `LN-2026-00040`.
- Lots in every status: pledged (`...452`, potato; `...470`, paddy), listed (`...454`), sold (`...460`), in transit (`...461`), delivered with a cold-chain breach (`...462`), rejected (`...496`), transformed (`...495`), unverifiable after erasure (`...497`), and a draft waiting for Anima's signature (`...490`). SSCC = `0` + `8901234` (fictional company prefix) + 9-digit serial + check digit; the serial matches the last five digits of the human reference.
- Open order for the live price demo: `ORD-2026-00091` (lot `...454`).
- Farmer tokens are illustrative except Anima's; live tokens depend on a server secret.

## What is not real in the fixtures

Prices, deduction rates, haircut, loan rate, quality-meter readings, diary doses and PHI days are placeholders for layout. `prices.json` rows say `FIXTURE-PLACEHOLDER`; render them as placeholder or not at all. Paddy MSP rows are real figures (secondary-source confirmed; the PIB link arrives in C4). Real prices come from AGMARKNET in phase C4.

## Commands (`pnpm install` once)

```
pnpm check            # tsc + all tests (contract, openapi, fixtures, mock)
pnpm gen:fixtures     # regenerate fixtures from scripts/gen-fixtures.ts
pnpm build:openapi    # regenerate openapi.yaml from mock/endpoints.mjs + contract.ts
```
Change the contract in this order: `contract.ts` (bump `CONTRACT_VERSION`), `mock/endpoints.mjs`, `CONTRACT.md` (+ changelog), `pnpm build:openapi`, `pnpm gen:fixtures`, `pnpm check`.
