#!/usr/bin/env bash
# Creates channel genesis blocks, joins the orderer (osnadmin) and the peers, sets anchor peers. Idempotent.
# Fabric 2.5 has no system channel: each channel is created by joining its genesis block to the orderer.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

gen_blocks() {
  mkdir -p "$ART_DIR"
  for ch in "${CHANNELS[@]}"; do
    if [ ! -f "$ART_DIR/$ch.block" ]; then
      log "configtxgen: $ch (${CHANNEL_PROFILE[$ch]})"
      FABRIC_CFG_PATH="$NET_DIR/configtx" configtxgen -profile "${CHANNEL_PROFILE[$ch]}" -channelID "$ch" -outputBlock "$ART_DIR/$ch.block" >/dev/null 2>&1 \
        || FABRIC_CFG_PATH="$NET_DIR/configtx" configtxgen -profile "${CHANNEL_PROFILE[$ch]}" -channelID "$ch" -outputBlock "$ART_DIR/$ch.block"
    fi
  done
}

wait_orderer() {
  for o in "${ORDERERS[@]}"; do
    for i in $(seq 1 60); do OSN_NODE=$o osn_json channel list | jq -e . >/dev/null 2>&1 && continue 2; sleep 1; done
    die "$o admin endpoint did not come up"
  done
}

join_orderer() {
  for o in "${ORDERERS[@]}"; do
    local have; have=$(OSN_NODE=$o osn_json channel list | jq -r '.channels[]?.name')
    for ch in "${CHANNELS[@]}"; do
      if grep -qx "$ch" <<<"$have"; then log "$o already has $ch"; continue; fi
      log "$o joins $ch"
      OSN_NODE=$o osn channel join --channelID "$ch" --config-block "$ART_DIR/$ch.block" >/dev/null || die "osnadmin join $ch on $o failed"
    done
  done
}

wait_peer() { # <org>
  for i in $(seq 1 90); do curl -s "http://localhost:${OPSPORT[$1]}/healthz" | grep -q '"status":"OK"' && return 0; sleep 1; done
  die "peer0.$1 did not become healthy"
}

join_peers() {
  for ch in "${CHANNELS[@]}"; do
    for org in ${CHANNEL_ORGS[$ch]}; do
      use_peer "$org"; wait_peer "$org"
      if peer channel list 2>/dev/null | grep -qx "$ch"; then log "peer0.$org already on $ch"; continue; fi
      log "peer0.$org joins $ch"
      # a freshly restarted peer may not list its channels yet; "already exists" then means the join is done
      for try in 1 2 3 4 5; do
        out=$(peer channel join -b "$ART_DIR/$ch.block" 2>&1) && break
        grep -q "already exists" <<<"$out" && break
        sleep 2; [ "$try" = 5 ] && { echo "$out" >&2; die "peer0.$org join $ch failed"; }
      done
    done
  done
}

anchor() { # <channel> <org>
  local ch=$1 org=$2 msp=${MSPID[$2]} t; t=$(mktemp -d)
  use_peer "$org"
  # after a restart the orderer needs a few seconds to elect its Raft leader again
  local ok=0
  for try in $(seq 1 30); do
    peer channel fetch config "$t/config_block.pb" -o localhost:7050 --ordererTLSHostnameOverride "orderer1.$ORDERER_DOMAIN" -c "$ch" --tls --cafile "$ORD_TLSCA" >/dev/null 2>&1 && { ok=1; break; }
    sleep 2
  done
  [ "$ok" = 1 ] || die "fetch config $ch failed after 60 s"
  configtxlator proto_decode --input "$t/config_block.pb" --type common.Block --output "$t/block.json"
  jq '.data.data[0].payload.data.config' "$t/block.json" > "$t/config.json"
  if jq -e ".channel_group.groups.Application.groups.\"$msp\".values.AnchorPeers" "$t/config.json" >/dev/null; then log "anchor peer for $org on $ch already set"; rm -rf "$t"; return; fi
  log "setting anchor peer for $org on $ch"
  jq ".channel_group.groups.Application.groups.\"$msp\".values += {\"AnchorPeers\":{\"mod_policy\":\"Admins\",\"value\":{\"anchor_peers\":[{\"host\":\"peer0.$org.setu.local\",\"port\":${PEERPORT[$org]}}]},\"version\":\"0\"}}" "$t/config.json" > "$t/modified.json"
  configtxlator proto_encode --input "$t/config.json" --type common.Config --output "$t/config.pb"
  configtxlator proto_encode --input "$t/modified.json" --type common.Config --output "$t/modified.pb"
  configtxlator compute_update --channel_id "$ch" --original "$t/config.pb" --updated "$t/modified.pb" --output "$t/update.pb"
  configtxlator proto_decode --input "$t/update.pb" --type common.ConfigUpdate --output "$t/update.json"
  jq -n --argjson u "$(cat "$t/update.json")" --arg ch "$ch" '{payload:{header:{channel_header:{channel_id:$ch,type:2}},data:{config_update:$u}}}' > "$t/envelope.json"
  configtxlator proto_encode --input "$t/envelope.json" --type common.Envelope --output "$t/envelope.pb"
  peer channel update -f "$t/envelope.pb" -c "$ch" -o localhost:7050 --ordererTLSHostnameOverride "orderer1.$ORDERER_DOMAIN" --tls --cafile "$ORD_TLSCA" >/dev/null 2>&1 || die "anchor update $ch/$org failed"
  rm -rf "$t"
}

set_anchors() { for ch in "${CHANNELS[@]}"; do for org in ${CHANNEL_ORGS[$ch]}; do anchor "$ch" "$org"; done; done; }

case "${1:-all}" in
  blocks) gen_blocks ;;
  orderer) wait_orderer; join_orderer ;;
  peers) join_peers ;;
  anchors) set_anchors ;;
  all) gen_blocks; wait_orderer; join_orderer; join_peers; set_anchors ;;
  *) die "usage: channels.sh [blocks|orderer|peers|anchors|all]" ;;
esac
