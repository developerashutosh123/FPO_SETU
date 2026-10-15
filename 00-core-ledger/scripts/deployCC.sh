#!/usr/bin/env bash
# Chaincode lifecycle for the three FPO-SETU chaincodes: vendor, package, install on the relevant peers, approve for every
# channel org, check commit readiness, commit, and start the chaincode with a query. Idempotent: an unchanged chaincode is skipped;
# changed source gets a new package label and the next sequence number.
#   scripts/deployCC.sh                 all three
#   scripts/deployCC.sh pledge-lien     one
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
. "$ROOT/network/scripts/lib.sh"
ensure_env
VERSION=1.0
PKG_DIR="$NET_DIR/channel-artifacts/packages"; mkdir -p "$PKG_DIR"

# name | channel | orgs that install | endorsement policy | collections config
declare -A CHAN=([lot-lifecycle]=trace-channel [pledge-lien]=finance-channel [order-settlement]=trade-channel)
declare -A INSTALL=([lot-lifecycle]="fpo bank buyer regulator" [pledge-lien]="fpo bank regulator" [order-settlement]="fpo buyer")
declare -A POLICY=(
  [lot-lifecycle]="OutOf(3,'FpoOrgMSP.peer','BankOrgMSP.peer','BuyerOrgMSP.peer','RegulatorOrgMSP.peer')"
  [pledge-lien]="AND('FpoOrgMSP.peer','BankOrgMSP.peer')"
  [order-settlement]="AND('FpoOrgMSP.peer','BuyerOrgMSP.peer')")
declare -A COLL=([lot-lifecycle]="" [pledge-lien]="$ROOT/chaincode/pledge-lien/collections_config.json" [order-settlement]="$ROOT/chaincode/order-settlement/collections_config.json")
ORDERER_ARGS=(-o localhost:7050 --ordererTLSHostnameOverride "orderer1.$ORDERER_DOMAIN" --tls --cafile "$ORD_TLSCA")

digest() { # source digest of the chaincode and the shared module, tests and mocks excluded
  (cd "$ROOT/chaincode" && find "$1" common -type f \( -name '*.go' -o -name go.mod -o -name go.sum -o -name collections_config.json \) \
     -not -name '*_test.go' -not -path '*/vendor/*' -not -path 'common/mocks/*' -not -path 'common/testkit/*' | sort | xargs sha256sum | sha256sum | cut -c1-12)
}
installed_id() { peer lifecycle chaincode queryinstalled 2>/dev/null | sed -n "s/^Package ID: \(${1}:[0-9a-f]*\), Label: ${1}\$/\1/p" | head -1; }

deploy() {
  local name=$1 ch=${CHAN[$1]}
  local dg label pkg
  dg=$(digest "$name"); label="${name}_${VERSION}-${dg}"; pkg="$PKG_DIR/$label.tar.gz"
  log "== $name on $ch (label $label)"

  # current committed sequence and the package the first org has approved at it
  use_peer fpo
  local seq=0 committed approved=""
  if committed=$(peer lifecycle chaincode querycommitted -C "$ch" -n "$name" 2>/dev/null); then
    seq=$(sed -n 's/.*Sequence: \([0-9]*\),.*/\1/p' <<<"$committed" | head -1)
    approved=$(peer lifecycle chaincode queryapproved -C "$ch" -n "$name" --sequence "$seq" 2>/dev/null | sed -n 's/.*package-id: \([^,]*\),.*/\1/p')
  fi
  if [ "$seq" -gt 0 ] && [[ "$approved" == "${label}:"* ]]; then log "$name is committed at sequence $seq with the current source; nothing to do"; return; fi

  if [ ! -f "$pkg" ]; then
    log "vendoring and packaging $name"
    (cd "$ROOT/chaincode/$name" && GOFLAGS=-mod=mod go mod vendor)
    peer lifecycle chaincode package "$pkg" --path "$ROOT/chaincode/$name" --lang golang --label "$label"
  fi

  local org id
  for org in ${INSTALL[$name]}; do
    use_peer "$org"
    id=$(installed_id "$label")
    if [ -z "$id" ]; then
      log "installing on peer0.$org (builds the chaincode image, this takes a minute)"
      peer lifecycle chaincode install "$pkg" >/dev/null 2>&1 || { sleep 5; peer lifecycle chaincode install "$pkg" 2>&1 | tail -3; }
      id=$(installed_id "$label")
    fi
    [ -n "$id" ] || die "package $label did not install on peer0.$org"
  done
  local next=$((seq + 1))

  local collargs=(); [ -n "${COLL[$name]}" ] && collargs=(--collections-config "${COLL[$name]}")
  for org in ${CHANNEL_ORGS[$ch]}; do
    use_peer "$org"
    local oid; oid=$(installed_id "$label")
    log "peer0.$org approves $name sequence $next"
    peer lifecycle chaincode approveformyorg "${ORDERER_ARGS[@]}" --channelID "$ch" --name "$name" --version "$VERSION" --package-id "$oid" \
      --sequence "$next" --signature-policy "${POLICY[$name]}" "${collargs[@]}" >/dev/null 2>&1 \
      || peer lifecycle chaincode approveformyorg "${ORDERER_ARGS[@]}" --channelID "$ch" --name "$name" --version "$VERSION" --package-id "$oid" \
           --sequence "$next" --signature-policy "${POLICY[$name]}" "${collargs[@]}" 2>&1 | tail -5
  done

  use_peer fpo
  log "commit readiness"
  for i in $(seq 1 20); do
    ready=$(peer lifecycle chaincode checkcommitreadiness --channelID "$ch" --name "$name" --version "$VERSION" --sequence "$next" \
      --signature-policy "${POLICY[$name]}" "${collargs[@]}" --output json 2>/dev/null || echo '{}')
    n=$(jq -r '[.approvals[]?] | map(select(.)) | length' <<<"$ready" 2>/dev/null || echo 0)
    [ "$n" = "$(wc -w <<<"${CHANNEL_ORGS[$ch]}")" ] && break; sleep 2
  done
  jq -c '.approvals' <<<"$ready"

  local peers=()
  for org in ${CHANNEL_ORGS[$ch]}; do peers+=(--peerAddresses "localhost:${PEERPORT[$org]}" --tlsRootCertFiles "$(peer_dir "$org")/tls/ca.crt"); done
  log "committing $name sequence $next on $ch"
  peer lifecycle chaincode commit "${ORDERER_ARGS[@]}" --channelID "$ch" --name "$name" --version "$VERSION" --sequence "$next" \
    --signature-policy "${POLICY[$name]}" "${collargs[@]}" "${peers[@]}" 2>&1 | tail -2
  for i in $(seq 1 30); do peer lifecycle chaincode querycommitted -C "$ch" -n "$name" >/dev/null 2>&1 && break; sleep 1; done
  peer lifecycle chaincode querycommitted -C "$ch" -n "$name"
}

targets=("$@"); [ ${#targets[@]} -eq 0 ] && targets=(lot-lifecycle pledge-lien order-settlement)
for t in "${targets[@]}"; do [ -n "${CHAN[$t]:-}" ] || die "unknown chaincode $t"; deploy "$t"; done
log "chaincode deployment finished"
