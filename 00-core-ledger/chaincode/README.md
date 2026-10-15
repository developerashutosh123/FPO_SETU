# chaincode/

Three Go chaincodes (`fabric-contract-api-go` v1.2.2) and one shared module. Build and test: `make test`. Deploy: `make deploy`. End-to-end on the live network: `make smoke`.

| Folder | Channel | Endorsement | Private data |
|---|---|---|---|
| `lot-lifecycle` | trace-channel | `OutOf(3, Fpo, Bank, Buyer, Regulator)` peers; custody writes also need FPO and Buyer (state-based) | none |
| `pledge-lien` | finance-channel | `AND(Fpo.peer, Bank.peer)` | `loanTermsPDC` (FPO, Bank) |
| `order-settlement` | trade-channel | `AND(Fpo.peer, Buyer.peer)` | `tradePricePDC` (FPO, Buyer) |
| `common` | | | error codes, role checks, canonical JSON, P-256 verify, SSCC, events, test kit |

Every error message starts with its code (`ERR_DOUBLE_FINANCING: ...`); the gateway maps the prefix to the API error.

## lot-lifecycle functions

| Function | Who | Rule |
|---|---|---|
| `RegisterFarmerAndPlot` (F1) | Fpo `vle` | token, plot, hashes; a second call adds a plot |
| `RegisterDeviceKey` | Fpo `member`, `vle` | sets the farmer device key |
| `RegisterDevice` | Fpo `ceo` | weighbridge or quality meter public key for F3 (no event: infrastructure) |
| `RecordInputEvent` | Fpo `member`, `vle` | anchors a diary hash |
| `CommissionLot` (F2) | Fpo `vle`, `operator` | verifies the farmer's P-256 signature, else `ERR_BAD_FARMER_SIGNATURE` |
| `AttestQuality` (F3) | Fpo `operator` | verifies both device signatures, else `ERR_BAD_DEVICE_SIGNATURE`; COMMISSIONED to GRADED |
| `SetInStorage`, `SetPledged` | Fpo `warehouse` | status mirrors after deposit and after lien or release |
| `SetListed`, `SetSold`, `SetSettled`, `RecordTransformation` | Fpo `ceo` | status mirrors after order, price, settlement |
| `RecordQualityOutcome` | Buyer `buyer_manager` | accepted keeps DELIVERED, rejected gives REJECTED |
| `ProposeTransfer` (F4) | Fpo `operator` | SOLD lot only (`ERR_LOT_PLEDGED` if pledged); sets a two-org endorsement policy on the lot key |
| `AcceptTransfer` (F4) | Buyer `buyer_manager` | only the named org (`ERR_UNILATERAL_CUSTODY` otherwise); releases the two-org policy |
| `AnchorConditionDigest` | Fpo `operator` | cold-chain digest |
| `DistributePatronage` (F7) | Fpo `ceo` | vector must reconcile within INR 1, else `ERR_PATRONAGE_UNBALANCED` |
| `MarkUnverifiable` | Fpo `ceo`, `member` | DPDP erasure: breaks the origin link, emits `PersonalDataErased` |
| `GetLot`, `GetFarmer`, `GetDevice`, `GetPatronageRun`, `ListLotsByFarmer`, `GetLotHistory` | any | queries |

## Rules that bite when you add code

- **One event per transaction.** Fabric keeps only the last `SetEvent`. Functions that CONTRACT.md says emit several events emit one and list the rest in `alsoEmitted`.
- **contractapi validates answers against a schema built from the Go type.** Returned types must have no pointer fields, no maps, no `[]byte` or `json.RawMessage`, no `omitempty`, and no nil slices. `common.CheckSchemaSafe` and `metadata_test.go` check this in unit tests, because the failure otherwise only shows when a peer runs the function.
- **Never put a price, an amount, a name or a phone number in an event.** `common.Emit` refuses those keys.
- **Tests use `GOFLAGS=-mod=mod`.** `deployCC.sh` creates `vendor/` folders (gitignored) that would otherwise shadow `../common`.
- Canonical JSON and signature vectors in `testdata/` come from Node (`node --experimental-strip-types scripts/gen-chaincode-testdata.mjs`), so Go and the portals provably sign and verify the same bytes.
