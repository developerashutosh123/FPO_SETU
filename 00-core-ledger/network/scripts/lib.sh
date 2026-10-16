#!/usr/bin/env bash
# Shared settings and helpers for the network scripts. Source, do not execute.
NET_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(cd "$NET_DIR/.." && pwd)"
export PATH="$NET_DIR/.fabric-install/bin:$PATH"
ORG_DIR="$NET_DIR/organizations"
ART_DIR="$NET_DIR/channel-artifacts"
# Fixed location. It is NOT read from the environment: a WALLET_DIR exported by the gateway .env (a relative path) once sent a rebuild
# to the wrong folder and the keys ended up in a commit.
WALLET_DIR="$ROOT_DIR/wallet"
FABRIC_VERSION=2.5.16
FABRIC_CA_VERSION=1.5.22

ORGS=(fpo bank buyer regulator)
declare -A MSPID=([fpo]=FpoOrgMSP [bank]=BankOrgMSP [buyer]=BuyerOrgMSP [regulator]=RegulatorOrgMSP)
declare -A CAPORT=([fpo]=7054 [bank]=8054 [buyer]=9054 [regulator]=10054 [orderer]=11054)
declare -A PEERPORT=([fpo]=7051 [bank]=9051 [buyer]=11051 [regulator]=13051)
declare -A OPSPORT=([fpo]=9444 [bank]=9445 [buyer]=9446 [regulator]=9447)
CHANNELS=(trace-channel finance-channel trade-channel)
declare -A CHANNEL_PROFILE=([trace-channel]=TraceChannel [finance-channel]=FinanceChannel [trade-channel]=TradeChannel)
declare -A CHANNEL_ORGS=([trace-channel]="fpo bank buyer regulator" [finance-channel]="fpo bank regulator" [trade-channel]="fpo buyer")

# Personas (CONTRACT.md Section 5) plus device identities. Format org:username:role
IDENTITIES=(
  fpo:anima.das:member fpo:subhankar.vle:vle fpo:sujata.ceo:ceo fpo:debasis.ops:operator fpo:ratan.store:warehouse fpo:board.fpo:board
  fpo:WB-CHG-01:device fpo:QM-CHG-01:device
  bank:arindam.bank:credit_officer buyer:rahul.buyer:buyer_manager regulator:observer.gov:observer
)

ORDERER_DOMAIN=setu.local
ORD_HOME="$ORG_DIR/ordererOrganizations/$ORDERER_DOMAIN"
ORD_TLS="$ORD_HOME/orderers/orderer1.$ORDERER_DOMAIN/tls"
ORD_TLSCA="$ORD_TLS/ca.crt"
ORDERERS=(orderer1 orderer2 orderer3)
declare -A ORD_ADMIN_PORT=([orderer1]=7053 [orderer2]=8053 [orderer3]=9053)
declare -A ORD_OPS_PORT=([orderer1]=9443 [orderer2]=9453 [orderer3]=9463)

log()  { printf '\033[1;34m[%s]\033[0m %s\n' "$(date +%T)" "$*"; }
warn() { printf '\033[1;33m[%s] WARN\033[0m %s\n' "$(date +%T)" "$*" >&2; }
die()  { printf '\033[1;31m[%s] ERROR\033[0m %s\n' "$(date +%T)" "$*" >&2; exit 1; }

# network/.env holds the generated CA admin password and the password used for every other enrolled identity (prototype).
ensure_env() {
  if [ ! -f "$NET_DIR/.env" ]; then
    umask 077
    printf 'CA_ADMIN_PW=%s\nIDENTITY_PW=%s\n' "$(openssl rand -hex 16)" "$(openssl rand -hex 16)" > "$NET_DIR/.env"
    log "created network/.env with generated passwords (gitignored)"
  fi
  set -a; . "$NET_DIR/.env"; set +a
}
dc() { docker compose -f "$NET_DIR/docker-compose.yaml" --env-file "$NET_DIR/.env" "$@"; }

ensure_binaries() {
  if [ ! -x "$NET_DIR/.fabric-install/bin/peer" ] || ! "$NET_DIR/.fabric-install/bin/peer" version 2>/dev/null | grep -q "Version: v\?$FABRIC_VERSION"; then
    log "installing Fabric $FABRIC_VERSION and CA $FABRIC_CA_VERSION (pinned)"
    mkdir -p "$NET_DIR/.fabric-install"
    (cd "$NET_DIR/.fabric-install" && "$NET_DIR/scripts/install-fabric.sh" --fabric-version "$FABRIC_VERSION" --ca-version "$FABRIC_CA_VERSION" docker binary)
  fi
}

ca_cert() { echo "$ORG_DIR/fabric-ca/$1/ca-cert.pem"; }
peer_dir() { echo "$ORG_DIR/peerOrganizations/$1.setu.local/peers/peer0.$1.setu.local"; }

# Point the peer CLI at one org's peer as that org's admin.
use_peer() {
  local org=$1
  export FABRIC_CFG_PATH="$NET_DIR/.fabric-install/config"
  export CORE_PEER_TLS_ENABLED=true
  export CORE_PEER_LOCALMSPID="${MSPID[$org]}"
  export CORE_PEER_TLS_ROOTCERT_FILE="$(peer_dir "$org")/tls/ca.crt"
  export CORE_PEER_MSPCONFIGPATH="$ORG_DIR/peerOrganizations/$org.setu.local/users/orgadmin/msp"
  export CORE_PEER_ADDRESS="localhost:${PEERPORT[$org]}"
}
# osn talks to the orderer named in OSN_NODE (default orderer1). Any orderer TLS cert is accepted as admin client cert (same CA).
osn() { osnadmin "$@" -o "localhost:${ORD_ADMIN_PORT[${OSN_NODE:-orderer1}]}" --ca-file "$ORD_TLSCA" --client-cert "$ORD_TLS/server.crt" --client-key "$ORD_TLS/server.key"; }
# osnadmin prints "Status: 200" then JSON; keep the JSON
osn_json() { osn "$@" 2>/dev/null | sed '1{/^Status/d}'; }
