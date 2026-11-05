# Contract requests from 04-buyer-portal

Raised 05-11-2026.

1. **The "accept as the FPO" demo cannot reach the chaincode rule.** PROMPT.md asks the demo button to show `ERR_UNILATERAL_CUSTODY`. `gateway/src/app.ts` rejects any caller whose role is not in the endpoint's `roles` first, and `POST /lots/{sscc}/custody/accept` allows only `buyer_manager`, so an FPO identity gets `ERR_FORBIDDEN_ROLE` and `AcceptTransfer` never runs. The mock behaves the same. The portal shows whichever code comes back and explains both. To show the chaincode's own refusal live, either let the gateway forward `custody/accept` from `operator`/`ceo` to the chaincode (demo mode only), or tell us a different route.
2. **No endpoint serves document bytes.** `integrity.docs` gives name, sha256 and `viewable`, but nothing returns the bytes, so "Re-verify" asks the buyer to pick their own copy of the file and hashes it in the browser. If the gateway can serve `GET /lots/{sscc}/documents/{name}` to viewable roles, the button can fetch it instead.
3. **Cold-chain breaches are not per digest.** `LotPassport.coldChain.digests[]` has `window`, `avgC` and `proof` only; `breaches` is a lot-level count. The chart cannot place breach markers. Please add `minC`, `maxC` and `breaches` to each digest (they are already in `ConditionDigestRequest`).
4. **`Proof` carries no function name** (same as the bank's request 1). The order page cannot label which proof is the price step and which is the quality acceptance.
5. **`lot.proofs` includes finance-channel transactions for the buyer**, who is not a member of finance-channel. The buyer portal lists them as returned (tx ID and block only, linked to the Gov explorer). Please confirm that is intended, or filter them server-side for `buyer_manager`.
