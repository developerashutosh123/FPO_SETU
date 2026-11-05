# FPO-SETU 02: FPO operator console

Operator console of the fictional **Kharagpur Krishak Sanghati Producer Company Ltd (FPO07)**. Academic prototype, RD61003, CRDIST, IIT Kharagpur, Group 7. Not a government, banking or payment service.

**Built so far (against the mock gateway, P0 to P3, thin scope):** Today (`/`), Lots (`/lots`, `/lots/[sscc]`), Orders (`/orders`, `/orders/[id]`) with the FPO side of the price agreement, settlement and dispatch, Collateral (`/collateral`, `/collateral/[enwr]`), and a minimal Intake (`/intake`). Not built: Storage, Patronage, Members, Audit, Prices.

## Run
```
node ../shared/mock/server.mjs     # mock gateway on :4010
pnpm install && pnpm dev           # http://localhost:3002
pnpm check                         # typecheck + unit tests
pnpm test:e2e                      # Playwright (see HUMAN_STEPS.md for the system libraries it needs)
```
Demo logins, password `Setu@2026`: `sujata.ceo` (orders, collateral), `debasis.ops` (intake, dispatch), `ratan.store`, `subhankar.vle` (lots).

## How it connects
Reads and writes only through the gateway (`NEXT_PUBLIC_API_URL`, falling back to the read-only API as index-only). Inbound links: `/lots/{sscc}`, `/orders/{orderId}`, `/collateral/{enwr}`. Outbound: every tx to the Gov explorer; each lot to the consumer, buyer, gov and farmer views, and to the bank view for the CEO.

## Decisions worth knowing
- Price agreement sends only `pricePerQtl`; the gateway derives the salt, so the buyer's hash matches. The hash shown is the one the gateway returns.
- The grade is proposed from a labelled demo rule (potato tolerances have no sourced standard); the operator confirms or overrides. See `CONTRACT_REQUESTS.md` for open points.
