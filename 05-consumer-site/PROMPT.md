# Prompt 05: Consumer Provenance Site (Next.js, public, Vercel)

> Kickoff: `cd 05-consumer-site`, then `claude --add-dir ../shared`, then send:
> `Read ../shared/CONTRACT.md, ../shared/PORTAL_COMMON.md, ../shared/contract.ts and this PROMPT.md fully. Start Phase P0. Stop at every CHECKPOINT.`
> **Prerequisite:** the 00-core-ledger chat has finished Phase C1.

## Your role
This is the public page that a QR code on a 5 kg potato pack or a vegetable tray resolves to. It answers: **"Where did this food come from, and can I check it myself?"**

- No login, and **no personal data ever**.
- It is the most-photographed surface in the demo, so it must look like a real product's provenance page.

## Stack
- Next.js (latest stable, App Router), TypeScript strict, Tailwind with the shared tokens (`data-portal="consumer"`).
- `next-intl` with **English, Bengali and Hindi**.
- `react-leaflet`, lazy-loaded.
- QR scan with `BarcodeDetector` + `html5-qrcode` fallback.
- SSR with `revalidate: 60` on provenance pages.

## Design brief
- **Editorial and photographic.** A warm paper background, generous type, and real photography of the Kharagpur/Medinipur countryside: paddy fields, potato harvest, rural Bengal landscapes (Wikimedia/Unsplash/Pexels, credited, Indian context only).
- Show the place honestly: the village name and block, not a romanticised story.
- Mobile-first: 360 px is the main design width.
- **Lighthouse mobile performance ≥ 90 and accessibility ≥ 95**, measured on the production URL.

## Routes
1. **`/`**:
   - A short, plain explanation: "Scan the code on your pack to see where it was grown, how it was handled, and the proof each party signed."
   - A **Scan** button (camera).
   - A manual SSCC entry field.
   - A 3-step illustration (farm → centre → you) built from real photos, not clip art.
2. **`/00/[sscc]`** (GS1 Digital Link; the QR encodes this), the provenance page:
   - **Hero:** commodity + variety, "Grown in Changual, Kharagpur-II block, Paschim Medinipur", harvest/unload date, grade.
   - **Checks** as three plain statements, each with a "how we know" expander:
     - "Residue tested" (credential reference);
     - "Safe-to-harvest interval respected" (the PHI flag; the diary itself is never shown);
     - "Kept cool all the way" (cold-chain continuity, with breaches stated honestly if any).
   - **Journey map:** village → collection centre → cold storage → dispatch → buyer city, with dates.
   - **"Verify it yourself"** expander, in plain language: "Four organisations keep copies of this record. Changing it would need several of them to collude." Below it: tx IDs, block numbers and endorsing org types, each linking to the Gov explorer.
   - **No GI claim.** Do not use the words "GI" or "geographical indication" anywhere.
   - If `ledgerMode=index-only`: a quiet note, "Showing the last verified record. Live ledger node is offline."
   - If the lot is `UNVERIFIABLE` after a DPDP erasure: "The grower has exercised their right to erase personal data. The handling record is intact; the link to the farm can no longer be verified."
3. **`/01/[gtin]/21/[serial]`**: resolves to the SSCC page if the gateway can map it; otherwise a designed not-found page.
4. **`/report`**: report a suspicious label (`POST /public/scan-report`), with optional approximate location (ask permission; city-level only).
5. **`/how-it-works`**: one page with the architecture explained for a consumer, at most 300 words plus one diagram.
6. **`/credits`** and **`/about`** (shared).

Add a **scan anomaly** case: if the API flags that the SSCC was scanned in many distant places, show "This code has been scanned in several cities. If your pack looks different from the photo, please report it."

## Inbound links (must work)
`/00/{sscc}`. This is what every QR label and every other portal's "consumer view" link points to.

## Outbound links
Gov explorer (proofs only). Nothing else; consumers never see the internal portals.

## Golden-journey steps you own
Step 10 (consumer scan). Playwright tests:
- a provenance page for a settled lot, a lot with a breach, and an erased farmer's lot;
- language switching;
- a 360 px viewport;
- no PII in the HTML. Assert that no seeded farmer name or phone number appears anywhere in the server-rendered HTML.
