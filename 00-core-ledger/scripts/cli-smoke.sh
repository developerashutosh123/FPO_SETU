#!/usr/bin/env bash
# CLI smoke test against the running network: the F1-F7 happy path and four negative cases (plus the state-based-endorsement check).
# Needs: make up && make deploy. Every run uses fresh random IDs, so it can be repeated.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
. "$ROOT/network/scripts/lib.sh"
ensure_env
export FABRIC_CFG_PATH="$NET_DIR/.fabric-install/config"

S=$(node --experimental-strip-types "$ROOT/scripts/smoke-crypto.mjs" "$WALLET_DIR" 2>/dev/null) || die "smoke-crypto.mjs failed (is wallet/ present?)"
j() { jq -r "$1" <<<"$S"; }
TOKEN=$(j .farmer.token); PLOT=$(j .farmer.plotId); FPUB=$(j .farmer.pubHex)
SA=$(j .lotA.sscc); HA=$(j .lotA.humanRef); SIGA=$(j .lotA.sig)
SB=$(j .lotB.sscc); HB=$(j .lotB.humanRef); SIGB=$(j .lotB.sigOfBagCount40)
n5() { printf '%05d' $((RANDOM % 90000 + 10000)); }
ORD="ORD-2026-$(n5)"; DEP="DEP-2026-$(n5)"; LIEN="LIEN-2026-$(n5)"; LOAN="LN-2026-$(n5)"; LIEN2="LIEN-2026-$(n5)"; LOAN2="LN-2026-$(n5)"
ENWR="ENWR-NERL-2026-$(printf '%06d' $((RANDOM * 10 + RANDOM % 10 + 100000)))"; RUN="PR-2026-11-$(printf '%03d' $((RANDOM % 900 + 100)))"
SALT=$(openssl rand -hex 16); PRICE=1580

PASS=0; FAILS=0; ROWS=()
ok()   { PASS=$((PASS+1)); printf '  \033[32mPASS\033[0m %s\n' "$1"; }
bad()  { FAILS=$((FAILS+1)); printf '  \033[31mFAIL\033[0m %s\n' "$1"; }
as() { # <org> <identity>
  export CORE_PEER_TLS_ENABLED=true CORE_PEER_LOCALMSPID="${MSPID[$1]}" CORE_PEER_TLS_ROOTCERT_FILE="$(peer_dir "$1")/tls/ca.crt"
  export CORE_PEER_MSPCONFIGPATH="$ORG_DIR/peerOrganizations/$1.setu.local/users/$2/msp" CORE_PEER_ADDRESS="localhost:${PEERPORT[$1]}"
}
peers_for() { local a=(); for o in $1; do a+=(--peerAddresses "localhost:${PEERPORT[$o]}" --tlsRootCertFiles "$(peer_dir "$o")/tls/ca.crt"); done; printf '%s\n' "${a[@]}"; }
LAST=""; LASTTX=""
# inv <org> <identity> <channel> <chaincode> "<endorser orgs>" <function> '<args json array>' ['<transient json>' <transient key>]
inv() {
  local org=$1 id=$2 ch=$3 cc=$4 end=$5 fn=$6 args=$7 tjson=${8:-} tkey=${9:-}
  as "$org" "$id"
  local -a pargs; mapfile -t pargs < <(peers_for "$end")
  local -a targs=(); [ -n "$tjson" ] && targs=(--transient "$(jq -nc --arg k "$tkey" --arg v "$(printf %s "$tjson" | base64 -w0)" '{($k):$v}')")
  LAST=$(peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride "orderer1.$ORDERER_DOMAIN" --tls --cafile "$ORD_TLSCA" \
    -C "$ch" -n "$cc" "${pargs[@]}" -c "$(jq -nc --arg f "$fn" --argjson a "$args" '{function:$f,Args:$a}')" "${targs[@]}" --waitForEvent --waitForEventTimeout 60s 2>&1)
  LASTTX=$(sed -n 's/.*txid \[\([0-9a-f]*\)\].*/\1/p' <<<"$LAST" | head -1)
}
qry() { # <org> <identity> <channel> <chaincode> <function> '<args json>'
  as "$1" "$2"
  LAST=$(peer chaincode query -C "$3" -n "$4" -c "$(jq -nc --arg f "$5" --argjson a "$6" '{function:$f,Args:$a}')" 2>&1)
}
step() { # <label> ...inv args   expects success
  local label=$1; shift; inv "$@"
  if grep -q 'Chaincode invoke successful' <<<"$LAST" && grep -q 'committed with status (VALID)' <<<"$LAST"; then
    ok "$label"; ROWS+=("$(printf '%-52s %s' "$label" "$LASTTX")")
  else bad "$label"; echo "$LAST" | grep -E 'Error|message' | head -3 | sed 's/^/        /'; fi
}
negative() { # <label> <expected text> ...inv args
  local label=$1 want=$2; shift 2; inv "$@"
  if ! grep -q 'Chaincode invoke successful' <<<"$LAST" && grep -q "$want" <<<"$LAST"; then
    ok "$label -> $want"; ROWS+=("$(printf '%-52s %s' "NEGATIVE: $label" "${LASTTX:-(rejected, no tx committed)}")")
  else bad "$label (wanted $want)"; echo "$LAST" | tail -3 | sed 's/^/        /'; fi
}
expect() { # <label> <query output must contain>
  if grep -q "$2" <<<"$LAST"; then ok "$1"; else bad "$1 (wanted: $2)"; echo "$LAST" | head -3 | sed 's/^/        /'; fi
}

TR=trace-channel; FI=finance-channel; TD=trade-channel
M3="fpo bank regulator"      # 3 of 4 endorsers on trace-channel without the buyer
M3B="fpo buyer bank"         # 3 of 4 including FPO and Buyer
echo "run ids: farmer $TOKEN lot $SA order $ORD loan $LOAN"

echo "== setup: register device keys (the enrolled WB-CHG-01 and QM-CHG-01 keys)"
step "register weighbridge key"   fpo sujata.ceo $TR lot-lifecycle "$M3" RegisterDevice "$(jq -nc --arg i WB-CHG-01 --arg k "$(j .devices.wb.pubHex)" '[$i,$k,"weighbridge"]')"
step "register quality meter key" fpo sujata.ceo $TR lot-lifecycle "$M3" RegisterDevice "$(jq -nc --arg i QM-CHG-01 --arg k "$(j .devices.qm.pubHex)" '[$i,$k,"quality"]')"

echo "== F1 onboarding, F2 commissioning with the farmer's signature"
step "F1 RegisterFarmerAndPlot (VLE Subhankar)" fpo subhankar.vle $TR lot-lifecycle "$M3" RegisterFarmerAndPlot "$(jq -nc --arg t "$TOKEN" --arg k "$FPUB" --arg c "$(j .farmer.consentHash)" --arg p "$PLOT" --arg h "$(j .farmer.polygonHash)" '[$t,$k,$c,$p,$h]')"
negative "F2 commission with a tampered bag count" ERR_BAD_FARMER_SIGNATURE fpo subhankar.vle $TR lot-lifecycle "$M3" CommissionLot \
  "$(jq -nc --arg s "$SB" --arg h "$HB" --arg t "$TOKEN" --arg p "$PLOT" --arg sig "$SIGB" '[$s,$h,$t,$p,"POTATO","Kufri Jyoti","CHANGUAL","41","2050","2026-11-02",$sig]')"
step "F2 CommissionLot (signature verified in Go)" fpo subhankar.vle $TR lot-lifecycle "$M3" CommissionLot \
  "$(jq -nc --arg s "$SA" --arg h "$HA" --arg t "$TOKEN" --arg p "$PLOT" --arg sig "$SIGA" '[$s,$h,$t,$p,"POTATO","Kufri Jyoti","CHANGUAL","40","2000","2026-11-02",$sig]')"

echo "== F3 device-attested grading"
negative "F3 weighbridge reading changed after signing" ERR_BAD_DEVICE_SIGNATURE fpo debasis.ops $TR lot-lifecycle "$M3" AttestQuality \
  "$(jq -nc --arg s "$SA" --arg w "$(j .readings.wbForged)" --arg ws "$(j .readings.wbForgedSigFromOriginal)" --arg q "$(j .readings.qm)" --arg qs "$(j .readings.qmSig)" '[$s,$w,$ws,$q,$qs,"A"]')"
step "F3 AttestQuality (both device signatures verified)" fpo debasis.ops $TR lot-lifecycle "$M3" AttestQuality \
  "$(jq -nc --arg s "$SA" --arg w "$(j .readings.wb)" --arg ws "$(j .readings.wbSig)" --arg q "$(j .readings.qm)" --arg qs "$(j .readings.qmSig)" '[$s,$w,$ws,$q,$qs,"A"]')"

echo "== storage and e-NWR"
step "RecordDeposit on finance-channel (reads lot on trace-channel)" fpo ratan.store $FI pledge-lien "fpo bank" RecordDeposit "$(jq -nc --arg d "$DEP" --arg s "$SA" '[$d,$s,"COLD_STORAGE","Rupnarayan Cold Storage (demo)","40","2026-11-05"]')"
step "mirror: SetInStorage on trace-channel" fpo ratan.store $TR lot-lifecycle "$M3" SetInStorage "$(jq -nc --arg s "$SA" --arg d "$DEP" '[$s,"COLD_STORAGE",$d]')"
step "IssueENWRRef" fpo ratan.store $FI pledge-lien "fpo bank" IssueENWRRef "$(jq -nc --arg d "$DEP" --arg e "$ENWR" '[$d,$e,"NERL"]')"

echo "== F5 lien and loan (terms in loanTermsPDC)"
TERMS=$(jq -nc --arg s "$(openssl rand -hex 12)" '{amount:21700,tenureDays:180,ratePct:9.5,salt:$s}')
step "F5 MarkLien (bank Arindam, terms via transient map)" bank arindam.bank $FI pledge-lien "fpo bank" MarkLien "$(jq -nc --arg l "$LIEN" --arg e "$ENWR" --arg n "$LOAN" '[$l,$e,$n]')" "$TERMS" loanTerms
FIRSTLIEN=$LASTTX
step "mirror: SetPledged(true)" fpo ratan.store $TR lot-lifecycle "$M3" SetPledged "$(jq -nc --arg s "$SA" --arg l "$LIEN" '[$s,"true",$l]')"
negative "second lien on the same e-NWR (double financing)" ERR_DOUBLE_FINANCING bank arindam.bank $FI pledge-lien "fpo bank" MarkLien "$(jq -nc --arg l "$LIEN2" --arg e "$ENWR" --arg n "$LOAN2" '[$l,$e,$n]')" "$TERMS" loanTerms
if [ -n "$FIRSTLIEN" ] && grep -q "$FIRSTLIEN" <<<"$LAST"; then ok "the rejection quotes the first lien's tx $FIRSTLIEN"; else bad "rejection should quote $FIRSTLIEN"; fi
negative "pledged lot cannot be proposed for custody" ERR_LOT_PLEDGED fpo debasis.ops $TR lot-lifecycle "$M3" ProposeTransfer "$(jq -nc --arg s "$SA" '[$s,"BuyerOrgMSP","WB74A1234","BLE-01"]')"
qry regulator observer.gov $FI pledge-lien GetLoanTerms "$(jq -nc --arg l "$LOAN" '[$l]')"
expect "NEGATIVE: Regulator reads loanTermsPDC -> ERR_FORBIDDEN_ORG" ERR_FORBIDDEN_ORG
ROWS+=("$(printf '%-52s %s' 'NEGATIVE: Regulator reads loanTermsPDC' '(query, no tx)')")
qry regulator observer.gov $FI pledge-lien GetLoanTermsHash "$(jq -nc --arg l "$LOAN" '[$l]')"
if grep -Eq '[0-9a-f]{64}' <<<"$LAST"; then ok "the Regulator can see the terms HASH on its own peer (and nothing else)"; else bad "Regulator should see the terms hash"; echo "$LAST" | head -2; fi
qry bank arindam.bank $FI pledge-lien GetLoanTerms "$(jq -nc --arg l "$LOAN" '[$l]')"
expect "the Bank reads the terms" '"amount":21700'
step "RecordDisbursement" bank arindam.bank $FI pledge-lien "fpo bank" RecordDisbursement "$(jq -nc --arg l "$LOAN" '[$l]')"

echo "== order and F6 private price agreement (the lot is still pledged: listing and selling are allowed, dispatch is not)"
step "CreateOrder on trade-channel (buyer Rahul)" buyer rahul.buyer $TD order-settlement "fpo buyer" CreateOrder "$(jq -nc --arg o "$ORD" --arg s "$(jq -nc --arg s "$SA" '[$s]')" '[$o,$s,"DIRECT","2026-11-18"]')"
step "mirror: SetListed" fpo sujata.ceo $TR lot-lifecycle "$M3" SetListed "$(jq -nc --arg s "$SA" --arg o "$ORD" '[$s,$o]')"
HASH=$(printf '%s' "$(node --experimental-strip-types -e "import {canonicalJson} from '$ROOT/../shared/contract.ts'; process.stdout.write(canonicalJson({orderId:'$ORD',pricePerQtl:$PRICE,salt:'$SALT'}))")" | sha256sum | cut -d' ' -f1)
PT=$(jq -nc --arg s "$SALT" --argjson p $PRICE '{pricePerQtl:$p,salt:$s}')
step "F6 AgreePrice step 1 (FPO CEO)" fpo sujata.ceo $TD order-settlement "fpo buyer" AgreePrice "$(jq -nc --arg o "$ORD" --arg h "$HASH" '[$o,$h]')" "$PT" price
BADPT=$(jq -nc --arg s "$SALT" '{pricePerQtl:1650,salt:$s}')
BADHASH=$(printf '%s' "$(node --experimental-strip-types -e "import {canonicalJson} from '$ROOT/../shared/contract.ts'; process.stdout.write(canonicalJson({orderId:'$ORD',pricePerQtl:1650,salt:'$SALT'}))")" | sha256sum | cut -d' ' -f1)
negative "F6 buyer submits a different price" ERR_PRICE_HASH_MISMATCH buyer rahul.buyer $TD order-settlement "fpo buyer" AgreePrice "$(jq -nc --arg o "$ORD" --arg h "$BADHASH" '[$o,$h]')" "$BADPT" price
step "F6 AgreePrice step 2 (Buyer, same price)" buyer rahul.buyer $TD order-settlement "fpo buyer" AgreePrice "$(jq -nc --arg o "$ORD" --arg h "$HASH" '[$o,$h]')" "$PT" price
qry fpo sujata.ceo $TD order-settlement GetOrder "$(jq -nc --arg o "$ORD" '[$o]')"
expect "public order carries the hash, status PRICE_AGREED" "\"status\":\"PRICE_AGREED\""
if grep -q "$PRICE" <<<"$LAST"; then bad "the public order must not contain the price"; else ok "the public order does not contain the price"; fi
qry fpo sujata.ceo $TD order-settlement GetOrderPrice "$(jq -nc --arg o "$ORD" '[$o]')"
expect "FPO reads the price from tradePricePDC" "\"pricePerQtl\":$PRICE"
step "mirror: SetSold (price hash only)" fpo sujata.ceo $TR lot-lifecycle "$M3" SetSold "$(jq -nc --arg s "$SA" --arg o "$ORD" --arg h "$HASH" '[$s,$o,$h]')"

echo "== lien repaid and released after the sale (journey step 8), then dispatch"
negative "sold lot with an active lien cannot be dispatched" ERR_LOT_PLEDGED fpo debasis.ops $TR lot-lifecycle "$M3" ProposeTransfer "$(jq -nc --arg s "$SA" '[$s,"BuyerOrgMSP","WB74A1234","BLE-01"]')"
step "RecordRepayment (amount in transient map)" bank arindam.bank $FI pledge-lien "fpo bank" RecordRepayment "$(jq -nc --arg l "$LOAN" '[$l]')" '{"amount":21700}' repayment
step "ReleaseLien" bank arindam.bank $FI pledge-lien "fpo bank" ReleaseLien "$(jq -nc --arg l "$LOAN" '[$l]')"
step "mirror: SetPledged(false)" fpo ratan.store $TR lot-lifecycle "$M3" SetPledged '["'"$SA"'","false",""]'

echo "== F4 custody with state-based endorsement"
step "F4 ProposeTransfer to BuyerOrgMSP (sets two-org endorsement policy)" fpo debasis.ops $TR lot-lifecycle "$M3" ProposeTransfer "$(jq -nc --arg s "$SA" '[$s,"BuyerOrgMSP","WB74A1234","BLE-01"]')"
step "AnchorConditionDigest" fpo debasis.ops $TR lot-lifecycle "$M3B" AnchorConditionDigest "$(jq -nc --arg s "$SA" --arg h "$(j .hashes.digest)" '[$s,"2026-11-12T06:00Z/2026-11-13T04:00Z","2.1","6.4","4.1","0",$h]')"
negative "FPO tries to accept its own transfer (unilateral)" ERR_UNILATERAL_CUSTODY fpo sujata.ceo $TR lot-lifecycle "$M3B" AcceptTransfer "$(jq -nc --arg s "$SA" '[$s]')"
# 3 of 4 orgs endorse (chaincode policy satisfied) but the FPO is missing, so the lot key's own policy (FPO and Buyer) must reject it at commit
negative "buyer accepts with endorsements from buyer+bank+regulator only (state-based policy)" ENDORSEMENT_POLICY_FAILURE buyer rahul.buyer $TR lot-lifecycle "buyer bank regulator" AcceptTransfer "$(jq -nc --arg s "$SA" '[$s]')"
step "F4 AcceptTransfer by the Buyer (FPO and Buyer endorse)" buyer rahul.buyer $TR lot-lifecycle "$M3B" AcceptTransfer "$(jq -nc --arg s "$SA" '[$s]')"

echo "== delivery, settlement, F7 patronage"
step "AcceptQuality on trade-channel (reads lot DELIVERED)" buyer rahul.buyer $TD order-settlement "fpo buyer" AcceptQuality "$(jq -nc --arg o "$ORD" '[$o,"true",""]')"
step "mirror: RecordQualityOutcome" buyer rahul.buyer $TR lot-lifecycle "$M3B" RecordQualityOutcome "$(jq -nc --arg s "$SA" '[$s,"true"]')"
AMOUNT=$(( (196400 * PRICE + 5000) / 10000 ))   # 19.64 qtl x price, rounded
ST=$(jq -nc --argjson a "$AMOUNT" '{amount:$a,upiRef:"604512339876"}')
step "RecordSettlement (amount in transient map)" fpo sujata.ceo $TD order-settlement "fpo buyer" RecordSettlement "$(jq -nc --arg o "$ORD" '[$o]')" "$ST" settlement
# FPO + bank + regulator only: if the two-org policy were still on the lot key this would be rejected
step "mirror: SetSettled endorsed WITHOUT the buyer (proves the policy was released)" fpo sujata.ceo $TR lot-lifecycle "$M3" SetSettled "$(jq -nc --arg s "$SA" '[$s]')"
H=177; C=465; M=620; NET=$((AMOUNT - H - C - M))
LINES=$(jq -nc --arg t "$TOKEN" --arg s "$SA" --argjson g "$AMOUNT" --argjson n "$NET" --argjson h $H --argjson c $C --argjson m $M '[{farmerToken:$t,sscc:$s,kg:1964,gross:$g,deductions:[{type:"HAMALI",amount:$h},{type:"COMMISSION",amount:$c},{type:"FPO_MARGIN",amount:$m}],net:$n}]')
negative "F7 patronage vector off by 50 rupees" ERR_PATRONAGE_UNBALANCED fpo sujata.ceo $TR lot-lifecycle "$M3" DistributePatronage "$(jq -nc --arg r "$RUN" --arg o "$ORD" --argjson a "$AMOUNT" --arg l "$(jq -c ".[0].net += 50" <<<"$LINES")" '[$r,$o,($a|tostring),$l]')"
step "F7 DistributePatronage (reconciles, no price per kg)" fpo sujata.ceo $TR lot-lifecycle "$M3" DistributePatronage "$(jq -nc --arg r "$RUN" --arg o "$ORD" --argjson a "$AMOUNT" --arg l "$LINES" '[$r,$o,($a|tostring),$l]')"

echo "== final state"
qry fpo sujata.ceo $TR lot-lifecycle GetLot "$(jq -nc --arg s "$SA" '[$s]')"
expect "lot is CLOSED" '"status":"CLOSED"'
if grep -Eq '"price(PerQtl|PerKg)?"' <<<"$LAST"; then bad "lot state must not hold a price"; else ok "lot state holds no price"; fi
qry bank arindam.bank $TR lot-lifecycle GetLot "$(jq -nc --arg s "$SA" '[$s]')"
expect "the Bank sees the same lot on trace-channel" '"status":"CLOSED"'
as regulator observer.gov
if peer channel list 2>/dev/null | grep -qx trade-channel; then bad "the Regulator must not be on trade-channel"; else ok "the Regulator is not on trade-channel (it can never see a price)"; fi

echo; echo "== transaction IDs"; printf '%s\n' "${ROWS[@]}"
echo; echo "smoke test: $PASS passed, $FAILS failed"
[ "$FAILS" -eq 0 ]
