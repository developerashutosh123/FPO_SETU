# Prompt 06: Governance Dashboard + Ledger Explorer (Next.js, Vercel)

> Kickoff: `cd 06-gov-dashboard`, then `claude --add-dir ../shared`, then send:
> `Read ../shared/CONTRACT.md, ../shared/PORTAL_COMMON.md, ../shared/contract.ts and this PROMPT.md fully. Start Phase P0. Stop at every CHECKPOINT.`
> **Prerequisite:** the 00-core-ledger chat has finished Phase C1.

## Your role
This is the monitoring surface for the FPO board and for NABARD/SFAC/State-type observers. It answers: **"Is the FPO healthy, is distribution fair, and is the record trustworthy?"**

It also hosts the **Ledger Explorer**, the page opened in front of the professor to prove that Fabric is real. Every other portal links its tx IDs here.

Users:
- `observer.gov` (`RegulatorOrgMSP`): read-only; on trace + finance channels, **not** trade.
- `board.fpo` (`FpoOrgMSP`, role `board`).
- The Ledger Explorer and the pilot-design pages are **public** (no login), so the professor can open any proof link directly.

## Stack
- Next.js (latest stable, App Router), TypeScript strict, Tailwind with the shared tokens (`data-portal="gov"`).
- Recharts or ECharts, `react-leaflet` with OSM tiles, TanStack Table.

## Design brief
- A calm **monitoring dashboard**: neutral greys and one teal accent, dark mode, dense but legible, every chart titled with a full sentence ("Members are paid within 5 days of sale on median").
- No hero images. One real landscape photo is allowed on the public pilot-design page only.
- **Every KPI card has a "trace to lots" click-through** that lists the lots and transactions behind the number.

## Pages (observer/board, behind login)
1. **Overview** (`/`): KPI cards from `GET /kpis`, defined in contract Section 9.5. Each card shows value, target, numerator/denominator, "computed from" and as-of time. Below the cards: the **Month-12 go/no-go gate tracker**, 4 criteria each marked met / not met, with evidence links.
2. **Villages** (`/villages`): a map of the 3 pilot + 2 comparison villages from `GET /villages` (coordinates come from there; never hardcode them), with members, lots and volume per village. Pilot vs comparison is clearly marked.
3. **Prices** (`/prices`): the FPO's realised price by week vs the AGMARKNET modal price (Medinipur (West), Ghatal, Garbeta) for potato/vegetables, and paddy vs MSP. For the observer, realised price appears **only as the premium %** computed by the gateway, never absolute order prices, because the observer is not on trade-channel. State this on the page.
4. **Distribution fairness** (`/patronage`): a Lorenz curve and Gini of net payout per kg across members, women vs men, village by village. Explain the method in one paragraph.
5. **Finance** (`/finance`): pledge-finance reach, value facilitated, active liens by facility, and **double-financing attempts blocked**. No loan terms (the observer is not in `loanTermsPDC`).
6. **Integrity** (`/integrity`): audit divergence rate over time, attestor reputation, cold-chain breach rate, and scan anomalies from consumer reports.
7. **Compliance calendar** (`/compliance`): statutory filing calendar for a Farmer Producer Company (ROC annual filings, GST returns, AGM). Research the due dates from MCA/CBIC sources and cite each one. If unsure, say "verify with the CA".
8. **Network** (`/network`): `GET /ledger/status`, showing each peer (org, up/down, height per channel), the orderers with the Raft leader marked, and channel membership as a matrix of orgs × channels. Add a short explanation of why the Regulator has no seat on trade-channel.
9. **Lot view** (`/lots/[sscc]`): the observer's view of a lot: timeline, proofs, lien status, price hash only.

## Public pages (no login)
10. **Ledger Explorer** (`/ledger`):
    - channel selector;
    - latest blocks per channel (number, time, tx count, data hash, previous hash), auto-updating via SSE;
    - search box (tx ID, SSCC, e-NWR, order ID).
11. **Block** (`/ledger/block/[channel]/[n]`): header fields, a chained-hash visual (previous → this → next), and the tx list.
12. **Transaction** (`/ledger/tx/[txId]`):
    - channel, chaincode, function, block, validation code, timestamp, creator MSP;
    - **endorsing orgs as badges**;
    - read/write-set **keys** (never values);
    - a one-line plain-English summary ("FPO and Bank jointly recorded a lien on ENWR-NERL-2026-004211").
    - This page must load fast and look authoritative: it is what every proof link in the system lands on.
    - In `index-only` mode, state clearly "Served from the indexed copy of the ledger; live peer is offline".
13. **Pilot design** (`/pilot`), the end-term evidence page:
    - the Kharagpur cluster rationale;
    - the evidence table from contract Section 4.2 with citations;
    - villages and roles;
    - the **proposed partner FPOs** from contract Section 4.3, each with a **verification status** field ("MCA status: to be verified") that the human updates;
    - the difference-in-differences design;
    - KPIs and targets.
    - All figures are dated and cited. Label 2013-14 data as such.

## Inbound links (must work)
`/ledger/tx/{txId}`, `/ledger/block/{channel}/{n}`, `/lots/{sscc}`. Every portal depends on these, so test them first.

## Outbound links
FPO console lot pages (board role only). The observer gets no links into the bank or buyer portals.

## Golden-journey steps you own
Verification across all steps: for each tx created in steps 1-9, the explorer shows the right channel and endorsers.

Playwright tests:
- the observer cannot see any price (assert that no "₹" appears in order sections);
- explorer search works for all 4 ID types;
- the KPI trace-through lists real lots.
