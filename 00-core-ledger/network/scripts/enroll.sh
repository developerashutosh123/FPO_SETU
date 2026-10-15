#!/usr/bin/env bash
# Registers and enrolls every identity through the five Fabric CAs. Idempotent: existing material is kept.
# Result: organizations/ (MSP, TLS, users) and wallet/ (cert + key per persona, gitignored).
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
ensure_env

write_nodeou() { # <msp dir>
  local m=$1 ca; ca=$(ls "$m"/cacerts/*.pem | head -1); ca=$(basename "$ca")
  cat > "$m/config.yaml" <<YAML
NodeOUs:
  Enable: true
  ClientOUIdentifier:  { Certificate: cacerts/$ca, OrganizationalUnitIdentifier: client }
  PeerOUIdentifier:    { Certificate: cacerts/$ca, OrganizationalUnitIdentifier: peer }
  AdminOUIdentifier:   { Certificate: cacerts/$ca, OrganizationalUnitIdentifier: admin }
  OrdererOUIdentifier: { Certificate: cacerts/$ca, OrganizationalUnitIdentifier: orderer }
YAML
}

wait_ca() { # <org key>
  local k=$1 port=${CAPORT[$1]} dir="$ORG_DIR/fabric-ca/$1"
  mkdir -p "$dir"
  for i in $(seq 1 60); do
    if docker cp "ca.$k.setu.local:/etc/hyperledger/fabric-ca-server/ca-cert.pem" "$dir/ca-cert.pem" 2>/dev/null &&
       curl -s --cacert "$dir/ca-cert.pem" "https://localhost:$port/cainfo" | grep -q '"success":true'; then return 0; fi
    sleep 1
  done
  die "CA $k did not become ready"
}

# fabric-ca-client wrappers (registrar = bootstrap admin of that CA)
reg() { # <ca key> <name> <type> [attrs]
  local k=$1 name=$2 type=$3 attrs=${4:-} out
  local args=(register --caname "ca-$k" --id.name "$name" --id.secret "$IDENTITY_PW" --id.type "$type" -u "https://localhost:${CAPORT[$k]}" --tls.certfiles "$(ca_cert "$k")")
  [ -n "$attrs" ] && args+=(--id.attrs "$attrs")
  if ! out=$(FABRIC_CA_CLIENT_HOME="$ORG_DIR/fabric-ca/$k/registrar" fabric-ca-client "${args[@]}" 2>&1); then
    echo "$out" | grep -q "already registered" || { echo "$out" >&2; die "register $name failed"; }
  fi
}
enr() { # <ca key> <name> <msp out dir> [extra args...]
  local k=$1 name=$2 out=$3; shift 3
  local o; o=$(fabric-ca-client enroll -u "https://$name:$IDENTITY_PW@localhost:${CAPORT[$k]}" --caname "ca-$k" -M "$out" --tls.certfiles "$(ca_cert "$k")" "$@" 2>&1) \
    || { echo "$o" >&2; die "enroll $name failed"; }
}
enroll_node() { # <ca key> <name> <hostname> <node dir>   enrolls msp + tls for a peer/orderer
  local k=$1 name=$2 host=$3 d=$4
  [ -f "$d/msp/signcerts/cert.pem" ] || { enr "$k" "$name" "$d/msp" --csr.hosts "$host" --csr.hosts localhost; write_nodeou "$d/msp"; }
  if [ ! -f "$d/tls/server.crt" ]; then
    enr "$k" "$name" "$d/tls" --enrollment.profile tls --csr.hosts "$host" --csr.hosts localhost --csr.hosts 127.0.0.1
    cp "$d"/tls/tlscacerts/*.pem "$d/tls/ca.crt"; cp "$d"/tls/signcerts/*.pem "$d/tls/server.crt"; cp "$d"/tls/keystore/*_sk "$d/tls/server.key"
  fi
}
enroll_user() { # <ca key> <name> <user dir>
  local k=$1 name=$2 d=$3
  [ -f "$d/msp/signcerts/cert.pem" ] || { enr "$k" "$name" "$d/msp"; write_nodeou "$d/msp"; }
}
org_msp() { # <ca key> <org home>  public MSP definition used by configtx
  local k=$1 home=$2
  mkdir -p "$home/msp/cacerts" "$home/msp/tlscacerts" "$home/ca" "$home/tlsca"
  cp "$(ca_cert "$k")" "$home/msp/cacerts/ca.pem"; cp "$(ca_cert "$k")" "$home/msp/tlscacerts/ca.pem"
  cp "$(ca_cert "$k")" "$home/ca/ca.pem"; cp "$(ca_cert "$k")" "$home/tlsca/tlsca.pem"
  write_nodeou "$home/msp"
}
registrar() { # <ca key>
  local k=$1 h="$ORG_DIR/fabric-ca/$1/registrar"
  [ -f "$h/msp/signcerts/cert.pem" ] || FABRIC_CA_CLIENT_HOME="$h" fabric-ca-client enroll -u "https://admin:$CA_ADMIN_PW@localhost:${CAPORT[$k]}" --caname "ca-$k" --tls.certfiles "$(ca_cert "$k")" >/dev/null 2>"$h.err" || { cat "$h.err" >&2; die "registrar enroll for $k failed"; }
}

# ---------------------------------------------------------------- peer orgs
for org in "${ORGS[@]}"; do
  log "CA $org: enrolling identities"
  wait_ca "$org"; registrar "$org"
  home="$ORG_DIR/peerOrganizations/$org.setu.local"
  org_msp "$org" "$home"
  reg "$org" peer0 peer
  reg "$org" orgadmin admin
  enroll_node "$org" peer0 "peer0.$org.setu.local" "$home/peers/peer0.$org.setu.local"
  enroll_user "$org" orgadmin "$home/users/orgadmin"
  for ident in "${IDENTITIES[@]}"; do
    IFS=: read -r iorg iname irole <<<"$ident"; [ "$iorg" = "$org" ] || continue
    reg "$org" "$iname" client "role=$irole:ecert"
    enroll_user "$org" "$iname" "$home/users/$iname"
    # wallet: certificate + private key, the format the gateway loads
    w="$WALLET_DIR/${MSPID[$org]}/$iname"; mkdir -p "$w"
    cp "$home/users/$iname/msp/signcerts/cert.pem" "$w/cert.pem"; cp "$home"/users/"$iname"/msp/keystore/*_sk "$w/key.pem"; chmod 600 "$w/key.pem"
    printf '{"mspId":"%s","username":"%s","role":"%s"}\n' "${MSPID[$org]}" "$iname" "$irole" > "$w/identity.json"
  done
done

# ---------------------------------------------------------------- orderer org
log "CA orderer: enrolling identities"
wait_ca orderer; registrar orderer
org_msp orderer "$ORD_HOME"
reg orderer orgadmin admin
for o in "${ORDERERS[@]}"; do
  reg orderer "$o" orderer
  enroll_node orderer "$o" "$o.$ORDERER_DOMAIN" "$ORD_HOME/orderers/$o.$ORDERER_DOMAIN"
done
enroll_user orderer orgadmin "$ORD_HOME/users/orgadmin"
log "enrollment complete: $(find "$WALLET_DIR" -name cert.pem | wc -l) wallet identities"
