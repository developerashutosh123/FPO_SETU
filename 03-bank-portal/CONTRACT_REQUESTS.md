# Contract requests from 03-bank-portal

Raised 04-11-2026. None blocks the pages built so far.

1. **`Proof` carries no function name.** The loan history and the proof drawer need to say "Disbursed", "Repaid", "Lien released" for each tx. Today the drawer fetches `GET /ledger/tx/:id` per proof to read `fn`. Please add an optional `fn?: string` (or `event?: LedgerEventName`) to `Proof`.
2. **Loan terms for a lien that is not mine.** `Collateral.lien` has `lienId` but no `loanId`. The portal derives the loan ID by swapping the `LIEN-` prefix for `LN-` (contract 3.1: same number). Please add `loanId?: string` to `Collateral['lien']` so this is not an inference.
3. **Price series link.** PROMPT.md asks the valuation block to link to the price series chart. There is no portal route for it (06 has no `/prices` yet). Not built; please tell us the target URL when 06 has one.
