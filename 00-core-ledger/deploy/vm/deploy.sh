#!/usr/bin/env bash
# One-shot deploy of the whole FPO-SETU backend on a fresh Ubuntu 22.04/24.04 VM, ngrok mode. Runs on x86_64 (Azure, AWS, ...) and on
# ARM64 (Oracle Ampere A1): the CPU is detected with uname -m; force one with FPOSETU_ARCH=amd64|arm64 (see arch.sh).
#   deploy/vm/deploy.sh [--yes] [--skip-reseed] [--scale full|mini] [--skip-install]
#
# What it does, in order (every step is safe to run again):
#   1. checks gateway/.env (names only: it never prints a value) and the machine (CPU architecture, memory)
#   2. installs Docker + compose plugin, Go, Node 22, pnpm, ngrok (all for the detected architecture) and the build tools
#   3. verifies every Fabric image has a variant for this platform (linux/amd64 or linux/arm64) and pulls them
#   4. brings the network up (5 CAs, 3 orderers, 4 peers, 3 channels) and applies the production override (restart: unless-stopped)
#   5. deploys the 3 chaincodes (lot-lifecycle, pledge-lien, order-settlement)
#   6. installs gateway dependencies, applies the database migrations, installs and starts the systemd units
#        fposetu-gateway.service  gateway API + block indexer (one process), restarts on crash, starts on boot
#        fposetu-ngrok.service    the tunnel on the reserved static domain, restarts on crash, starts on boot
#   7. fresh reseed: clears the seeded rows in the database in DATABASE_URL (gateway stopped), starts the gateway so its indexer replays the new
#        chain, then seeds. Asks first (before anything is installed); --yes skips the question. Refused on a ledger that is already seeded.
#   8. checks /health (ledgerMode live) locally and through the ngrok domain
#
# --skip-reseed  do everything except step 7        --scale mini  small seed to check the pipeline first
# --skip-install skip step 2 (toolchain already there)   --yes  do not ask before the destructive reseed
# Run it as a normal user with sudo (not as root), inside tmux: a full seed takes a long time and an SSH drop must not kill it.
set -euo pipefail

VM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$VM_DIR/../.." && pwd)"                 # 00-core-ledger
GW="$ROOT/gateway"
ENV_FILE="$GW/.env"
ORIG_ARGS=("$@")
GO_VERSION="${GO_VERSION:-1.23.4}"
PNPM_VERSION="${PNPM_VERSION:-12.11.2}"
RUN_USER="$(id -un)"

YES=0; RESEED=1; SCALE=full; INSTALL=1
while [ $# -gt 0 ]; do
  case "$1" in
    --yes) YES=1 ;; --skip-reseed) RESEED=0 ;; --skip-install) INSTALL=0 ;;
    --scale) SCALE="${2:-}"; shift ;;
    -h|--help) sed -n '2,22p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option: $1 (see --help)" >&2; exit 2 ;;
  esac; shift
done
case "$SCALE" in full|mini) ;; *) echo "--scale must be full or mini" >&2; exit 2 ;; esac

# log/warn/die and the Fabric helpers (use_peer, PEERPORT, ...) are shared with the network scripts
. "$ROOT/network/scripts/lib.sh"
. "$VM_DIR/arch.sh"                                  # FPOSETU_ARCH (amd64|arm64) and FPOSETU_PLATFORM (linux/amd64|linux/arm64)
export PATH="/usr/local/go/bin:$PATH"

[ "$(id -u)" -ne 0 ] || die "run as a normal user with sudo, not as root (the Fabric wallet and the services belong to that user)"
command -v sudo >/dev/null || die "sudo is required"

# ---------------------------------------------------------------------------------------------------------------------------- 1. checks
env_get() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//' | tr -d '\r'; }

check_env() {
  [ -f "$ENV_FILE" ] || die "gateway/.env does not exist. Create it first:  cp deploy/vm/.env.example gateway/.env && chmod 600 gateway/.env  and fill it in (README-VM.md, step 4)"
  chmod 600 "$ENV_FILE"
  local missing=() short=() k
  for k in DATABASE_URL DIRECT_URL JWT_SECRET FARMER_TOKEN_SECRET PRICE_SALT_SECRET NGROK_AUTHTOKEN NGROK_DOMAIN CORS_ORIGINS; do
    [ -n "$(env_get "$k")" ] || missing+=("$k")
  done
  [ ${#missing[@]} -eq 0 ] || die "gateway/.env has no value for: ${missing[*]}"
  for k in JWT_SECRET FARMER_TOKEN_SECRET PRICE_SALT_SECRET; do [ "$(env_get "$k" | wc -c)" -gt 32 ] || short+=("$k"); done
  [ ${#short[@]} -eq 0 ] || die "gateway/.env: ${short[*]} must be at least 32 characters (openssl rand -hex 32)"
  grep -qE '^[A-Za-z_]+=.*[[:space:]]#' "$ENV_FILE" && warn "gateway/.env has a value line with a trailing '# comment': systemd keeps it as part of the value. Remove it if it is not intentional."
  NGROK_DOMAIN="$(env_get NGROK_DOMAIN)"; NGROK_DOMAIN="${NGROK_DOMAIN#https://}"; NGROK_DOMAIN="${NGROK_DOMAIN%/}"
  case "$(env_get CORS_ORIGINS)" in *"$NGROK_DOMAIN"*) ;; *) warn "CORS_ORIGINS does not list https://$NGROK_DOMAIN" ;; esac
  log "gateway/.env: all required variables are set (values not shown)"
}

check_machine() {
  local arch; arch="$(uname -m)"
  case "$arch" in x86_64|aarch64) ;; *) die "unsupported CPU $arch: need x86_64 or aarch64" ;; esac
  [ "$FPOSETU_ARCH" = "$(case "$arch" in x86_64) echo amd64 ;; *) echo arm64 ;; esac)" ] || warn "FPOSETU_ARCH=$FPOSETU_ARCH does not match this machine ($arch): the Fabric containers will fail to start"
  . /etc/os-release
  [ "$ID" = ubuntu ] || warn "written for Ubuntu 22.04/24.04, this is $PRETTY_NAME"
  local mem_mb cpus; mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo); cpus=$(nproc)
  log "machine: $arch (images and toolchain: $FPOSETU_PLATFORM), $cpus vCPU, ${mem_mb} MB RAM, $PRETTY_NAME"
  [ "$mem_mb" -ge 10500 ] || warn "less than 12 GB RAM (${mem_mb} MB). The 12 Fabric containers are limited to about 5.8 GB, plus up to 9 chaincode containers and the gateway: expect OOM kills. Use at least 4 vCPU / 16 GB (Azure Standard_D4s_v5 or D4as_v5)."
  [ "$cpus" -ge 2 ] || warn "fewer than 2 vCPU: chaincode builds and the seed will be very slow"
}

# ----------------------------------------------------------------------------------------------------------------------------- 2. install
apt_install() { sudo DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a apt-get install -y -qq "$@" >/dev/null; }   # NEEDRESTART_MODE=a: no interactive prompt on Ubuntu 24.04

install_toolchain() {
  log "installing base packages"
  sudo apt-get update -qq
  apt_install ca-certificates curl gnupg git jq make build-essential python3 unzip openssl tmux

  if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
    log "installing Docker Engine + compose plugin (docker.com apt repository, $FPOSETU_ARCH)"
    sudo install -m 0755 -d /etc/apt/keyrings
    sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
    sudo apt-get update -qq
    apt_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi
  sudo systemctl enable --now docker containerd >/dev/null 2>&1   # Docker starts on boot, and restarts every restart:unless-stopped container with it
  id -nG "$RUN_USER" | tr ' ' '\n' | grep -qx docker || sudo usermod -aG docker "$RUN_USER"

  if ! { [ -x /usr/local/go/bin/go ] && /usr/local/go/bin/go version | grep -q "go${GO_VERSION} linux/${FPOSETU_ARCH}"; }; then
    log "installing Go ${GO_VERSION} (linux-${FPOSETU_ARCH}; the chaincode is vendored on the host, then built in the ${FPOSETU_ARCH} fabric-ccenv image)"
    local f="go${GO_VERSION}.linux-${FPOSETU_ARCH}.tar.gz" want tmp; tmp="$(mktemp -d)"
    want="$(curl -fsSL 'https://go.dev/dl/?mode=json&include=all' | jq -r --arg f "$f" '.[].files[] | select(.filename == $f) | .sha256')"
    [ -n "$want" ] || die "no checksum published for $f"
    curl -fsSL "https://go.dev/dl/$f" -o "$tmp/$f"
    [ "$(sha256sum "$tmp/$f" | cut -d' ' -f1)" = "$want" ] || die "checksum mismatch for $f"
    sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf "$tmp/$f" && rm -rf "$tmp"
    echo 'export PATH=$PATH:/usr/local/go/bin' | sudo tee /etc/profile.d/go.sh >/dev/null
  fi

  if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" != 22 ]; then
    log "installing Node 22 (NodeSource, $FPOSETU_ARCH)"
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null
    apt_install nodejs
  fi
  if ! command -v pnpm >/dev/null || [ "$(pnpm -v)" != "$PNPM_VERSION" ]; then
    log "installing pnpm ${PNPM_VERSION}"
    sudo npm install -g --silent "pnpm@${PNPM_VERSION}"
  fi

  if ! command -v ngrok >/dev/null; then
    log "installing the ngrok agent (ngrok apt repository, $FPOSETU_ARCH)"
    sudo install -m 0755 -d /etc/apt/keyrings
    sudo curl -fsSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc -o /etc/apt/keyrings/ngrok.asc
    echo "deb [signed-by=/etc/apt/keyrings/ngrok.asc] https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list >/dev/null
    sudo apt-get update -qq
    apt_install ngrok
  fi
  log "toolchain: $(docker --version | cut -d, -f1), $(docker compose version --short | sed 's/^/compose /'), $(go version | cut -d' ' -f3), node $(node -v), pnpm $(pnpm -v), $(ngrok version)"
}

ensure_docker_access() {
  docker info >/dev/null 2>&1 && return 0
  [ -z "${FPOSETU_REEXEC:-}" ] || die "docker is not usable by $RUN_USER (is the daemon running? sudo systemctl status docker)"
  log "docker group membership starts with a new login: continuing in a shell that has it"
  # shellcheck disable=SC2046
  exec sg docker -c "FPOSETU_REEXEC=1 $(printf '%q ' "$VM_DIR/deploy.sh" "${ORIG_ARGS[@]}" --skip-install)"
}

# --------------------------------------------------------------------------------------------------------------------------- 3 + 4. network
wait_peers() {
  local org i
  for org in "${ORGS[@]}"; do
    use_peer "$org"
    for i in $(seq 1 40); do peer channel list >/dev/null 2>&1 && break; sleep 3; [ "$i" -lt 40 ] || die "peer0.$org does not answer. See: deploy/vm/fabric-compose.sh logs --tail=50 peer0.$org.setu.local"; done
  done
}

wait_raft() { # every channel must have a Raft leader before the first transaction
  local c o i leaders
  for c in "${CHANNELS[@]}"; do
    for i in $(seq 1 60); do
      leaders=0
      for o in "${ORDERERS[@]}"; do leaders=$((leaders + $(curl -s --max-time 3 "localhost:${ORD_OPS_PORT[$o]}/metrics" 2>/dev/null | grep -c "^consensus_etcdraft_is_leader{channel=\"$c\"} 1" || true))); done
      [ "$leaders" -ge 1 ] && break; sleep 2
      [ "$i" -lt 60 ] || die "no Raft leader on $c after 2 minutes. See: deploy/vm/fabric-compose.sh logs --tail=50 orderer1.setu.local"
    done
  done
}

bring_up_network() {
  log "checking that every Fabric image has a $FPOSETU_PLATFORM variant, and pulling them"
  "$VM_DIR/check-images.sh" --pull || die "an image has no $FPOSETU_PLATFORM variant (see FLAG above). Pin a tag that has one in network/docker-compose.yaml and in network/scripts/lib.sh."
  log "bringing the network up (CAs, crypto, genesis blocks, orderers, peers, channels): the first time takes a few minutes"
  "$ROOT/network/scripts/network.sh" up
  log "applying the production override (restart: unless-stopped, $FPOSETU_PLATFORM pin, log rotation)"
  "$VM_DIR/fabric-compose.sh" up -d --remove-orphans
  wait_peers
  wait_raft
  local n bad; n=$("$VM_DIR/fabric-compose.sh" ps -q | wc -l)
  bad=$(docker inspect -f '{{.Name}} {{.HostConfig.RestartPolicy.Name}}' $("$VM_DIR/fabric-compose.sh" ps -q) | grep -vc 'unless-stopped$' || true)
  [ "$n" -eq 12 ] && [ "$bad" -eq 0 ] || die "expected 12 Fabric containers all with restart=unless-stopped, found $n containers and $bad without the policy"
  log "12 Fabric containers running, all restart: unless-stopped"
}

deploy_chaincode() {
  log "deploying the three chaincodes (the first build of each pulls Go modules and compiles in the $FPOSETU_ARCH ccenv image: allow 10-20 minutes)"
  "$ROOT/scripts/deployCC.sh"
}

# ------------------------------------------------------------------------------------------------------------------------------ 6. services
prepare_gateway() {
  log "installing gateway dependencies"
  (cd "$GW" && pnpm install --frozen-lockfile)
  log "applying database migrations (idempotent)"
  (cd "$GW" && pnpm db:migrate)
}

render_unit() { # render_unit <template> <destination>
  sed -e "s|@USER@|$RUN_USER|g" -e "s|@GATEWAY_DIR@|$GW|g" -e "s|@NGROK_BIN@|$(command -v ngrok)|g" "$1" | sudo tee "$2" >/dev/null
}

install_services() {
  log "installing systemd units"
  render_unit "$VM_DIR/systemd/fposetu-gateway.service" /etc/systemd/system/fposetu-gateway.service
  render_unit "$VM_DIR/systemd/fposetu-ngrok.service"   /etc/systemd/system/fposetu-ngrok.service
  sudo systemctl daemon-reload
  sudo systemctl enable fposetu-gateway.service fposetu-ngrok.service >/dev/null 2>&1
  sudo systemctl restart fposetu-gateway.service
  wait_for "the gateway on localhost" 90 gateway_live || die "the gateway does not report ledgerMode live after 90 s. sudo journalctl -u fposetu-gateway -n 50 --no-pager"
  sudo systemctl restart fposetu-ngrok.service
}

# ------------------------------------------------------------------------------------------------------------------------------- 7 + 8
wait_for() { # wait_for <what> <seconds> <command...>
  local what=$1 secs=$2 i; shift 2
  for i in $(seq 1 "$secs"); do "$@" && return 0; sleep 1; done
  return 1
}
PORT_="$(env_get PORT 2>/dev/null || true)"; PORT_="${PORT_:-8080}"
health_json() { curl -fsS --max-time 5 "$1" -H 'ngrok-skip-browser-warning: 1' 2>/dev/null; }
gateway_live() { [ "$(health_json "http://127.0.0.1:${PORT_}/health" | jq -r '.ledgerMode' 2>/dev/null)" = live ]; }
tunnel_live()  { [ "$(health_json "https://${NGROK_DOMAIN}/health" | jq -r '.ledgerMode' 2>/dev/null)" = live ]; }

confirm_reseed() { # asked first, so an unattended run is never blocked half way
  [ "$RESEED" -eq 1 ] || return 0
  [ "$YES" -eq 1 ] && return 0
  warn "FRESH RESEED. After the ledger is deployed this clears every seeded member, lot, order and the index in the database named by DATABASE_URL in"
  warn "gateway/.env (price_series and msp_entries are kept), so the deployed read-API and portals show the NEW ledger from then on."
  local ans=""; read -r -p "Type RESEED to continue, anything else skips the reseed: " ans || true
  if [ "$ans" != RESEED ]; then RESEED=0; log "reseed skipped. Run it later with:  cd gateway && sudo systemctl stop fposetu-gateway && pnpm db:reset-seed --yes && sudo systemctl start fposetu-gateway && pnpm seed"; fi
}

ledger_height() { use_peer fpo; peer channel getinfo -c trace-channel 2>/dev/null | sed 's/^Blockchain info: //' | jq -r '.height // 0' 2>/dev/null || echo 0; }

reset_index() { # the gateway must be stopped: its indexer would otherwise keep going from a checkpoint the reset has just deleted
  [ "$RESEED" -eq 1 ] || return 0
  local h; h="$(ledger_height)"
  if [ "$h" -gt 60 ]; then
    warn "trace-channel already has $h blocks: this ledger has been seeded. A second seed would collide with the lots already on it, so the reseed is skipped"
    warn "and the index is left as it is. To start from an empty ledger: network/scripts/network.sh reset, then run deploy.sh again."
    RESEED=0; return 0
  fi
  sudo systemctl stop fposetu-gateway.service 2>/dev/null || true
  log "clearing the seeded rows (the gateway is stopped; its indexer will replay the new chain from block 0)"
  (cd "$GW" && pnpm db:reset-seed --yes)
}

seed() {
  [ "$RESEED" -eq 1 ] || return 0
  log "seeding (scale $SCALE, deterministic seed 20261015, set in gateway/scripts/seed-ledger.ts) through real transactions; the gateway keeps running and its indexer follows the chain"
  (cd "$GW" && pnpm seed --scale "$SCALE") || die "the seed failed. If it says no AGMARKNET price is loaded: that database has no price_series rows (pnpm load:csv, see README-VM.md, 'A new database'). After fixing it, re-run: cd gateway && pnpm db:reset-seed --yes && pnpm seed"
  log "checking that the index matches the ledger"
  (cd "$GW" && pnpm verify:index) || warn "verify:index reported differences: see the output above"
}

final_check() {
  log "checking /health locally and through https://${NGROK_DOMAIN}"
  gateway_live || die "the gateway does not report ledgerMode live on localhost. sudo journalctl -u fposetu-gateway -n 50"
  if ! wait_for "the tunnel" 60 tunnel_live; then
    sudo journalctl -u fposetu-ngrok -n 15 --no-pager | sed 's/authtoken=[^ ]*/authtoken=***/Ig' >&2
    die "the tunnel does not answer. If the log above says ERR_NGROK_334 (endpoint already online), the same domain is still being served from another machine, e.g. 'make tunnel' on your PC: stop that one, the VM tunnel retries by itself."
  fi
  health_json "https://${NGROK_DOMAIN}/health" | jq -c '{ok, ledgerMode, contractVersion, channels}'
  log "DONE. API_URL = https://${NGROK_DOMAIN}   (gateway + ngrok are enabled at boot; Fabric containers restart with Docker)"
}

# ----------------------------------------------------------------------------------------------------------------------------------- main
check_machine
check_env
confirm_reseed
[ "$INSTALL" -eq 1 ] && install_toolchain
ensure_docker_access
bring_up_network
deploy_chaincode
prepare_gateway
reset_index
install_services
seed
final_check
