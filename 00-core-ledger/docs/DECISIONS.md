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
Contract 1.0.2 adds `LedgerStatus.orderers[].leaderOf` because the leader is per channel. The earlier sentence "`raftLeader` is the single orderer" no longer applies. Orderer limit 384 MiB each. `make rebuild` still takes about 26 s.

## D10. Answers of 15-10-2026
- Git identity set to Ashutosh Palai; my three commits were re-authored to it; Windows Git Credential Manager is the credential helper; first push went through.
- Golgram and Gopalpur stay at the block centre (`BLOCK_CENTROID`), labelled, until the human supplies coordinates.
- Month-12 gate criteria received (CONTRACT.md Section 9.5): 60% of members with at least one lot; first-mile audit divergence below 5%; at least one lender disbursed against a platform-evidenced e-NWR; at least one buyer paid a measurable premium on a verified-origin consignment. The KPI returns `criteria[]`; the premium criterion needs the AGMARKNET series and reads `met: null` until real prices exist.
- Supabase and ngrok: the human adds them before C4 and C5.
