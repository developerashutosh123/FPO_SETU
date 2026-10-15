# Prompt 03: Bank Underwriting Portal (Next.js, Vercel)

> Kickoff: `cd 03-bank-portal`, then `claude --add-dir ../shared`, then send:
> `Read ../shared/CONTRACT.md, ../shared/PORTAL_COMMON.md, ../shared/contract.ts and this PROMPT.md fully. Start Phase P0. Stop at every CHECKPOINT.`
> **Prerequisite:** the 00-core-ledger chat has finished Phase C1.

## Your role
This is the credit officer's console at **Subarnarekha Krishi Bank** (fictional). It answers: **"Is this collateral real, and is it already pledged?"**

The portal holds the strongest blockchain demo moment in the project: **a second lien on the same e-NWR is rejected by the chaincode, live.**

User: Arindam Ghosh (`arindam.bank`, role `credit_officer`, `BankOrgMSP`).

## Stack
- Next.js (latest stable, App Router), TypeScript strict, Tailwind with the shared tokens (`data-portal="bank"`).
- TanStack Table, Recharts.
- `@react-pdf/renderer` for evidence packs.

## Design brief
- Looks like a sober **loan-origination / core-banking console**: dense tabular layout, navy and steel, tabular numerals, a right-aligned money column, precise labels.
- No photos inside the app. One restrained image on the login screen at most: a warehouse/cold-storage exterior in West Bengal from Wikimedia/Unsplash/Pexels, credited.
- Every banking term has a tooltip (haircut, LTV, e-NWR, lien, CGS-NPF).
- Must look nothing like a startup landing page.

## Pages
1. **Portfolio** (`/`): active liens, total exposure, maturities in the next 30 days, repayments due, and a **double-financing attempts blocked** counter. Each counter is computed from `/loans` and `/ledger/search`, never hardcoded.
2. **Collateral search** (`/collateral`): search by e-NWR or SSCC. A results table shows commodity, facility, quantity in quintals, lien status and proof.
3. **Collateral view** (`/collateral/[enwr]`), the core page:
   - **Lot summary.** The bank sees **no farmer name and no crop diary** (contract Section 9.4). Show a small note: "Personal data and cultivation records are not shared with lenders."
   - **Valuation block:**
     - quantity (qtl) × modal price, with the exact `priceBasis` (market, date, source) and a link to the series chart;
     - haircut %;
     - LTV 70%;
     - eligible loan amount.
     - Show the formula next to the numbers.
   - **Lien status from the ledger**, with the proof drawer.
   - **Storage condition history** (cold-storage temperature digests for potato lots).
   - **Attestor reputation** of the operator and devices that graded the lot.
   - **CGS-NPF eligibility flag with its reason.** Research the current scheme terms from NCGTC / PIB, cite them in `docs/DATA_SOURCES.md`, and show the citation in the tooltip. Do not invent terms.
   - Badge: "e-NWR issued via NERL (simulated adapter)".
4. **Mark lien (F5)** (modal on the collateral view):
   - Fields: loan ID (generated), amount (≤ eligible), tenure, rate.
   - A note: "Loan terms are stored privately between the bank and the FPO."
   - Submit, then show the receipt with endorsers **FpoOrgMSP + BankOrgMSP** as badges and a link to the Gov explorer.
   - **Second attempt:** a visible "Attempt duplicate pledge (demo)" button, shown only when `NEXT_PUBLIC_DEMO_MODE=true`, submits a second lien. It must display the chaincode's `ERR_DOUBLE_FINANCING` exactly as returned, with the tx ID of the existing lien and a plain-language explanation: "The ledger already records an active lien on this receipt. No bank on this network can lend against it again until it is released."
5. **Loans** (`/loans`, `/loans/[loanId]`): disburse, record repayment, release the lien. Each action shows its receipt. Releasing unlocks dispatch in the FPO console; link there.
6. **Evidence pack** (`/collateral/[enwr]/evidence`): a downloadable PDF with the valuation, lien proof, storage history, every tx ID with block number and endorsers, and a QR to the Gov explorer. This is the "no site visit per loan" artefact.
7. **Attestors** (`/attestors`): reputation table for operators and devices, with audit-divergence history.

## Inbound links (must work)
`/collateral/{enwr}`, `/loans/{loanId}`

## Outbound links
- Gov explorer (every tx, `/lots/{sscc}`)
- FPO console `/collateral/{enwr}`
- **Never** the buyer portal or the farmer statement.

## Golden-journey steps you own
Step 6 (lien + disbursement + rejected duplicate) and step 8's precondition (repay + release). Write Playwright tests for both, plus a role test: the bank calling `/diary/inputs` must get `ERR_FORBIDDEN_ROLE`, and the UI must not offer it.
