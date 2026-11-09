#!/usr/bin/env bash
# docker compose for the Fabric network WITH the production override (restart policy, platform pin for this CPU, log rotation).
#   deploy/vm/fabric-compose.sh ps
#   deploy/vm/fabric-compose.sh up -d
#   deploy/vm/fabric-compose.sh logs -f --tail=100 peer0.fpo.setu.local
# Do not use `make resume` / network.sh up on the VM after deploy.sh: they use the base file only and would recreate the containers without
# the override. After a reboot nothing needs to be run: Docker restarts the containers by itself.
set -euo pipefail
VM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$VM_DIR/arch.sh"   # exports FPOSETU_PLATFORM for docker-compose.prod.yaml
NET="$(cd "$VM_DIR/../../network" && pwd)"
args=(-f "$NET/docker-compose.yaml" -f "$VM_DIR/docker-compose.prod.yaml")
[ -f "$NET/.env" ] && args+=(--env-file "$NET/.env")
exec docker compose "${args[@]}" "$@"
