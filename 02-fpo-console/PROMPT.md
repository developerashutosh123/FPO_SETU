# Prompt 02: FPO Operator Console (Next.js, Vercel)

> Kickoff: `cd 02-fpo-console`, then `claude --add-dir ../shared`, then send:
> `Read ../shared/CONTRACT.md, ../shared/PORTAL_COMMON.md, ../shared/contract.ts and this PROMPT.md fully. Start Phase P0. Stop at every CHECKPOINT.`
> **Prerequisite:** the 00-core-ledger chat has finished Phase C1.

## Your role
This is the operations tool of **Kharagpur Krishak Sanghati Producer Company Ltd** (fictional, `FPO07`), the busiest surface in the system. It answers: **"What is in my centre right now, and what should move today?"**

Users:
- Sujata (CEO)
- operators at the Changual collection centre
- Ratan (cold-storage/warehouse clerk)
- Subhankar (VLE), who also uses the web console

## Stack
- Next.js (latest stable, App Router), TypeScript strict, Tailwind with the shared tokens (`data-portal="fpo"`).
- TanStack Table, Recharts, `react-hotkeys-hook`.
- `@react-pdf/renderer` for labels and evidence PDFs.
- `qrcode` for the QR codes.

## Design brief
- Designed for **1366×768 laptops** and **keyboard-only operation during peak intake**. Dense tables, monospace SSCCs, strict status-colour discipline (grade A/B/C chips per tokens), no hero images inside the app (one real photo of a collection centre or cold storage on the login screen only).
- Dark mode supported.
- VLE-facing screens (Intake, Members) carry Bengali labels next to the English ones.
- Shortcuts:
  - `N`: new lot
  - `W`: read weighbridge
  - `Q`: read quality meter
  - `G`: grade
  - `P`: print label
  - `/`: search
  - `?`: shortcut overlay

## Pages
1. **Today** (`/`):
   - lot queue by status;
   - counters for drafts awaiting farmer signature, graded lots awaiting storage, and pledged lots;
   - an **exceptions panel**: PHI breach, audit divergence, cold-chain breach, a lot pledged but listed, pending custody acceptance.
   - Every row links to its lot.
2. **Intake** (`/intake`), the step 3 → 4 flow:
   - Scan or type an SSCC, or create a draft for a member (same as the VLE app).
   - While the farmer has not signed, show a live "waiting for farmer signature" state via SSE.
   - Then press **W**, which calls `POST /devices/WB-CHG-01/read` and shows the signed reading with a "device signature verified" chip; then **Q** for the quality meter. Readings are potato size grade, greening/rot/cuts %, or paddy moisture/foreign matter.
   - Then propose a grade from the readings (show the rule used), let the operator confirm, and call `POST /lots/:sscc/quality` (F3).
   - Show the receipt with endorsers.
   - Then **P**: a label PDF (100×50 mm) with the QR (`deepLink.consumer`), the SSCC, the human ref in large type, village, crop, grade and bag count.
3. **Lots** (`/lots`, `/lots/[sscc]`):
   - Filterable table: status, grade, commodity, village, farmer.
   - The lot detail page is the **full Lot Passport for the FPO role**: timeline with proofs, documents with **Re-verify**, the custody chain, a cold-chain chart, and the order/lien sections.
   - Actions depend on state: transform to processing (B/C grades), deposit, list, dispatch.
   - "Open in…" links to buyer, consumer and gov.
4. **Storage** (`/storage`), role `warehouse`:
   - Deposit into Rupnarayan Cold Storage (potato) or Kansai Agri Warehouse (paddy).
   - Request an e-NWR, which goes through the **simulated NERL/CCRL adapter** (label it so).
   - Storage condition log.
5. **Collateral position** (`/collateral`, `/collateral/[enwr]`): what is pledged, to whom, the outstanding loan (terms visible, since the FPO is in `loanTermsPDC`), and maturity, with deep links to the bank view of the same e-NWR.
6. **Orders** (`/orders`, `/orders/[id]`):
   - Create or list an order on DIRECT/ONDC/e-NAM (ONDC and e-NAM are simulated adapters).
   - **Agree price (F6), FPO side:** enter the price; the UI explains "The price goes only to you and the buyer. The shared ledger stores this hash:" and shows the hash. Show the buyer's side status live.
   - **Dispatch:** propose custody (F4) with the vehicle number and a simulated BLE logger ID. A pledged lot shows `ERR_LOT_PLEDGED` with a link to release the lien in the bank portal.
   - **Settle:** record the settlement amount and the simulated UPI ref.
7. **Patronage run** (`/patronage`):
   - Choose a settled order → `POST /patronage/preview`, a per-member table: kg, gross, each deduction, net.
   - Show the totals reconciliation: Σ net + FPO margin = settlement amount, in green or red.
   - Submit F7. Show the receipt, with "Members can see their own line in the app" and a link to Anima's statement deep link.
8. **Members** (`/members`, `/members/[id]`):
   - Onboarding status, consent version, device key registered (yes/no), lots, statement-viewed flag.
   - **DPDP erasure** button with a two-step confirm and the resulting state.
   - This page holds PII, so add role guard tests.
9. **Audit sample** (`/audit`): the 5% random re-inspection list from `GET /audit/sample`, divergence entry, and the divergence rate over time.
10. **Sell or store** (`/prices`), CEO: AGMARKNET modal series for potato/vegetables at Medinipur (West), Ghatal and Garbeta, plus paddy vs MSP. Overlay the FPO's inventory by grade and the cold-storage rent cost of holding. Wording must be neutral: decision support, not advice. Every series shows its source and fetch date.

## Inbound links (must work)
`/lots/{sscc}`, `/orders/{orderId}`, `/collateral/{enwr}`

## Outbound links
- consumer (each lot)
- buyer (`/lots/{sscc}`, `/orders/{id}`)
- bank (`/collateral/{enwr}`)
- gov (every tx, every lot)
- farmer web (statement deep link from the patronage page)

## Golden-journey steps you own
Steps 3 (draft side), 4, 5, 7 (FPO side), 8 (dispatch), 9. Write Playwright tests for each, plus the negative paths: dispatching a pledged lot, and an unbalanced patronage run.

## Images
- Login screen only: a real collection centre, cold storage or potato bags photo from West Bengal (Wikimedia/Unsplash/Pexels).
- Empty states use simple line icons, not photos.
