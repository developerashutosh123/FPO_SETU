# Source, do not execute. Picks the CPU architecture the whole deploy targets and exports:
#   FPOSETU_ARCH      amd64 | arm64          (Go / Docker / Debian naming)
#   FPOSETU_PLATFORM  linux/amd64 | linux/arm64   (read by docker-compose.prod.yaml as ${FPOSETU_PLATFORM})
# Detected from `uname -m`. The switch: FPOSETU_ARCH=arm64 (or amd64) in the environment overrides the detection, e.g. to force the
# Oracle Ampere A1 pins. An override that does not match the machine makes the containers fail to start (that is deliberate, no qemu).
case "${FPOSETU_ARCH:-$(uname -m)}" in
  x86_64|amd64)  FPOSETU_ARCH=amd64 ;;
  aarch64|arm64) FPOSETU_ARCH=arm64 ;;
  *) echo "unsupported architecture: ${FPOSETU_ARCH:-$(uname -m)} (need x86_64/amd64 or aarch64/arm64)" >&2; return 1 2>/dev/null || exit 1 ;;
esac
export FPOSETU_ARCH FPOSETU_PLATFORM="linux/${FPOSETU_ARCH}"
