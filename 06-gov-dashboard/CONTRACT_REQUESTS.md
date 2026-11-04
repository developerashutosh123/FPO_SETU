# Contract requests from 06-gov-dashboard

Raised 04-11-2026. Not blocking: the pages below degrade honestly until these exist.

1. **Search hits for e-NWR and order IDs carry no target.** `GET /ledger/search` returns `{kind, id, channel, label}`. For `enwr` and `order` the explorer has nothing to open: no `txId` and no `sscc`. Please add `txIds?: string[]` (or at least `sscc?: string`) to `SearchHit`. Until then those hits show their channel and link to that channel's latest blocks.
2. **KPI trace-through.** PROMPT.md asks every KPI card for a "trace to lots" click-through listing the lots and transactions behind the number. No endpoint returns them. Please add either `Kpi.lots?: {sscc, proof}[]` or `GET /kpis/{key}/lots`. Not built yet.
3. **Month-12 gate evidence links.** `KpiCriterion.evidence` is free text. For "evidence links" we need `evidence` to carry a `proofs?: Proof[]` or a route. Not built yet.
4. **`BlockDetail` has no `blockHash`.** In Fabric `previousHash` of block n+1 is the header hash of block n, not its `dataHash`. `TxDetail.blockHash` has it, `BlockDetail` does not, so the chained-hash visual cannot show "n+1 points at n" as a check. Please add `blockHash` to `BlockSummary`/`BlockDetail`.
