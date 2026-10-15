# FPO-SETU Shared Contract (v1.0.2)

**Every Claude Code chat reads this file first.** It is the single source of truth that keeps the seven folders consistent. Only the **00-core-ledger** chat may change it, and every change must bump `CONTRACT_VERSION` in `shared/contract.ts` and add a line to the changelog at the bottom of this file. The portal chats never edit `shared/`. To request a change, a portal chat writes the request in its own `CONTRACT_REQUESTS.md` and tells the human.

---

## 1. What we are building (one paragraph)

FPO-SETU is an academic prototype for **RD61003, Financial Technology for Rural and Agribusiness Development, CRDIST, IIT Kharagpur, Autumn 2026-27** (Group 7, SupplyChainFinTech; instructor Dr. P. K. Singh). It is a thin trust layer: a **Hyperledger Fabric v2.5** permissioned ledger shared by a Farmer Producer Organisation (FPO), a bank, a buyer and a regulator-observer. The ledger records the 7 trust-critical events in the life of a produce lot (F1-F7). Six role-specific surfaces read and write that **one** record through **one** gateway API:

| # | Folder | Surface | Users | Hosting |
|---|---|---|---|---|
| 00 | `00-core-ledger` | Fabric network, chaincode, gateway API, indexer, read-only fallback API | none (backend) | GitHub Codespaces (Fabric + gateway) and Vercel (read-API) |
| 01 | `01-farmer-app` | Farmer + VLE mobile app | Member farmers, Village-Level Entrepreneur | Expo (Expo Go QR, Android APK, web build on Vercel) |
| 02 | `02-fpo-console` | FPO operator console | FPO CEO, operator, warehouse/cold-storage clerk | Vercel |
| 03 | `03-bank-portal` | Bank underwriting portal | Credit officer | Vercel |
| 04 | `04-buyer-portal` | Buyer sourcing portal | Buyer/processor procurement manager | Vercel |
| 05 | `05-consumer-site` | Public provenance site | Anyone who scans a pack QR | Vercel |
| 06 | `06-gov-dashboard` | Governance and monitoring dashboard with Ledger Explorer | FPO board, NABARD/SFAC/State observer, the professor | Vercel |

---

## 2. Non-negotiables (every chat, every phase)

1. **The ledger is real.** Every state change shown in a UI comes from a committed Fabric transaction, or from the index built from Fabric chaincode events. No hardcoded tx hashes, block numbers or "blockchain" figures. A UI never generates its own fake ledger data.
2. **Mocks are allowed only for:**
   - external government/market systems: AgriStack, e-NWR repositories (NERL/CCRL), e-NAM, ONDC, UPI/NPCI, Bhashini, OCEN, Account Aggregator, NCGTC;
   - physical devices: weighbridge and quality meter.

   Every mock is labelled **"Simulated adapter"** in the UI. During development, a portal may use the contract fixtures (`shared/fixtures/`) behind `NEXT_PUBLIC_USE_FIXTURES=true`. A production build fails if that flag is true.
3. **No personal data on-chain** (DPDP Act, 2023 and DPDP Rules, 2025). Names, phone numbers, Aadhaar, bank account numbers and exact plot coordinates stay off-chain in Postgres. The ledger holds only pseudonymous tokens, hashes, references and state.
4. **No impersonation.** No State Emblem of India, no logos of real ministries, banks, NABARD, SFAC, e-NAM, ONDC, NPCI or IIT Kharagpur. Every FPO, bank, buyer and warehouse operating in the prototype is **fictional** (Section 5). Real institutions are named only as integrations, e.g. "e-NWR via NERL (simulated adapter)". Real FPOs appear only in the pilot-design documents as *proposed partners* (Section 4.3).
5. **Every surface carries this footer:** `Academic prototype - RD61003, CRDIST, IIT Kharagpur - Group 7. Not a government, banking or payment service. Ledger is live Hyperledger Fabric 2.5; external integrations are simulated.`
6. **Never invent statistics.** Every number shown is one of three things: computed from ledger/index data; quoted from Section 4 with its citation; or fetched from a source and recorded in the folder's `docs/DATA_SOURCES.md`. If a figure cannot be verified, leave it out.
7. **No AI-generated images and no AI-slop design** (Section 10).
8. **Work in phases and stop at every CHECKPOINT** with a report covering: what was built, what was verified (with real command output), what is simulated, and what the human must do.
9. **Use conventional commits, and only commit files inside your own folder.** Run `git pull --rebase` before each commit, because seven chats share one repo.

---

## 3. Glossary and formats

### 3.1 Identifiers
| Thing | Format | Example | Notes |
|---|---|---|---|
| Lot ledger key | GS1 SSCC, 18 digits, mod-10 check digit | `089012340000004517` | Extension digit `0`. The **demo** company prefix `8901234` is fictional, and the code says so in a comment. The check digit is computed with the GS1 algorithm; `shared/contract.ts` exports `ssccCheckDigit()`. |
| Human lot reference | `WB-PSM-{BLOCK}-{CROP}-{FPO}-{YYYY}-{SEASON}-{SERIAL5}` | `WB-PSM-DBR-POT-FPO07-2026-R-00451` | BLOCK: `KGP2` Kharagpur-II, `DBR` Debra, `KSY` Keshiary. CROP: `POT` potato, `PAD` paddy, `BRJ` brinjal, `CAU` cauliflower. SEASON: `R` rabi, `K` kharif, `B` boro. Printed next to the QR on every label. |
| Farmer token (on-chain) | `FT-` + 16 hex chars = first 64 bits of HMAC-SHA256(server secret, farmer UUID) | `FT-9c2e41a07b55d3f1` | The only farmer identifier on-chain. |
| Farmer ID (off-chain) | UUID v4 | | Lives in Postgres only. |
| Plot ID | `PL-` + 10 chars | `PL-7Q2M9X4K1A` | The polygon lives off-chain; only `sha256(GeoJSON)` goes on-chain. |
| e-NWR reference | `ENWR-{REPO}-{YYYY}-{6 digits}` | `ENWR-NERL-2026-004211` | REPO is `NERL` or `CCRL`. Issued by the simulated adapter. |
| Order ID | `ORD-{YYYY}-{5 digits}` | `ORD-2026-00087` | |
| Deposit ID | `DEP-{YYYY}-{5 digits}` | `DEP-2026-00201` | Added in 1.0.1. Needed by `POST /storage/deposits/:id/enwr`. |
| Lien ID | `LIEN-{YYYY}-{5 digits}`, same number as the loan | `LIEN-2026-00041` | Added in 1.0.1. |
| Loan ID | `LN-{YYYY}-{5 digits}` | | |
| Patronage run ID | `PR-{YYYY}-{MM}-{3 digits}` | | |
| UPI reference | 12 digits, prefixed `SIM` in the UI | `SIM 604512339876` | Always shown as simulated. |
| Fabric tx ID | 64 hex chars, from Fabric | | Never generated by the apps. |

### 3.2 Lot status (state machine, enforced in chaincode)
```
PENDING_FARMER_SIGNATURE (off-chain only; draft created by VLE)
  → COMMISSIONED (F2)
  → GRADED (F3)
  → IN_STORAGE (deposit recorded in cold storage or warehouse)
  → PLEDGED (F5 lien active)       ↘ (lien released → IN_STORAGE)
  → LISTED (order created / offered)
  → SOLD (F6 price agreed)
  → IN_TRANSIT (custody proposed to buyer)
  → DELIVERED (custody accepted by buyer, quality accepted)
  → SETTLED (settlement recorded)
  → CLOSED (patronage distributed, F7)
Side states: TRANSFORMED (graded out to processing), REJECTED, UNVERIFIABLE (origin link broken after DPDP erasure)
```
A lot that is `PLEDGED` **cannot** move to `IN_TRANSIT` until its lien is released. Chaincode error: `ERR_LOT_PLEDGED`.

### 3.3 Event names (chaincode events; GS1 EPCIS 2.0-shaped payloads, no PII, no price)
`FarmerOnboarded, PlotRegistered, ConsentGranted, InputApplied, LotCommissioned, LotGraded, QualityCredentialIssued, LotTransformed, DepositRecorded, ENWRIssued, LienMarked, LoanDisbursed, LoanRepaid, LienReleased, OrderCreated, PriceAgreed, CustodyProposed, CustodyAccepted, ConditionDigestAnchored, QualityAccepted, SettlementExecuted, PatronageDistributed, PersonalDataErased, LotStatusChanged`

`LotStatusChanged` (added in 1.0.1) is emitted by the lot-status mirror calls described in Section 7: the lot status lives on trace-channel, so when a finance or trade transaction changes it, the gateway follows up with a trace-channel transaction. Portals may hide it from toasts; the explorer shows it.

The payload shape is `{eventType, eventTime, bizStep, disposition, epcList:[sscc], bizLocation, readPoint, refs:{...}}`. The off-chain views `MemberStatementViewed` and `ProvenanceQueried` are logged in Postgres as telemetry. They are not on-chain.

### 3.4 Domain vocabulary (use correctly)
- **Units:** quintal (100 kg); potato is handled in 50 kg bags (verify against a West Bengal source before using in copy); tonne.
- **Market terms:** modal price, mandi/APMC, AGMARKNET, arhatdar/commission agent, hamali/loading charge, market fee.
- **Storage and finance terms:** cold storage rent (per quintal, set by the West Bengal government each season; research and cite), e-NWR, WDRA-registered warehouse/cold storage, pledge finance, haircut, LTV, CGS-NPF (Credit Guarantee Scheme for e-NWR-based Pledge Financing, NCGTC).
- **Institutional terms:** patronage, VLE, FPC (Farmer Producer Company), gram panchayat, block, mouza.
- **Seasons and varieties:** boro / aman / aus paddy; Kufri Jyoti / Kufri Pukhraj / Kufri Chipsona potato.
- **Money:** Indian format `₹1,20,450`, with lakh/crore for large values. **Dates:** `DD-MM-YYYY`, IST. **Numbers in figures:** tabular numerals.

---

## 4. Pilot geography and evidence (Kharagpur cluster)

### 4.1 Why this cluster
The pilot moves from the mid-term's Amravati mandarin cluster to the **Kharagpur subdivision of Paschim Medinipur district, West Bengal**. The team is based in Kharagpur, so field validation is practical, and the dominant crops fit both pillars:
- **Potato** (cold storage → traceability to processors and retail, plus cold-storage-receipt pledge finance).
- **Paddy** (warehouse e-NWR pledge finance, and the MSP comparison).
- **Winter vegetables** (consumer QR on retail packs).

> The GI-385 / Nagpur mandarin premium story does **not** carry over. The traceability premium here is **verified origin + residue-tested + cold-chain-continuous** produce for processors and organised retail. Do not show any GI claim.

### 4.2 Evidence that may be quoted (with these citations)
| Fact | Figure | Source to cite |
|---|---|---|
| Debra block potato | 1,35,764 t from 5,235 ha (2013-14) | District Statistical Handbook, Paschim Medinipur 2014, as reported on Wikipedia "Debra (community development block)" |
| Debra block boro paddy | 65,627 t from 18,987 ha (2013-14) | same |
| Debra irrigation | 26,730 ha irrigated, of which 23,700 ha by deep tubewell (2013-14) | same |
| Kharagpur-II potato | 71,634 t from 2,525 ha (2013-14) | District Statistical Handbook 2014, via Wikipedia "Kharagpur II" |
| Kharagpur-II irrigation | 12,566 ha irrigated, of which 5,000 ha by canal (2013-14) | same |
| Kharagpur-II marginal farmers | 27.42% of persons engaged in agriculture (2013-14) | same |
| Kharagpur-II first language | Bengali 88.23%, Santali 10.53% (Census 2011) | same |
| Kharagpur-I aman paddy | 1,07,107 t from 40,648 ha (2013-14) | District Statistical Handbook 2014, via Wikipedia "Kharagpur I" |
| WDRA cold-storage NWRs | WDRA has notified 24 horticultural commodities for cold storage negotiable warehouse receipts | WDRA FAQ (wdra.gov.in/faq). Before claiming potato is on that list, verify it and cite the notification. |
| AGMARKNET coverage | Paschim Medinipur APMCs reporting: Medinipur (West), Ghatal, Garbeta; vegetables and potato are reported | AGMARKNET via data.gov.in |
| National problem figures | Carried over from the mid-term (PIB 2025; RBI WP 06/2024; NABCONS 2022; WDRA) | as cited in the mid-term report |

Every figure above is 2013-14 secondary data. Label it as such and never present it as current.

### 4.3 Proposed partner FPOs (real; used **only** in pilot-design documents, never as the operator in the UI)
| FPO | Location (as listed) | Commodities (as listed) | Source |
|---|---|---|---|
| Debra Agri Business Producer Company Ltd | Pandat, Boulasini, Debra, Paschim Medinipur 721156 | masur lentil, mixed vegetables, paddy | SFAC list of FPOs in West Bengal |
| Keshiary Agro Producer Company Ltd | Gopalpur, Keshiary | masur lentil, paddy | SFAC list of FPOs in West Bengal |
| Humgarh Farmers Producer Company Ltd | Kayabad, Hoomgarh, Goaltore | mixed vegetables, paddy, potato | SFAC list of FPOs in West Bengal |

The SFAC list is a mid-2010s list. Before any document names these FPOs, the team must confirm on the MCA portal that the company is **Active**, and contact it through ABIF, IIT Kharagpur's Agri Business Incubation Foundation, which maintains an FPO directory.

### 4.4 Pilot villages (3 pilot + 2 comparison) and their roles
| Village (block) | Role in pilot | What it tests |
|---|---|---|
| **Changual** (Kharagpur-II) | Anchor: collection, grading and QR labelling centre; closest to IIT Kharagpur for field visits | Potato traceability, device-signed grading, cold-storage deposit |
| **Golgram** (Debra) | High potato + boro paddy density; partner-FPO catchment | Potato to processor/retail premium channel; cold-storage-receipt pledge |
| **Gopalpur** (Keshiary) | Paddy + lentil households; higher Scheduled Tribe share; weaker connectivity (verify) | Paddy warehouse e-NWR pledge finance; offline-first capture |
| Sankoa (Kharagpur-II) | Comparison village | Difference-in-differences baseline |
| Duan (Debra) | Comparison village | Difference-in-differences baseline |

- **Village names and GPs:** Golgram and Duan are Debra gram panchayats; Changual and Sankoa are Kharagpur-II gram panchayats (sources in Section 4.2). Confirm Gopalpur on the Census 2011 village directory / LGD before relying on it.
- **Coordinates:** the 00-core chat must geocode each village with OpenStreetMap Nominatim, check each result on the map, record the source, and publish the result as `shared/fixtures/villages.json`. **Nobody hardcodes guessed coordinates.**

### 4.5 Pilot cohort for the prototype seed (scaled from the mid-term design)
- 150 member farmers (~50 per pilot village), with a 40% women target.
- Season windows to seed:
  - Potato: cold storage loading Mar-Apr 2026, unloading Oct-Dec 2026.
  - Aman paddy: harvest Nov-Dec 2026.
  - Winter vegetables: Nov 2026-Feb 2027.
  - The core chat verifies these windows against a West Bengal agriculture source and records them in DATA_SOURCES.

---

## 5. Fictional operators, personas and demo logins

| Org (MSP) | Fictional name used in UI | Notes |
|---|---|---|
| `FpoOrgMSP` | **Kharagpur Krishak Sanghati Producer Company Ltd** (FPO code `FPO07`) | Hosts the VLE, operator, CEO and cold-storage/warehouse clerk identities |
| `BankOrgMSP` | **Subarnarekha Krishi Bank** | Fictional. The core chat checks that no real bank has this name and renames it if one does. |
| `BuyerOrgMSP` | **Gangetic Fresh Foods Pvt Ltd** (Kolkata processor + retail) | Fictional; same check. |
| `RegulatorOrgMSP` | **District Agri-Finance Monitoring Cell (demo observer)** | Represents NABARD/SFAC/State roles generically |
| Cold storage | **Rupnarayan Cold Storage (demo)**, Debra | Fictional; operated under FpoOrgMSP with `role=warehouse` |
| Warehouse | **Kansai Agri Warehouse (demo)**, Keshiary | Fictional; WDRA registration shown as "simulated" |

Demo logins (password for all: `Setu@2026`; the farmer uses OTP `123456`, shown on screen):
| Username | Persona | Portal | Fabric identity |
|---|---|---|---|
| `anima.das` / phone `9000000001` | Anima Das, 42, member farmer, Changual, 0.8 ha potato + aman paddy | 01 farmer | FpoOrgMSP `role=member` (submits only through the FPO identity; signs with a device key) |
| `subhankar.vle` | Subhankar Maity, 27, VLE at the Changual centre | 01 farmer (VLE mode), 02 | FpoOrgMSP `role=vle` |
| `sujata.ceo` | Sujata Jana, 39, FPO CEO | 02 | FpoOrgMSP `role=ceo` |
| `debasis.ops` | Debasis Mondal, FPO operator (weighbridge, grading, labels, dispatch). Added in 1.0.1: steps 4 and 8 name an operator but the table had no login for one. | 02 | FpoOrgMSP `role=operator` |
| `ratan.store` | Ratan Pal, cold storage / warehouse clerk | 02 | FpoOrgMSP `role=warehouse` |
| `arindam.bank` | Arindam Ghosh, branch credit officer | 03 | BankOrgMSP `role=credit_officer` |
| `rahul.buyer` | Rahul Agarwal, procurement manager | 04 | BuyerOrgMSP `role=buyer_manager` |
| `observer.gov` | District monitoring officer | 06 | RegulatorOrgMSP `role=observer` |
| `board.fpo` | FPO board member | 06 | FpoOrgMSP `role=board` |

Seed farmer names are realistic Bengali names (and Santali names for some Keshiary households), written in Bengali script plus English transliteration. Do not use famous people's names.

---

## 6. The 10-step golden journey (every chat must keep this working)

| Step | Actor → Surface | Action | Ledger effect | Must show up in |
|---|---|---|---|---|
| 1 | Subhankar (VLE) → 01 VLE mode | Onboards Anima, captures the plot, records consent | F1 `registerFarmerAndPlot` → `FarmerOnboarded, PlotRegistered, ConsentGranted` | 02 Members, 06 KPIs |
| 2 | Anima → 01 | Logs a pesticide spray on potato; PHI warning if harvest/unloading falls inside the window | `recordInputEvent` (hash only) → `InputApplied` | 01 diary, 04 lot provenance (PHI flag only) |
| 3 | Subhankar → 01/02, then Anima → 01 | VLE creates a 40-bag lot draft; Anima taps **"আমি নিশ্চিত করছি"** (I confirm), which signs with her device key | F2 `commissionLot` → `LotCommissioned` | 02 queue, 06 explorer, 05 page exists |
| 4 | Operator → 02 | Reads the simulated weighbridge and quality meter (device-signed), assigns grade, prints the QR label | F3 `attestQuality` → `LotGraded, QualityCredentialIssued` | 01 lot card, 04 catalogue |
| 5 | Ratan → 02 | Deposits the potato lot in cold storage; separately deposits a paddy lot from Gopalpur in the warehouse; requests e-NWRs | `recordDeposit`, `issueENWRRef` → `DepositRecorded, ENWRIssued` | 03 collateral search |
| 6 | Arindam → 03 | Views collateral, marks a lien, disburses 70% of assessed value. **A second lien attempt is rejected live.** | F5 `markLien` → `LienMarked, LoanDisbursed` | 02 collateral position, 06 finance KPIs, 01 Anima sees "pledged" |
| 7 | Sujata → 02, Rahul → 04 | Lists the grade A potato lot; Rahul places an order and agrees the price privately | `createOrder`, F6 `agreePrice` → `OrderCreated, PriceAgreed` (price in PDC, hash public) | 02 orders, 04 orders, 06 shows "price private" |
| 8 | Operator → 02, Rahul → 04 | Lien released after repayment; dispatch to Kolkata with the simulated BLE logger; Rahul scans the QR and accepts | F4 `proposeTransfer` / `acceptTransfer`, `anchorConditionDigest`, `acceptQuality` | 05 journey map, 06 explorer |
| 9 | Sujata → 02 | Records the settlement and runs patronage; UPI refs are simulated | `recordSettlement`, F7 `distributePatronage` → `SettlementExecuted, PatronageDistributed` | 01 statement, 06 patronage equity |
| 10 | Anima → 01; consumer → 05 | Anima opens her statement and hears it read aloud in Bengali; a consumer scans the 5 kg pack QR | telemetry only | 06 "% members viewed statement" |

`00-core-ledger/scripts/e2e-journey.ts` runs all 10 steps through the API and asserts every effect. Each portal has a Playwright test for its own steps.

---

## 7. Fabric network (implemented only by 00-core-ledger; everyone else must understand it)

- **Fabric:** v2.5.x LTS (latest 2.5 patch, pinned in `00-core-ledger/network/VERSIONS.md`). Fabric CA 1.5.x.
- **Orgs:** `FpoOrgMSP`, `BankOrgMSP`, `BuyerOrgMSP`, `RegulatorOrgMSP`, `OrdererOrgMSP`. One peer per org. **3 Raft orderers** (a 1-orderer "lite" profile is allowed for low-RAM hosts; the local network runs the full profile). Raft elects one leader per channel, so the explorer shows a leader per channel.
- **Channels:**
  - `trace-channel`: FPO, Bank, Buyer, Regulator.
  - `finance-channel`: FPO, Bank, Regulator.
  - `trade-channel`: FPO, Buyer.
- **Chaincode (Go):**

| Chaincode | Channel | Functions | Endorsement |
|---|---|---|---|
| `lot-lifecycle` | trace | F1, F2, F3, F4 (propose/accept), `recordInputEvent`, `recordTransformation`, `anchorConditionDigest`, F7, `markUnverifiable`, queries | MAJORITY (3 of 4) + submitter checks via MSP ID and `role` attribute + state-based endorsement on custody transfer |
| `pledge-lien` | finance | `recordDeposit`, `issueENWRRef`, F5 `markLien`, `recordDisbursement`, `recordRepayment`, `releaseLien` | `AND('FpoOrgMSP.peer','BankOrgMSP.peer')` |
| `order-settlement` | trade | `createOrder`, F6 `agreePrice` (transient → `tradePricePDC`), `recordSettlement`, `acceptQuality` | `AND('FpoOrgMSP.peer','BuyerOrgMSP.peer')` |

- **Private data:** `tradePricePDC` (FPO, Buyer) on trade-channel; `loanTermsPDC` (FPO, Bank) on finance-channel.
- **Dual attestation (F2):** the farmer's device signs `canonicalJSON({sscc, farmerToken, plotId, commodity, bagCount, estWeightKg, harvestOrUnloadDate})` with ECDSA P-256 / SHA-256. The chaincode verifies the signature against the public key registered in F1. Canonical JSON = keys sorted, no whitespace, UTF-8. `shared/contract.ts` exports `canonicalJson()` so every app signs **exactly** the same bytes.
- **Device attestation (F3):** the simulated weighbridge and quality meter sign `canonicalJSON(reading)` with their registered device keys.
- **Wire formats (1.0.1):** `signatureHex` is 128 lowercase hex chars = `r || s`, 32 bytes each, big-endian (IEEE P1363, what Web Crypto produces; not DER). `publicKeyHex` and `devicePublicKeyHex` are 130 hex chars = the uncompressed SEC1 point `04 || X || Y` (Web Crypto `exportKey('raw')`). The message is the UTF-8 bytes of `canonicalJson(payload)`; SHA-256 is part of the signature algorithm. `canonicalJson` throws on NaN, Infinity, undefined array items and non-plain objects. Prefer integers in signed payloads. Test vectors for the Go verifier: `shared/testvectors/canonical-json.json`.
- **Price hash (1.0.1):** `priceHash = sha256Hex(canonicalJson({orderId, pricePerQtl, salt}))`. If the request has no `salt`, the gateway derives it as the first 32 hex chars of HMAC-SHA256(`PRICE_SALT_SECRET`, orderId), so that the FPO and Buyer submissions agree without sharing a salt out of band.
- **Lot status mirror calls (1.0.1):** the lot status lives in `lot-lifecycle` on trace-channel, but some transitions are caused by finance or trade transactions. After those commit, the gateway submits a follow-up `lot-lifecycle` call that moves the status and emits `LotStatusChanged`: `setInStorage` (after `recordDeposit`), `setPledged(sscc, true|false)` (after `markLien` and `releaseLien`), `setListed` (after `createOrder`), `setSold` (after the second `agreePrice`), `setSettled` (after `recordSettlement`). `proposeTransfer` and `acceptTransfer` set IN_TRANSIT and DELIVERED, and `distributePatronage` sets CLOSED. A failed mirror call must never be hidden: the gateway reports it and the indexer shows the gap.
- **Who sees what:** the Regulator is not on trade-channel, so it **never sees prices**. The Bank never sees the crop diary. The Buyer never sees loan terms.

---

## 8. Gateway API (base URL in env `API_URL`; read-only fallback in env `READ_API_URL`)

**Common rules:**
- **Lot reads and lists never include a farmer name or phone.** Names appear only in `FarmerPrivate` and the patronage preview.
- JSON only. Auth is `Authorization: Bearer <JWT>`. JWT claims: `{sub, username, role, org, displayName, portal}`.
- **Every successful write returns** `LedgerReceipt & {resource}`:
  ```ts
  type LedgerReceipt = { txId: string; channel: 'trace-channel'|'finance-channel'|'trade-channel'; chaincode: string; fn: string; blockNumber: number; validationCode: 'VALID'; endorsers: string[]; committedAt: string /* ISO */ };
  ```
- **Every record a read returns** carries `proof?: {txId, blockNumber, channel}` for the transaction that last changed it.
- **Errors:** `{error:{code, message, txId?, details?}}`. Codes: `ERR_UNAUTHENTICATED, ERR_FORBIDDEN_ROLE, ERR_FORBIDDEN_ORG, ERR_VALIDATION, ERR_NOT_FOUND, ERR_INVALID_STATE, ERR_BAD_FARMER_SIGNATURE, ERR_BAD_DEVICE_SIGNATURE, ERR_DOUBLE_FINANCING, ERR_LOT_PLEDGED, ERR_UNILATERAL_CUSTODY, ERR_PRICE_HASH_MISMATCH, ERR_PATRONAGE_UNBALANCED, ERR_LEDGER_UNAVAILABLE`.
- **Ledger mode:** every response has header `X-Ledger-Mode: live | index-only`. In `index-only` mode (served by the read-API while the Fabric host sleeps), writes return `503 ERR_LEDGER_UNAVAILABLE`. **All portals must show the offline banner (Section 9.3) and disable write actions.**
- Paginated lists use `?cursor=&limit=` and return `{items, nextCursor}`.
- **Live updates:** `GET /events/stream` is Server-Sent Events of `{event, sscc?, orderId?, enwr?, txId, blockNumber, channel, at}` for every indexed chaincode event, with no PII. Portals subscribe to it so that actions in one portal appear in the others within ~3 seconds.

**Machine-readable form (1.0.1):** `shared/openapi.yaml` (OpenAPI 3.1) is generated from `shared/mock/endpoints.mjs` and the types in `contract.ts`. Where this list and `openapi.yaml` disagree, `openapi.yaml` wins and the disagreement is a bug to report. Error HTTP statuses are in `ERROR_HTTP_STATUS` in `contract.ts`. Roles written `authenticated` accept any signed-in role.

**Endpoints** (role in brackets; `public` means no auth):

**Auth and system**
- `POST /auth/login` {username,password,portal} → {token,user} [public]
- `POST /auth/otp/request` {phone} → {sent:true, demoOtp:'123456'} [public]
- `POST /auth/otp/verify` {phone,otp} → {token,user} [public]
- `GET /health` → {ok, ledgerMode, contractVersion, channels:{[name]:{height}}} [public]
- `GET /config/public` → {portalUrls, contractVersion, adapterModes} [public]

**Ledger explorer** [public, read-only]
- `GET /ledger/status` → peers[], orderers[] (raftLeader), channels[] with height and members
- `GET /ledger/blocks?channel=&limit=` → latest blocks {number, dataHash, previousHash, txCount, time}
- `GET /ledger/blocks/:channel/:number` → block detail + tx list
- `GET /ledger/tx/:txId` → {txId, channel, chaincode, fn, blockNumber, blockHash, validationCode, timestamp, creatorMsp, endorsers[], rwset:{reads:[key], writes:[key]}} (keys only, never values)
- `GET /ledger/search?q=` → by txId, SSCC, ENWR or order ID

**Farmers**
- `POST /farmers` (F1) [vle] {name, nameLocal, gender, phone, village, plot:{geojson, areaHa, crops[]}, consent:{version, lang, acceptedAt}, devicePublicKeyHex?}
- `GET /farmers?village=` [vle, ceo, board]
- `GET /farmers/me` [member]
- `POST /farmers/me/device-key` {publicKeyHex} [member]; it is registered on-chain under the farmer token
- `DELETE /farmers/:id/personal-data` [member self or ceo] → erases PII, then `markUnverifiable`

**Crop diary**
- `POST /diary/inputs` [member, vle] {product, activeIngredient, dose, appliedOn, phiDays, crop} → hash anchored
- `GET /diary/inputs?farmerId=` [member self, vle]. The Bank **cannot** call this endpoint.

**Lots**
- `POST /lots/drafts` [vle] {farmerId, plotId, commodity, variety, bagCount, estWeightKg, harvestOrUnloadDate} → {sscc, humanRef, payloadToSign}
- `GET /lots/drafts/pending` [member] → drafts awaiting the farmer's signature
- `POST /lots/:sscc/farmer-sign` [member] {signatureHex} → F2 receipt
- `GET /lots?status=&grade=&village=&commodity=&farmerId=` [vle, ceo, operator, warehouse, board, observer; buyer only through the catalogue]
- `GET /lots/:sscc` → the full Lot Passport view for the caller's role (fields are filtered server-side per Section 7)
- `POST /devices/:deviceId/read` [operator] → `{reading, signatureHex, deviceId}` where `deviceId ∈ {WB-CHG-01 (weighbridge), QM-CHG-01 (quality meter)}`
- `POST /lots/:sscc/quality` (F3) [operator] {weighbridgeReading, qualityReading, grade}
- `POST /lots/:sscc/transform` [ceo] {toProcessing:true, reason}
- `POST /lots/:sscc/custody/propose` (F4) [operator] {toOrg, vehicleNo, loggerId}
- `POST /lots/:sscc/custody/accept` (F4) [buyer_manager]
- `POST /lots/:sscc/condition-digest` [system/operator] {window, minC, maxC, avgC, breaches, digestHash}
- `GET /lots/:sscc/label.pdf` [operator] → a 100×50 mm label with the GS1 Digital Link QR

**Storage and finance**
- `POST /storage/deposits` [warehouse] {sscc, facility:'COLD_STORAGE'|'WAREHOUSE', facilityName, bags, depositedAt}
- `GET /storage/deposits?facility=` [warehouse, ceo] (added in 1.0.1)
- `POST /storage/deposits/:id/enwr` [warehouse] → {enwr, repository} (simulated adapter + ledger ref)
- `GET /collateral?enwr=&sscc=` [credit_officer, ceo, observer] → {lot summary, quantityQtl, assessedValue, priceBasis:{source, market, date, modalPerQtl}, haircutPct, ltvPct:70, eligibleLoan, lien:{status, lienId?, bank?, proof?}, storageConditionHistory[], attestorReputation, cgsNpfEligible, cgsNpfReason}
- `POST /collateral/:enwr/lien` (F5) [credit_officer] {loanId, amount, tenureDays, ratePct} (loan terms → `loanTermsPDC`)
- `POST /loans/:loanId/disburse` [credit_officer]; `POST /loans/:loanId/repay` [credit_officer] {amount}; `POST /loans/:loanId/release` [credit_officer]
- `GET /loans?status=` [credit_officer, ceo]
- `GET /loans/:loanId` [credit_officer, ceo] (added in 1.0.1, for the `/loans/{loanId}` deep link)

**Trade**
- `GET /catalogue?commodity=&grade=&minQtl=&village=` [buyer_manager] → lots in GRADED/IN_STORAGE, never pledged ones
- `POST /orders` [buyer_manager or ceo] {ssccs[], channel:'DIRECT'|'ONDC'|'ENAM', deliveryBy}
- `GET /orders?status=` [ceo, buyer_manager]
- `GET /orders/:orderId` [ceo, buyer_manager] (added in 1.0.1, for the `/orders/{orderId}` deep link)
- `POST /orders/:id/agree-price` (F6) [ceo and buyer_manager, two-step: each submits; it commits when both match] {pricePerQtl, salt?} → the public response carries only `priceHash`
- `GET /orders/:id/price` [ceo, buyer_manager] → reads the PDC. Any other role gets `ERR_FORBIDDEN_ORG`.
- `POST /orders/:id/accept-quality` [buyer_manager] {accepted, notes}
- `POST /orders/:id/settle` [ceo] {amount, upiRef}

**Patronage and statements**
- `POST /patronage/preview` [ceo] {orderId} → per member {farmerToken, name (off-chain join), kg, gross, deductions[{type, amount}], net}
- `POST /patronage/runs` (F7) [ceo] {orderId}
- `GET /patronage/runs` [ceo, board] (added in 1.0.1)
- `GET /statements/me` [member] → per-lot statement {sscc, humanRef, kg, grade, buyerType, gross, deductions[], net, upiRef, paidOn, proofs[]}

**Analytics**
- `GET /kpis` [board, observer, ceo] → the KPI set in Section 9.5, each with `{value, unit, numerator, denominator, computedFrom, asOf}`
- `GET /prices?commodity=&market=&from=&to=` [any] → AGMARKNET series {date, market, min, max, modal, source}
- `GET /prices/msp?crop=paddy` [any] → MSP by season, with a PIB citation
- `GET /villages` [public] → `Village[]`, the `villages` example in `shared/fixtures/villages.json`
- `GET /audit/sample` [ceo, observer] → the 5% random re-inspection list + divergence rate
- `GET /reputation/attestors` [credit_officer, ceo, observer]

**Public**
- `GET /public/provenance/:sscc` [public] → {sscc, humanRef, commodity, variety, village, block, district, harvestOrUnloadDate, grade, residueTested, phiCompliant, coldChain:{continuous, breaches}, journey:[{step, place, at, orgType}], proofs[], ledgerMode}. **No names or phone numbers.**
- `POST /public/scan-report` {sscc, approxLocation?, suspicious?, note?}

The canonical TypeScript types for all of these live in `shared/contract.ts`. Example responses live in `shared/fixtures/*.json`; the core chat creates them in its Phase 1.

---

## 9. Cross-portal connectivity (how the six sites behave as one product)

### 9.1 Portal URLs (env vars; every portal reads all of them)
```
NEXT_PUBLIC_API_URL / EXPO_PUBLIC_API_URL            gateway (Codespaces public port or VM)
NEXT_PUBLIC_READ_API_URL / EXPO_PUBLIC_READ_API_URL  read-only fallback on Vercel
NEXT_PUBLIC_URL_FARMER_WEB   NEXT_PUBLIC_URL_FPO   NEXT_PUBLIC_URL_BANK
NEXT_PUBLIC_URL_BUYER        NEXT_PUBLIC_URL_CONSUMER   NEXT_PUBLIC_URL_GOV
```
`GET /config/public` returns the same map, so a portal can discover the others at runtime. The env vars win if both are set.

### 9.2 Deep-link scheme (canonical routes every portal must implement exactly)
| Target | Route |
|---|---|
| Farmer app | `fposetu://lot/{sscc}`, `fposetu://statement/{sscc}`; on web: `{URL_FARMER_WEB}/lot/{sscc}` |
| FPO console | `{URL_FPO}/lots/{sscc}`, `{URL_FPO}/orders/{orderId}`, `{URL_FPO}/collateral/{enwr}` |
| Bank | `{URL_BANK}/collateral/{enwr}`, `{URL_BANK}/loans/{loanId}` |
| Buyer | `{URL_BUYER}/lots/{sscc}`, `{URL_BUYER}/orders/{orderId}` |
| Consumer | `{URL_CONSUMER}/00/{sscc}` (GS1 Digital Link; this is what the QR encodes) |
| Gov | `{URL_GOV}/ledger/tx/{txId}`, `{URL_GOV}/ledger/block/{channel}/{n}`, `{URL_GOV}/lots/{sscc}` |

**Rule:** wherever a tx ID is shown, it links to `{URL_GOV}/ledger/tx/{txId}`. Wherever an SSCC is shown, offer "Open in…" links to the other portals **that the role is allowed to see** (e.g. a buyer gets the consumer view, never the bank view).

### 9.3 Shared UI elements (same behaviour everywhere; each portal styles them in its own theme)
1. **Ledger proof drawer.** Opened from any record. It shows the tx ID (copy button), channel, block number, endorsing orgs as badges, commit time, and the link to the Gov explorer. A **"Re-verify"** button recomputes in the browser (Web Crypto SHA-256) the hash of any off-chain document the user is allowed to see, and compares it with the on-chain hash.
2. **Ledger status pill** (header). `Live · trace #1,284 · finance #311 · trade #207`, or amber `Index-only · last block #1,284 at 14-11-2026 18:02 IST`, or red `Ledger offline`.
3. **Offline banner.** When `X-Ledger-Mode: index-only`, show: "The ledger node is asleep. You are seeing the last indexed state. Actions that write to the ledger are paused." Write buttons are disabled and explain why on hover.
4. **Live activity toasts** from `/events/stream`, filtered to what the role may see. Example: "Lot WB-PSM-KGP2-POT-FPO07-2026-R-00451 graded A at Changual · tx 3f2a…".
5. **Demo bar** (only when `NEXT_PUBLIC_DEMO_MODE=true`). A thin strip at the very top: "Demo · Step 4 of 10 · Next: Bank marks lien →", with links that open the next portal at the right deep link. This drives the professor demo across six tabs.
6. **Footer** from Section 2.5, plus links to `/credits` (image credits) and `/about` (the architecture in one diagram, consistent across portals).

### 9.4 Who is allowed to see what (must match the gateway's server-side filtering)
| Data | Farmer (own) | VLE | FPO CEO/op | Bank | Buyer | Consumer | Observer |
|---|---|---|---|---|---|---|---|
| Farmer name/phone | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Crop diary detail | ✓ | ✓ | ✓ | ✗ | PHI flag only | PHI flag only | aggregate |
| Grade / weight | ✓ | ✓ | ✓ | ✓ | ✓ | grade only | ✓ |
| Lien / loan | own lot status | ✗ | ✓ | ✓ | ✗ | ✗ | ✓ (no terms) |
| Loan terms (PDC) | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Sale price (PDC) | own net only | ✗ | ✓ | ✗ | ✓ | ✗ | ✗ (hash only) |
| Patronage | own | ✗ | ✓ | ✗ | ✗ | ✗ | equity metrics |

### 9.5 KPI definitions (computed by core; displayed by 06 and partly by 02)
| KPI | Formula | Year-1 target |
|---|---|---|
| Realised price premium | (avg settled price per quintal, grade A) ÷ (AGMARKNET modal, same commodity, same week, Medinipur (West) market) − 1 | +8% |
| Post-harvest loss | 1 − (kg accepted by buyer ÷ kg at commissioning), weight-weighted | < 8% |
| Pledge finance reach | members with ≥1 lien ÷ members with storable lots; value facilitated | 35%; ₹ value |
| Payment cycle | median days from `PriceAgreed` to `PatronageDistributed` | < 7 days |
| Statement views | members who viewed ≥1 statement ÷ members with a settled lot | 70% |
| Time to trace | p50 latency of `/public/provenance` | < 5 s |
| Audit divergence | divergent re-inspections ÷ lots audited | < 5% |
| Women's participation | women with ≥1 lot ÷ members with ≥1 lot | ≥ 40% |
| Month-12 gate | the 4 criteria below, each shown as met / not met (`criteria[]` on the KPI; `value` = number met) | all 4 |

Month-12 gate criteria (given by the team, 15-10-2026, not read from the mid-term report):
1. At least 60% of members have at least one recorded lot.
2. First-mile audit divergence is below 5%.
3. At least one lender has disbursed against a platform-evidenced e-NWR.
4. At least one buyer has paid a measurable premium on a verified-origin consignment (premium measured against the AGMARKNET modal price, as in the first KPI).

---

## 10. Design system and anti-slop rules (all portals)

- **One family, six personalities.**
  - All portals share the spacing scale, radius (4-6 px), and type pairing: **IBM Plex Sans** + **IBM Plex Mono** for IDs and hashes; **Noto Sans Bengali** (or Hind Siliguri) for Bengali; Noto Sans Devanagari for Hindi.
  - Accents (in `shared/design/tokens.css`):
    - farmer: potato-skin ochre `#B5651D` on deep paddy green `#1E4D2B`, paper `#FAF7F0`
    - FPO: slate + status colours
    - bank: navy `#14213D` + steel
    - buyer: forest + kraft
    - consumer: editorial paper + green
    - gov: neutral grey + a single teal
- **Banned:**
  - purple/indigo gradients, glassmorphism, glows, blobs, 3D isometric illustrations, "AI sparkle" icons
  - emoji as icons (use **Lucide** consistently)
  - hero copy such as "Revolutionizing", "Empowering", "Seamless", "Cutting-edge", "Unlock", "Next-gen"
  - fake testimonials, fake partner logos, "trusted by" bars
  - stock "farmer holding a laptop" images
  - em dashes in UI copy
  - round-number vanity metrics
  - endless identical card grids
  - default unstyled spinners (design skeleton and empty states)
- **Copy:** plain and specific. For example: "See every lot from field to buyer, with proof each party signed." Errors are phrased as actions: "This lot already has an active lien (tx 3f2a…). Release it before pledging again."
- **Images:**
  - Allowed sources: **Wikimedia Commons** (CC0/BY/BY-SA), **Unsplash** and **Pexels** only, with Indian / West Bengal context: potato fields and cold storages in West Bengal, Medinipur paddy fields, Kharagpur countryside, Indian mandis, jute/potato bags, rural Bengal.
  - Reject non-Indian farm photos.
  - Convert to WebP. Record every image in the folder's `docs/IMAGE_CREDITS.md` and on its `/credits` page.
  - No AI images, no AI face upscaling.
  - If a chat cannot download from these sites, it lists the exact search URLs and filenames in `HUMAN_STEPS.md` and waits.
- **Languages:**
  - farmer app: **Bengali default**, Hindi, English (Santali in Ol Chiki is a stretch goal; mark it so)
  - FPO console: English with Bengali labels on VLE-facing screens
  - bank and buyer: English
  - consumer: English, Bengali, Hindi
  - gov: English
  - Every Bengali string in `i18n/bn.json` carries `"_review": true` until a native-speaking team member has reviewed it.
- **Accessibility:** WCAG 2.1 AA. Full keyboard navigation. Minimum body text 16 px on mobile and 16 sp in the app. Touch targets ≥ 48 px.

---

## 11. Repository and folder rules

```
fpo-setu/                      (one GitHub repo)
  shared/                      CONTRACT.md, contract.ts, fixtures/, design/tokens.css  ← owned by 00
  00-core-ledger/  01-farmer-app/  02-fpo-console/  03-bank-portal/
  04-buyer-portal/  05-consumer-site/  06-gov-dashboard/
  HUMAN_SETUP.md
```
- Each folder is an **independent project** with its own `package.json`, its own `CLAUDE.md`, its own README, and its own Vercel/Expo project. The folders share no workspace tooling.
- **Shared code is copied, not linked.** Each portal has `scripts/sync-contract.mjs`, which copies `../shared/contract.ts` → `src/contract/contract.ts` and `../shared/design/tokens.css` → `src/styles/tokens.css`. A test fails if the copies differ from `shared/` (it is skipped in Vercel builds, where `../shared` is not present). Vercel builds use only files inside the folder.
- Start each portal chat with access to the shared folder: `claude --add-dir ../shared` (or run `/add-dir ../shared` inside the session).
- **Node** 22 LTS. **Next.js:** the latest stable App Router release, TypeScript strict, Tailwind. **Package manager:** pnpm inside each folder.

---

## 12. Changelog
- 1.0.0: initial contract (Kharagpur cluster, potato/paddy, 7 folders).
- 1.0.1 (additive; portals that have not started are unaffected, portals that have started must re-sync `contract.ts`):
  - `contract.ts`: named request and response types for every endpoint; `ERROR_HTTP_STATUS`; `Receipted<T>`; `SignatureHex` and `PublicKeyHex` wire formats; `LotCommissionPayload`.
  - `canonicalJson` now throws on NaN, Infinity, `undefined` array items and non-plain objects instead of signing different bytes than a verifier sees. Output for valid input is unchanged.
  - `Village` gains `precision` (`LANDMARK` or `BLOCK_CENTROID`) and `note`. Golgram and Gopalpur are not in OpenStreetMap, so they carry the block centre until the human supplies coordinates.
  - `Loan` gains optional `sscc`, `tenureDays`, `ratePct`, `repaidAmount`. `Collateral` valuation formula documented.
  - New event `LotStatusChanged`; new ids `DEP-` and `LIEN-`; new persona `debasis.ops` (operator).
  - New endpoints: `GET /loans/:loanId`, `GET /orders/:orderId`, `GET /storage/deposits`, `GET /patronage/runs`.
  - New in Section 7: wire formats, price-hash definition, lot status mirror calls.
  - Patronage reconciliation stated precisely: sum(gross) = settlement amount and, per line, gross = net + sum(deductions), so sum(net) + sum(all deductions, FPO_MARGIN included) = settlement amount, within INR 1.
  - Portals affected: all six must re-sync `contract.ts`. 02 gains the operator login, `GET /storage/deposits` and `GET /patronage/runs`. 03 gains `GET /loans/:loanId`. 04 gains `GET /orders/:orderId`. 06 should expect `LotStatusChanged` in the explorer and SSE.
- 1.0.2 (additive): `LedgerStatus.orderers[].leaderOf` (Raft leaders are per channel; `raftLeader` means "leads trace-channel"). `Kpi.criteria` with the four Month-12 gate criteria (Section 9.5). The network now runs the full 3-orderer profile, so `ledger.json` shows three orderers. Portals affected: 06 (explorer shows per-channel leaders; Month-12 gate shows four met / not met rows). Others only need to re-sync `contract.ts`.
