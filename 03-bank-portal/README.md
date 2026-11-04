# 03 Bank underwriting portal

Academic prototype, RD61003, CRDIST, IIT Kharagpur, Group 7. Next.js 16, TypeScript strict, Tailwind 4. Console of the fictional Subarnarekha Krishi Bank. Vercel project name: `fposetu-bank` (not deployed yet).

**Built (against the mock):** `/collateral` (search by e-NWR or SSCC), `/collateral/[enwr]` (valuation with formula, ledger lien status and proof drawer, storage history, attestor scores, CGS-NPF flag, mark lien, duplicate-pledge demo), `/loans` and `/loans/[loanId]` (disburse, repay, release; receipts), `/login`.
**Not built:** portfolio `/`, evidence pack PDF, `/attestors`, `/about`, `/credits`, activity toasts, demo bar, Bengali/i18n, image, axe and Lighthouse passes, live integration and deploy.

```
pnpm install
pnpm mock          # terminal 1, :4010
pnpm dev           # terminal 2, :3003
```
Demo login (password `Setu@2026`): `arindam.bank`. See `CLAUDE.md`, `docs/TESTING.md`, `docs/DATA_SOURCES.md`, `HUMAN_STEPS.md`, `CONTRACT_REQUESTS.md`.
