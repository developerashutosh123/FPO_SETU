# Contract requests from 01-farmer-app

Written per PORTAL_COMMON.md section F. Nothing under `../shared/` was edited. Both items are worked around in the app, as described.

## 1. A member cannot list their own lots

**Problem.** The farmer's home screen is "my lots" (status chip, grade, kg, net credit), but `GET /lots` is open only to `vle, ceo, operator, warehouse, board, observer` (CONTRACT.md section 8; `listLots` in `shared/mock/endpoints.mjs`; the mock answers a member with 403). A member can read one lot by SSCC (`GET /lots/:sscc`) but cannot discover the SSCCs. So lots that are neither waiting for a signature nor settled (graded, in storage, pledged, listed, in transit) cannot appear on the home screen. The "Pledged to bank" notice (CONTRACT.md step 6, "01 Anima sees pledged") is reachable only by deep link today.

**Request.** Allow `member` on `GET /lots`, scoped by the gateway to the caller's own farmer token (ignore `farmerId`). Same `Page<LotListItem>` shape, no new fields. Add `member` to `listLots` roles in `endpoints.mjs` and a fixture example for Anima.

**App behaviour now.** `loadMyLots()` calls `GET /lots` once; on `ERR_FORBIDDEN_ROLE` it remembers that and builds the list from `GET /lots/drafts/pending` plus `GET /statements/me` (each statement lot enriched from `GET /lots/:sscc`). When the gateway allows members, the app switches to the real list with no code change, and the footnote "showing lots that have a draft or a payment statement" disappears.

## 2. No way to reject a lot draft

**Problem.** PROMPT.md asks for a "This is not right" button that rejects the draft. The contract has no endpoint for it: drafts can only be signed (`POST /lots/:sscc/farmer-sign`).

**Request.** `POST /lots/drafts/:sscc/reject` [member], body `{ reason?: string }`, returning 204. It deletes or marks the off-chain draft (the draft is not on the ledger, so no receipt). The VLE should see the rejection in their queue.

**App behaviour now.** The button writes nothing to the gateway. It stores the SSCC in this browser, stops listing the draft as "waiting", and tells the farmer in plain words that nothing was signed and the VLE should be told. The draft stays pending on the server until the endpoint exists.

## 3. Note, not a request: statement proofs are unlabelled

`StatementLine.proofs` and `LotPassport.proofs` are tx lists without the function name. The app resolves each tx with `GET /ledger/tx/:txId` and matches by chaincode function to label timeline steps. Up to about 25 calls per lot detail page, at most 6 at a time, cached. A `fn` field on `Proof` would remove them. Optional.
