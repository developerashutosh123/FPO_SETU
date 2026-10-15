# Prompt 04: Buyer / Processor Sourcing Portal (Next.js, Vercel)

> Kickoff: `cd 04-buyer-portal`, then `claude --add-dir ../shared`, then send:
> `Read ../shared/CONTRACT.md, ../shared/PORTAL_COMMON.md, ../shared/contract.ts and this PROMPT.md fully. Start Phase P0. Stop at every CHECKPOINT.`
> **Prerequisite:** the 00-core-ledger chat has finished Phase C1.

## Your role
This is the procurement portal of **Gangetic Fresh Foods Pvt Ltd** (fictional; a Kolkata potato processor and fresh-produce retailer). It answers: **"Can I trust this consignment, and can I buy more of it?"**

User: Rahul Agarwal (`rahul.buyer`, role `buyer_manager`, `BuyerOrgMSP`).

## Stack
- Next.js (latest stable, App Router), TypeScript strict, Tailwind with the shared tokens (`data-portal="buyer"`).
- Recharts, `react-leaflet` with OSM tiles (with attribution).
- QR scanning with `BarcodeDetector`, falling back to `html5-qrcode`.
- `@react-pdf/renderer` for evidence packs.

## Design brief
- A **B2B sourcing catalogue**: forest green and kraft-paper tones, real product photography of potatoes, potato bags, cold-storage aisles and fresh vegetables at Indian mandis (Wikimedia/Unsplash/Pexels, credited).
- Dense but scannable cards and tables, with spec-sheet style lot pages.
- It should feel closer to an industrial procurement tool than a consumer shop.

## Pages
1. **Catalogue** (`/`): filter by commodity, variety, grade, minimum quintals and village. Each card shows grade, kg, cold-chain continuity, PHI-compliant and residue-tested chips, and the village. Pledged lots never appear; the gateway excludes them.
2. **Lot provenance** (`/lots/[sscc]`), the spec sheet:
   - origin village and block on a map;
   - harvest/unload date and variety;
   - quality readings with the **device-verified** chip;
   - PHI compliance flag (the buyer never sees the diary itself);
   - residue credential;
   - custody chain;
   - a **cold-chain temperature chart** with breach markers and the anchored digest proofs;
   - documents with **Re-verify**;
   - every proof linking to the Gov explorer.
3. **Order** (`/orders/new`, `/orders`, `/orders/[id]`):
   - Create an order for one or more lots.
   - **Agree price (F6), buyer side:** enter the price. The UI shows the hash being committed and explains it: "Only you and the FPO can read this price. The shared ledger stores only this hash; the bank and the regulator see the hash, not the price."
   - Show the FPO-side status live (SSE). When both hashes match, show the receipt with endorsers **FpoOrgMSP + BuyerOrgMSP**.
   - Show a mismatch case clearly (`ERR_PRICE_HASH_MISMATCH`).
4. **Receive shipment** (`/receive`):
   - Webcam QR scan of the crate label, which resolves to the SSCC, then shows the in-transit lot.
   - **Accept custody (F4)**, then **accept quality**.
   - Explain that the accept only succeeds because the buyer's own org signs: custody cannot be asserted by the FPO alone.
   - **Demo-only button:** "Try accepting as the FPO (should fail)". It shows `ERR_UNILATERAL_CUSTODY`.
5. **Supplier reliability** (`/supplier`): FPO-level history from the buyer's own orders: on-time delivery, weight loss in transit, quality acceptance rate, cold-chain breach rate. Each figure states its numerator and denominator.
6. **Evidence pack for the buyer's customer** (`/orders/[id]/evidence`): a PDF with origin, quality credential, custody, cold chain and proofs. No price.

## Inbound links (must work)
`/lots/{sscc}`, `/orders/{orderId}`

## Outbound links
- Consumer page for each lot (useful for the buyer's retail team)
- Gov explorer (every tx)
- FPO console `/orders/{id}`
- **Never** the bank portal or farmer data.

## Golden-journey steps you own
Steps 7 (buyer side), 8 (receive + accept). Write Playwright tests for both, plus the two negative cases: a price hash mismatch and a unilateral custody attempt.
