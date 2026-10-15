#!/usr/bin/env bash
# FPO-SETU Fabric network control. Full profile: 3 Raft orderers, 4 peers (LevelDB), 5 CAs.
#   network.sh up        create everything that is missing and start it (idempotent)
#   network.sh resume    restart stopped containers on existing volumes, verify (idempotent)
#   network.sh down      stop and remove containers, keep volumes and crypto material
#   network.sh reset     remove containers, volumes, crypto material, wallet and chaincode containers
#   network.sh status    peers, channels, orderer, Raft leader, resource use
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

cmd_up() {
  command -v docker >/dev/null || die "docker not found"
  ensure_binaries; ensure_env
  log "starting certificate authorities"
  dc up -d ca.fpo.setu.local ca.bank.setu.local ca.buyer.setu.local ca.regulator.setu.local ca.orderer.setu.local
  "$NET_DIR/scripts/enroll.sh"
  "$NET_DIR/scripts/channels.sh" blocks
  log "starting orderer and peers"
  dc up -d orderer1.setu.local orderer2.setu.local orderer3.setu.local peer0.fpo.setu.local peer0.bank.setu.local peer0.buyer.setu.local peer0.regulator.setu.local
  "$NET_DIR/scripts/channels.sh" orderer
  "$NET_DIR/scripts/channels.sh" peers
  "$NET_DIR/scripts/channels.sh" anchors
  log "network is up"; cmd_status
}
cmd_resume() { cmd_up; }
cmd_down() { ensure_env; dc down --remove-orphans; log "containers removed; volumes and crypto kept"; }
cmd_reset() {
  ensure_env 2>/dev/null || true
  [ -f "$NET_DIR/.env" ] && dc down -v --remove-orphans || true
  docker ps -aq --filter "name=dev-peer" | xargs -r docker rm -f >/dev/null
  docker images -q "dev-peer*" | xargs -r docker rmi -f >/dev/null || true
  # crypto written by the host user, so plain rm works
  rm -rf "$ORG_DIR" "$ART_DIR" "$WALLET_DIR" "$NET_DIR/.env"
  log "network reset (CA data, ledgers, crypto, wallet and chaincode images removed)"
}
cmd_status() {
  ensure_env
  echo "== containers"; dc ps --format 'table {{.Name}}\t{{.State}}\t{{.Status}}' 2>/dev/null || true
  echo; echo "== peers: channels joined and ledger height"
  for org in "${ORGS[@]}"; do
    use_peer "$org"
    printf 'peer0.%s.setu.local (%s):\n' "$org" "${MSPID[$org]}"
    chs=$(peer channel list 2>/dev/null | sed -n '/Channels peers has joined/,$p' | tail -n +2 || true)
    [ -z "$chs" ] && { echo "  (not reachable or no channels)"; continue; }
    for c in $chs; do printf '  %-16s height=%s\n' "$c" "$(peer channel getinfo -c "$c" 2>/dev/null | sed 's/^Blockchain info: //' | jq -r .height 2>/dev/null || echo '?')"; done
  done
  echo; echo "== orderers (osnadmin channel list per node)"
  for o in "${ORDERERS[@]}"; do
    printf '%s:\n' "$o"
    for c in "${CHANNELS[@]}"; do OSN_NODE=$o osn_json channel list --channelID "$c" | jq -c '{name,consensusRelation,status,height}' 2>/dev/null | sed 's/^/  /' || echo "  (not reachable)"; done
  done
  echo; echo "== Raft leader per channel (orderer metrics: is_leader=1 marks the leader)"
  for o in "${ORDERERS[@]}"; do
    curl -s "localhost:${ORD_OPS_PORT[$o]}/metrics" 2>/dev/null | grep -E '^consensus_etcdraft_is_leader' | sed "s/^/  $o /" || echo "  $o (metrics not reachable)"
  done
  echo "  cluster_size: $(curl -s localhost:9443/metrics 2>/dev/null | grep -E '^consensus_etcdraft_cluster_size' | head -1)"
  echo; echo "== docker stats"; docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}' $(dc ps -q 2>/dev/null) 2>/dev/null || true
}
case "${1:-}" in
  up) cmd_up ;; resume) cmd_resume ;; down) cmd_down ;; reset) cmd_reset ;; status) cmd_status ;;
  *) echo "usage: network.sh up|resume|down|reset|status"; exit 2 ;;
esac
