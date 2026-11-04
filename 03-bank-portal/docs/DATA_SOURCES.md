# Data sources (03-bank-portal)

| Figure or term | Where it comes from | Status |
|---|---|---|
| Quantity, price basis, haircut, LTV 70%, assessed value, eligible loan, lien status, loan amounts and terms | `GET /collateral`, `GET /loans` on the gateway (ledger index and `loanTermsPDC`) | Never computed in the browser. The page shows the formula next to the API's numbers. |
| Mock fixtures (price basis, haircut, tenure, rate) | `shared/fixtures/collateral.json` | Placeholders, labelled `FIXTURE-PLACEHOLDER` by the fixture itself. Not market data. |
| CGS-NPF eligibility flag and reason | `cgsNpfEligible`, `cgsNpfReason` from `GET /collateral` | Shown as returned. |

## CGS-NPF (Credit Guarantee Scheme for e-NWR based Pledge Financing)

What the tooltip says, and why it says no more. Looked up 04-11-2026:

- **Confirmed structure:** the scheme is administered through NCGTC (National Credit Guarantee Trustee Company Ltd); eligible lenders register on the NCGTC portal and apply for cover there. Source: WDRA, "FAQ on Credit Guarantee Scheme", https://wdra.gov.in/web/wdra/faq-cgs (the page was truncated when read, so only the structure above was taken from it).
- **Not verified, so not shown anywhere in the UI:** guarantee cover percentages (secondary sources give 85% / 80% / 75% with different loan-size breakpoints), guarantee fees, claim timelines, corpus size. Only trade-press and exam-prep sites were retrievable for these.
- **To finish:** read the NCGTC scheme document or the Gazette notification (G.S.R. 746(E) as cited by secondary sources, not yet opened) and the PIB launch release, then replace the tooltip text in `CollateralView.tsx` (`CGS_CITATION`) with the exact terms and their citation.
- Whether potato is notified for cold-storage e-NWR under WDRA is also unverified (the fixture says so); the portal repeats the API's reason and makes no claim of its own.
