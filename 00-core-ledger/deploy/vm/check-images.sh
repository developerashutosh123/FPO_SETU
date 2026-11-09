#!/usr/bin/env bash
# Proves every image the network uses has a variant for this machine's platform (linux/amd64 on x86_64, linux/arm64 on aarch64; see arch.sh).
# Reads the image list from the compose files (services plus the peer's chaincode builder and runtime images), so a tag bump in
# network/docker-compose.yaml is checked automatically.
#   deploy/vm/check-images.sh            ask the registry (no download); prints the multi-arch index digest of each tag
#   deploy/vm/check-images.sh --pull     also pull each image for the platform and check the local image's architecture
# Exit 1 and a FLAG line for any image without a variant for the platform. The fix is then to pin a tag that has one in network/docker-compose.yaml.
set -euo pipefail
VM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$VM_DIR/arch.sh"
PULL=0; [ "${1:-}" = "--pull" ] && PULL=1

images=$(CA_ADMIN_PW=preflight "$VM_DIR/fabric-compose.sh" config --format json 2>/dev/null \
  | jq -r '.services[] | .image, (.environment.CORE_CHAINCODE_BUILDER // empty), (.environment.CORE_CHAINCODE_GOLANG_RUNTIME // empty)' | sort -u)
[ -n "$images" ] || { echo "could not read the image list from the compose files" >&2; exit 2; }

bad=0
for img in $images; do
  case "$img" in *@sha256:*|*:latest|*:[0-9]*) ;; *) echo "FLAG  $img  is not pinned to an exact tag"; bad=1;; esac
  raw=$(docker buildx imagetools inspect --raw "$img" 2>/dev/null) || { echo "FLAG  $img  cannot be inspected (registry unreachable or image missing)"; bad=1; continue; }
  if jq -e --arg a "$FPOSETU_ARCH" '.manifests[]? | select(.platform.os == "linux" and .platform.architecture == $a)' >/dev/null <<<"$raw"; then
    digest=$(docker buildx imagetools inspect "$img" 2>/dev/null | sed -n 's/^Digest: *//p' | head -1)
    echo "ok    $img  linux/$FPOSETU_ARCH  index $digest"
  else
    echo "FLAG  $img  has NO linux/$FPOSETU_ARCH variant"; bad=1; continue
  fi
  if [ "$PULL" = 1 ]; then
    docker pull --quiet --platform "$FPOSETU_PLATFORM" "$img" >/dev/null
    arch=$(docker image inspect --format '{{.Architecture}}' "$img")
    [ "$arch" = "$FPOSETU_ARCH" ] || { echo "FLAG  $img  pulled architecture is $arch, not $FPOSETU_ARCH"; bad=1; }
  fi
done
[ "$bad" = 0 ] && echo "all images resolve to $FPOSETU_PLATFORM"
exit $bad
