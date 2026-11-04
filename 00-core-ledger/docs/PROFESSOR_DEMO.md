# Professor demo: 7 minutes, six portals, three key moments

Academic prototype, RD61003, CRDIST, IIT Kharagpur, Group 7. Ledger is live Hyperledger Fabric 2.5; external integrations are simulated.

**Status of this document (04-11-2026).** The ledger-side facts below (IDs, amounts, who is refused what) were checked against the live gateway on 04-11-2026 by read-only calls. The portal steps follow the routes in `CONTRACT.md` section 9.2 and each portal's `PROMPT.md`; the portals were not built when this was written, so re-walk every step once the portals are deployed and correct this file. The duplicate lien and the two-sided price agreement were **not** executed against the live ledger for this document (they consume a lot and an order); the e2e (`gateway/scripts/e2e-journey.ts`) covers both.

## Before you walk in (20 minutes ahead)

1. Docker Desktop running; `make resume`; `cd gateway && pnpm start`; `make tunnel` (RUNBOOK sections 1 to 3).
2. `curl https://repaying-chant-consumer.ngrok-free.dev/health -H 'ngrok-skip-browser-warning: 1'` says `"ledgerMode":"live"`.
3. On a phone using mobile data, open one portal. No amber banner means the tunnel and CORS work from outside.
4. Set Windows power to never sleep. WSL stops on sleep and the tunnel dies with it.
5. `NEXT_PUBLIC_DEMO_MODE=true` on the bank, buyer and FPO Vercel projects (the demo bar and the duplicate-attempt button need it).
6. Six tabs: 06 gov `/network`, 02 FPO, 03 bank, 04 buyer, 05 consumer, 06 gov explorer; farmer app on the phone or the web build. Log in as: `sujata.ceo`, `arindam.bank`, `rahul.buyer`, `observer.gov` (password `Setu@2026`) and `anima.das` (phone `9000000001`, OTP `123456`).
7. On the phone, check the Bengali read-aloud once. If the device has no `bn-IN` voice the app shows the text only (PROMPT 01), so install a Bengali voice in the phone's text-to-speech settings beforehand.
8. Start the screen recorder (see the last section).

## Demo data (seed of 16-10-2026; confirm each ID before the day)

| Use | ID | Verified 04-11-2026 |
|---|---|---|
| Lien demo lot | SSCC `089012340000005484`, e-NWR `ENWR-NERL-2026-004229` | in storage, no lien, 25.53 qtl, assessed value ₹16,543, eligible loan ₹11,580 |
| Spare lien lots | `...5477` / `ENWR-NERL-2026-004230` (eligible ₹8,364); `...5422` / `ENWR-NERL-2026-004232` (eligible ₹19,251) | in storage, no lien |
| Price demo order | `ORD-2026-00088` (one lot, SSCC `089012340000006863`) | status OPEN, no price yet |
| Spare open orders | `ORD-2026-00089`, `ORD-2026-00090` (three lots each) | OPEN |
| Already-priced order | `ORD-2026-00087` (SSCC `089012340000004517`) | SETTLED; price ₹853 per quintal, readable by the FPO and the Buyer only |
| Golden lot | SSCC `089012340000004517`, `WB-PSM-KGP2-POT-FPO07-2026-R-00451`, Anima Das | CLOSED, grade A, 0 cold-chain breaches |

Each live lien uses up one lot and each live price agreement uses up one order, so a rehearsal costs a spare. Plenty remain (116 lots in storage and 9 open orders on 04-11-2026).

## The script

| Time | Portal and actor | What you do | What you say |
|---|---|---|---|
| 0:00 to 0:40 | 06 gov, `/network` (public) | Show 4 orgs, 3 channels, 3 Raft orderers, the leader of each channel, and the org by channel matrix. | "This is a real Fabric network. The regulator has no seat on the trade channel, so it can never see a price." |
| 0:40 to 1:30 | 02 FPO, `sujata.ceo`, `/lots/089012340000004517` | Show the Lot Passport timeline. Click one proof chip. | "Every step has a transaction. This one opens in the explorer." |
| 1:30 to 2:00 | 06 gov, `/ledger/tx/{txId}` | Show channel, chaincode, function, block and the endorsing orgs as badges. | "FPO and Bank both endorsed this. Neither could have written it alone." |
| **2:00 to 4:00** | **MOMENT 1. 03 bank, `arindam.bank`** | `/collateral/ENWR-NERL-2026-004229`. Show the valuation (quantity times modal price, haircut, 70% LTV, eligible ₹11,580). Mark a lien for ₹11,580 and show the receipt with FpoOrgMSP and BankOrgMSP. Then press **Attempt duplicate pledge (demo)**. | "The ledger refuses a second lien. The message names the first lien's transaction. No bank on this network can lend against this receipt again until it is released." |
| 4:00 to 4:20 | 02 FPO, `/collateral/{enwr}` | Show the same lien from the FPO side. | "Same record, seen by the other party." |
| **4:20 to 6:00** | **MOMENT 2. 02 FPO (`sujata.ceo`) and 04 buyer (`rahul.buyer`) side by side** | Both open `ORD-2026-00088`. Each types a price per quintal. Show the hash being committed, then the match. Then show `ORD-2026-00087` in 06 gov as `observer.gov`: only the hash, no ₹ amount. | "The price is held privately between the two of them. Everyone else, the bank and the regulator included, sees only this hash." |
| **6:00 to 6:45** | **MOMENT 3. 01 farmer app, Anima** | Log in (OTP shown on screen). Home, then the statement for `...4517`. Press **পড়ে শোনান**. | The app speaks the numbers in Bengali. Say nothing over it. |
| 6:45 to 7:00 | 05 consumer, `/00/089012340000004517` | Scan the label QR (or open the link). | "A shopper checks the same record. No names, no phone numbers." |

Close on the 06 gov Overview if there is time left: the Month-12 gate shows 2 of 4 criteria met on 04-11-2026. Say so honestly, it is the pilot design talking.

### The statement Anima hears (checked against the live gateway)

Lot `...4517`, 2,003 kg, grade A, sold to a processor and organised retail buyer (Kolkata).

| Line | Amount |
|---|---|
| Gross | ₹17,086 |
| Hamali | ₹160 |
| Market fee | ₹171 |
| Commission | ₹1,196 |
| Transport | ₹601 |
| Cold storage rent | ₹3,405 |
| FPO margin | ₹342 |
| **Net paid** | **₹11,211** |

UPI reference `SIM 613924351894` (simulated), paid 16-10-2026. The deductions add up: 160 + 171 + 1,196 + 601 + 3,405 + 342 = 5,875, and 17,086 minus 5,875 is 11,211.

## Say these out loud, because a sharp question will find them

- **The deduction rates are not sourced.** Hamali, market fee, commission, transport and cold-storage rent are `ASSUMPTION` placeholders in `gateway/config/rates.json` (DECISIONS D20). The arithmetic is real and on-chain; the rates are indicative.
- **Residue tested will not be ticked.** No residue-test data exists, so the provenance page shows it as not tested (DECISIONS D21).
- **The payment cycle KPI is about 0 days** because the seed ran all steps within minutes. It is not a measured payment cycle.
- **The audit divergence rate was seeded above 5% on purpose** (DECISIONS D27), which is why Month-12 criterion 2 is not met.
- **The price premium KPI is empty.** No Medinipur (West) price was reported when the seed ran (DECISIONS D25).
- **Identities are custodial** (the gateway holds each user's Fabric key). A production system would use per-org HSM keys.
- **Everything outside the ledger that says "simulated" is simulated:** e-NWR issuance, UPI, eNAM, ONDC, the weighbridge and the quality meter.

## If something breaks

| Symptom | Do |
|---|---|
| Amber **Index-only** banner | The PC or tunnel dropped. Reading still works (explorer, passports, the statement, the consumer page). Writes are paused on purpose. Run `make resume`, restart the gateway and `make tunnel`; `API_URL` does not change. |
| Moment 1 or 2 cannot run live | Play the recording of that moment, then show the stored proof: the earlier lien and the `ORD-2026-00087` hash in the explorer. |
| Page loads but data is missing, only in the browser | Likely the ngrok browser-warning page (RUNBOOK section 3). Every portal `fetch` must send `ngrok-skip-browser-warning: 1`, and live updates must use fetch streaming, not `EventSource`. |
| No Bengali voice | Show the statement text, say what the app would read, and play the recording. |
| `ERR_LOT_PLEDGED` or `ERR_DOUBLE_FINANCING` on a lot you did not expect | It was used in a rehearsal. Switch to a spare from the table. |

## Recording plan (backup if anything fails)

Record on the day, before the professor arrives, at 1080p with system audio on for the phone.

1. Moment 1 as one clip: collateral view, lien receipt, rejected duplicate.
2. Moment 2 as one clip: both sides entering a price, the match, the hash-only view.
3. Moment 3 as one clip with the phone's audio: the statement read aloud.
4. One 60-second clip of the explorer: network page, a transaction with its endorsers.

Keep the clips on the demo laptop and on a phone, named `moment1-double-lien.mp4`, `moment2-private-price.mp4`, `moment3-statement.mp4`, `explorer.mp4`.
