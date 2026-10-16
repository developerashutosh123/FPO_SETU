# Decisions (00-core-ledger)

Every deviation from the mid-term report or from PROMPT.md is recorded here.

## D1. Runtime: local WSL2 + Docker Desktop, not Codespaces (2026-10-16)
The human runs everything locally in WSL2 Ubuntu with Docker Desktop. PROMPT.md assumes a GitHub Codespace. Consequences:
- `.devcontainer/devcontainer.json` is still created (so Codespaces stays an option) but is not the active environment.
- `hostRequirements.memory: 16gb` in the devcontainer applies to Codespaces only. It does not apply to the local WSL2 setup.
- Public exposure of the gateway (port 8080) uses a tunnel from WSL instead of a Codespaces forwarded port. See open question Q3 in HUMAN_STEPS.md.
- "Codespace sleeps" becomes "the PC is off or WSL is stopped". The read-only fallback API (Phase C5) matters for that reason.
- Postgres stays hosted outside the machine (Supabase or Neon) so that the read-only API survives the PC being off.

## D2. Fabric profile: FULL (3 Raft orderers) (decided 15-10-2026; started as LITE)
Measured on the human's machine:

| Item | Value |
|---|---|
| Windows host RAM | 15.7 GB |
| WSL2 VM RAM (`free -h`) | 7.6 GiB total, 6.3 GiB available at idle, 2.0 GiB swap |
| Docker Desktop (WSL2 backend) | sees the same 7.6 GiB (8,161,746,944 bytes) and 16 CPUs |
| CPUs | 16 logical |
| Disk | about 954 GB free |
| Idle WSL usage | about 1.3 GiB |

Choice: **lite** = 1 Raft orderer, 4 peers (LevelDB), 5 CAs.
Reasons:
- WSL2 defaults to half of host RAM, so the stack has about 6 GiB, not 16.
- The same 6 GiB must also hold the Go toolchain for chaincode builds, the Node gateway, a test Postgres container and Claude Code itself.
- Chaincode runs in its own containers: lot-lifecycle on 4 peers, pledge-lien on 3, order-settlement on 2. That is up to 9 extra containers.
- Both profiles use the same channels, chaincodes, policies and PDCs. Only the orderer count differs. A 1-node Raft cluster has no fault tolerance, and the explorer must say so honestly (`raftLeader` is the single orderer).

Upgrade path: the full profile (3 orderers) needs about 2 extra orderer containers. If `docker stats` at CHECKPOINT C2 shows the lite stack well under 3 GiB, we can switch to full. Alternatively the human can raise the WSL limit with `C:\Users\ashut\.wslconfig` (`[wsl2] memory=11GB`, then `wsl --shutdown`). The host has 15.7 GB, so 11 GB leaves Windows about 4.7 GB. This is a human decision. The stack will be measured, not guessed, at C2.

**Measured at C2 (15-10-2026, lite stack idle, no chaincode containers yet):**

| Container | Memory | Limit set |
|---|---|---|
| 4 peers | 50 to 56 MiB each | 640 MiB |
| orderer | 28 MiB | 384 MiB |
| 5 CAs | about 10 MiB each | 128 MiB |
| **Total (10 containers)** | **288 MiB** | |

The whole network uses about 4% of the 7.6 GiB the WSL VM has. The chaincode containers (up to 9, Go, roughly 20 to 40 MiB each, to be measured at C3) and load will add to this, but the stack is nowhere near the 3 GiB threshold in the upgrade note above. Two extra orderers would cost roughly 60 MiB. So the RAM argument for the lite profile no longer holds; only the human's decision (Q4) keeps it. Switching gives a real 3-node Raft cluster, a visible leader failover in the professor demo and an honest "fault tolerant" label in the explorer. Cost: change `docker-compose.yaml`, `configtx.yaml` consenters and `enroll.sh` for two more orderer identities, then `make rebuild` (about 25 s). Recommended, but not done without the human's say-so.

Time to build from nothing: `make rebuild` takes 24 s for the network (images already pulled). Restart after `make down`: 6 to 17 s, heights and block hashes unchanged.

## D3. Human answers to the C0 questions (2026-10-15)
- **Q1 Postgres:** Supabase, Mumbai region. Needs `DATABASE_URL` (pooled) and `DIRECT_URL` before C4.
- **Q2 Mid-term documents:** not provided, proceed without them. Consequence: the four Month-12 gate criteria (contract Section 9.5) are unknown, so the `month12_gate` KPI was `null` until the human supplied the criteria (D10). No figure from the mid-term report is used anywhere.
- **Q3 Public gateway URL:** ngrok free static domain.
- **Q4 Fabric profile:** keep the lite profile (D2).
- **Q5 Git:** commit locally and push to `origin`. `.devcontainer/` at the repo root is included in commits. No git identity was configured on this machine, so commits use the GitHub handle from the remote URL (`developerashutosh123`) and the account e-mail; the human can run `git commit --amend --reset-author` after setting their own.

## D4. Contract 1.0.1 (C1)
Additive. The full list is in the `CONTRACT.md` changelog. Reasons worth recording here:
- OpenAPI "with types matching `contract.ts`" needed a named request and response type for every endpoint, so those were added to `contract.ts`. `openapi.yaml` is generated from `mock/endpoints.mjs` plus the types, so it cannot drift; tests also compare the endpoint table with `CONTRACT.md` Section 8.
- `canonicalJson` now throws instead of coercing NaN, Infinity and `undefined` array items to `null`. A signer and a verifier must never disagree about bytes. Go caveats (HTML escaping, U+2028/2029) are in `testvectors/canonical-json.json`.
- Signature wire format fixed as raw `r||s` hex (Web Crypto output) and public keys as uncompressed SEC1 hex, so Expo, browsers and Go agree.
- Endpoints that deep links need but the contract lacked: `GET /loans/:loanId`, `GET /orders/:orderId`, `GET /storage/deposits`, `GET /patronage/runs`.
- The contract had no login for the operator role although steps 4 and 8 need one. Added `debasis.ops`.

## D5. Lot status lives on trace-channel, so finance and trade transactions need mirror calls
Contract Section 3.2 puts LISTED, SOLD, IN_STORAGE, PLEDGED and SETTLED in the lot state, but their causes (deposit, lien, order, settlement) happen on finance-channel and trade-channel, which cannot write trace-channel state. `markLien` also reads the lot status across channels and `ERR_LOT_PLEDGED` is enforced in `lot-lifecycle`. So after each such transaction commits, the gateway submits a follow-up `lot-lifecycle` call (`setInStorage`, `setPledged`, `setListed`, `setSold`, `setSettled`), which emits the new event `LotStatusChanged`. If a mirror call fails, the gateway reports it and the indexer shows the gap; it is never hidden. Role checks: FpoOrgMSP, `role=warehouse` for `setInStorage` and `setPledged` (as PROMPT.md C3 specifies), `role=ceo` for the others.

## D6. Patronage reconciliation rule
PROMPT.md C3 says `sum(net) + fpoMargin == settlementAmount`. That only holds if hamali, market fee, commission, transport, cold-storage rent and loan recovery are zero. The rule implemented is: `sum(gross) == settlementAmount`, per line `gross == net + sum(deductions)`, so `sum(net) + sum(all deductions, FPO_MARGIN included) == settlementAmount`, within INR 1 in total. Fixtures reconcile exactly.

## D7. Salt for the private price hash
`priceHash = sha256Hex(canonicalJson({orderId, pricePerQtl, salt}))`. When a portal sends no salt, the gateway derives it as the first 32 hex chars of HMAC-SHA256(`PRICE_SALT_SECRET`, orderId). Without a secret salt, the regulator could brute-force a price from the public hash because the price space is small. `PRICE_SALT_SECRET` joins `JWT_SECRET` and `FARMER_TOKEN_SECRET` in the gitignored `.env`.

## D8. Fixtures are honest about what is not real
- Villages: Changual, Sankoa and Duan resolve to mapped landmarks in the right block (`precision: LANDMARK`). **Golgram and Gopalpur (Keshiary) are not in OpenStreetMap** (Nominatim and two Overpass mirrors, name searches in the district bounding box, returned nothing; Gopalpur exists in four other WB districts, none in Paschim Medinipur). They carry the block centre with `precision: BLOCK_CENTROID` and a note. Nothing was guessed. The human must supply coordinates or LGD codes (HUMAN_STEPS.md).
- Prices: no AGMARKNET key exists yet, so `prices.json` holds seven round placeholder rows labelled `FIXTURE-PLACEHOLDER`. Real series arrive in C4. Deduction rates, haircut, loan rate, quality readings and diary doses in fixtures are placeholders too (stated in each file's `_meta`).
- Paddy MSP rows (2,369 / 2,389 for KMS 2025-26; 2,441 / 2,461 for KMS 2026-27) are confirmed from news reports of the CCEA decisions. The PIB press-release URLs are still to be fetched and cited in C4.
- `ledger.json` shows 3 orderers with per-channel leaders, as on the running full-profile network (D9).

## D9. Full 3-orderer profile adopted (15-10-2026)
After the C2 measurement (288 MiB for the lite network, D2) the human chose the full profile. Done: 3 orderers (`orderer1..3.setu.local`), 3 consenters in `configtx.yaml`, each orderer joined to every channel through its own osnadmin endpoint. Verified on the running network:
- all three orderers report `consenter`, `active`, identical heights on all three channels;
- Raft leaders are per channel (a run had orderer3 leading trace and finance, orderer1 leading trade); `consensus_etcdraft_cluster_size` is 3;
- failover: stopping orderer3 (leader of two channels) moved leadership to orderer1 (trace) and orderer2 (finance) within 8 s; orderer3 rejoined at the same height after restart.
Contract 1.0.2 adds `LedgerStatus.orderers[].leaderOf` because the leader is per channel. The earlier sentence "`raftLeader` is the single orderer" no longer applies. Orderer limit 384 MiB each; measured sizes are in D16. `make rebuild` still takes about 26 s.

## D10. Answers of 15-10-2026
- Git identity set to Ashutosh Palai; my three commits were re-authored to it; Windows Git Credential Manager is the credential helper; first push went through.
- Golgram and Gopalpur stay at the block centre (`BLOCK_CENTROID`), labelled, until the human supplies coordinates.
- Month-12 gate criteria received (CONTRACT.md Section 9.5): 60% of members with at least one lot; first-mile audit divergence below 5%; at least one lender disbursed against a platform-evidenced e-NWR; at least one buyer paid a measurable premium on a verified-origin consignment. The KPI returns `criteria[]`; the premium criterion needs the AGMARKNET series and reads `met: null` until real prices exist.
- Supabase and ngrok: the human adds them before C4 and C5.

## D11. Chaincode events: one per transaction
Fabric keeps only the last `SetEvent` of a transaction. CONTRACT.md lists F1 as emitting `FarmerOnboarded, PlotRegistered, ConsentGranted` and F3 as `LotGraded, QualityCredentialIssued`. Such functions emit one event named after the first and list the others in the payload field `alsoEmitted`; the indexer (C4) expands them into separate `ledger_events` rows and SSE messages. The first step of `AgreePrice` and `RegisterDevice` emit nothing: they change no public state except a proposal hash or an infrastructure key. Blocks also carry the events of transactions that later fail validation (e.g. `ENDORSEMENT_POLICY_FAILURE`): the indexer must read events through the Gateway `getChaincodeEvents`, which delivers committed VALID transactions only, never by scanning raw blocks. Checked on the live chain: 80 events from 18 event types decoded from real blocks contain no PII, price, amount or salt.

## D12. F7 puts per-member amounts on trace-channel (the trade-off the prompt asks to explain)
`DistributePatronage` stores each member's `kg`, `gross`, `deductions` and `net` in `PATRONAGE_<runId>` on trace-channel, because the reconciliation rule must be checkable by the chain and a member's statement needs an on-chain proof of their own line. Consequence, stated plainly: everyone on trace-channel (Bank, Buyer, Regulator included) can read these amounts, and `gross / kg` of a line is the price per kilogram of that lot, exactly, not approximately. No field is named price and the event carries no amount, but the number is derivable. The Buyer knows the price anyway. The Bank and the Regulator learn it for lots that reach F7. Accepted for the prototype because the alternative (hash-only vectors verified from transient data) leaves the reconciliation checkable only by whoever endorses, and the demo needs the farmer statement proof. The portals still hide it: the gateway filters by role (CONTRACT.md 9.4), so the Observer view shows equity metrics only. If this is not acceptable, the alternative is: DistributePatronage receives the lines in the transient map, enforces the same rule, and stores only a salted hash per line plus the member `net`; the farmer verifies their own line with the salt from the statement. About one day of work; say so and I will do it before C4.

## D13. Functions beyond the contract's list
Needed for the flows to work, all role-checked and unit-tested: `RegisterDevice` (F3 verifies against registered device keys), `RegisterDeviceKey`, the status mirrors of D5 (`SetInStorage`, `SetPledged`, `SetListed`, `SetSold`, `RecordQualityOutcome`, `SetSettled`), and read functions `GetLoanTerms`, `GetLoanTermsHash`, `GetOrderPrice`, `GetOrderPriceHash`. Order statuses in `order-settlement` are OPEN, PRICE_AGREED, DELIVERED, SETTLED; the contract's `IN_TRANSIT` order status is derived by the indexer from the lots' IN_TRANSIT status. `RecordSettlement` requires the amount to equal the agreed price times the delivered weight (within INR 1 per lot), so the settlement cannot drift from the private price. `AcceptQuality` requires every lot of the order to be DELIVERED on trace-channel, read through a query-only cross-channel call. Both `pledge-lien` and `order-settlement` read lots from trace-channel this way; the peers of both orgs are on trace-channel with `lot-lifecycle` installed.

## D14. Two bugs that only show on a real peer, and the tests that now catch them
`contractapi` builds a JSON schema from every returned Go type and rejects real answers that do not fit it. The first deployment crashed at start-up (`*bool` field) and then failed every `GetLot` (`json.RawMessage` fields, `omitempty` keys, nil slices). None of this appears when methods are called directly in unit tests. Fixed in the types and guarded by `common.CheckSchemaSafe` (pointers, maps, raw bytes, `omitempty`), a `contractapi.NewChaincode` build test per chaincode, and null-free serialisation tests. A third bug was in the smoke script itself (transaction IDs printed without the hex digit `d`, found because the "quotes the first lien tx" check failed); fixed and re-run.

## D15. Chaincode packaging and versions
`deployCC.sh` vendors the module, labels the package `<name>_1.0-<12 hex of the source digest>`, installs on the peers that need it (lot-lifecycle 4, pledge-lien 3, order-settlement 2), approves for every channel org, commits, and skips unchanged chaincode (verified: a second run says "nothing to do"). Changed source gets a new package and the next sequence number; the `make smoke` runs above are at sequence 4. Chaincode images are built by the peer with `fabric-ccenv:2.5.16` (Go 1.26.4 in that image; `go.mod` says 1.21).

## D16. Measured memory with the full stack and chaincode (15-10-2026)
12 containers (5 CAs, 3 orderers, 4 peers) 857 MiB; 9 chaincode containers 92 MiB (7 to 13 MiB each); total 949 MiB of 7.6 GiB. Peers grew from about 50 MiB idle to 160 to 430 MiB after the chaincode builds and smoke runs; the 640 MiB limit was too close, so peers now have 1 GiB. `make down` then `make resume` twice left the chaincode working and the smoke test green. `peer channel join` after a restart can report "already exists" before the peer lists its channels; `channels.sh` now treats that as success.

## D17. A pledged lot can be listed and sold; only dispatch waits for the lien (corrects D5 and the C3 chaincode)
CONTRACT.md Section 6 marks the lien at step 6, lists and sells the lot at step 7 and releases the lien at step 8, and Section 3.2 only says a PLEDGED lot cannot move to IN_TRANSIT until its lien is released. The C3 chaincode refused to list a pledged lot, so the contract's own journey could not run; it surfaced while writing the e2e. Fixed in the chaincode: PLEDGED may go to LISTED; the lot keeps its `lienRef`; `ProposeTransfer` fails with `ERR_LOT_PLEDGED` while `lienRef` is set; `SetPledged(false)` on a LISTED or SOLD lot clears the reference and keeps the status; `CreateOrder` accepts pledged lots. The catalogue still never shows a pledged lot (the buyer finds only unpledged lots), and a buyer cannot open a PLEDGED lot by SSCC. The smoke test and the e2e now follow the contract's order of events.

## D18. Gateway is Node and Fastify, not FastAPI
Fabric has no official Python gateway SDK; the official `@hyperledger/fabric-gateway` is Node, Go and Java. The mid-term report's FastAPI is replaced by Fastify with Zod validation, Drizzle ORM and the shared OpenAPI document served at `/docs`.

## D19. Gateway copies of private-collection data, and what the index may hold
Loan terms and agreed prices are authoritative in `loanTermsPDC` and `tradePricePDC`. The gateway (FPO, Bank and Buyer side) also keeps a copy in Postgres (`loan_terms`, `trade_prices`) so it can serve lists and statements and does not read the collection on every request; it is a cache that can be rebuilt from the collection, and the price route reads the collection itself through the caller's own peer, so the peer enforces membership. The read-only API can never serve a price or loan terms (the index does not hold them for it); it serves hashes and statuses.

## D20. Rates policy: no guessing
Deduction rates that could not be sourced (cold-storage rent, market fee, commission, hamali, transport) are `null` in `config/rates.json`, and `computeDeductions` refuses with ERR_VALIDATION naming them. FPO margin (2%) and the lender haircuts are policy parameters marked ASSUMPTION. See `docs/DATA_SOURCES.md`. The human decides whether to supply sourced values or approve labelled indicative ones.

## D21. Honest numbers in the index
`residueTested` is `false` everywhere because no residue-test data exists. Reputation scores exist only for attestors with at least one completed re-inspection. A KPI with no data is `null` with the reason. The seeded re-inspections are simulated and labelled as such. The seed does not fabricate statement-view telemetry beyond the one statement Anima opens.

## D22. Errors and status codes
HTTP status per error code is `ERROR_HTTP_STATUS` in `contract.ts`. The contract has no internal-error code, so an unexpected server fault answers HTTP 500 with `ERR_INVALID_STATE` and a generic message, and is logged. `GET /health` answers 503 with `ERR_LEDGER_UNAVAILABLE` while any channel is unreachable. A write whose follow-up status call fails still returns the primary receipt, adds the header `X-Mirror-Pending: <kind>`, and the follow-up is retried by the worker until it lands (`mirror_queue`).

## D23. Things the e2e found that unit tests could not
- After `ProposeTransfer`, every write to that lot (including a cold-chain digest) needs FPO and Buyer endorsement (state-based policy), so the gateway uses the buyer-inclusive endorser set for digests.
- A hijacked SSE connection kept `app.close()` and the indexer's block stream waiting; both now end on shutdown.
- An indexer started on a fresh database replays the whole chain, which is right for production and wrong for a repeatable test: the e2e starts it at the current height.
- The ledger keeps lots between runs, so e2e counters start at random offsets.

## D24. CEO and operator may read crop diaries (resolved in contract 1.0.3)
The endpoint list of Section 8 allowed only the member and the VLE, while the 9.4 table ticks "FPO CEO/op" for crop diary detail. On 16-10-2026 the team chose the table: `GET /diary/inputs` is now open to `ceo` and `operator` (farmerId required), contract 1.0.3. The Bank, the Buyer, the Observer and the board still get 403. The role matrix and the visibility tests assert it. Portal 02 is the one that can use it.
