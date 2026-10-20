#!/usr/bin/env bash
# Publishes the gateway (localhost:8080) on the reserved ngrok static domain, so API_URL stays the same across restarts.
#   scripts/tunnel.sh            ngrok on the reserved domain (the canonical API_URL)
#   scripts/tunnel.sh cloudflared   no-account fallback: a random https://*.trycloudflare.com URL that CHANGES every run
# The domain is read from NGROK_DOMAIN (environment, or gateway/.env). It is not a secret. The ngrok auth token is never read or printed here:
# it lives in ngrok's own config file after `ngrok config add-authtoken`.
set -uo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-8080}"

if [ "${1:-}" = "cloudflared" ]; then
  command -v cloudflared >/dev/null || { echo "cloudflared is not installed. See docs/RUNBOOK.md, section 'No-account fallback'."; exit 1; }
  echo "Starting a Cloudflare quick tunnel. The URL printed below changes on every run: give it to the portals as API_URL for this session only."
  exec cloudflared tunnel --url "http://localhost:${PORT}"
fi

if [ -z "${NGROK_DOMAIN:-}" ] && [ -f gateway/.env ]; then
  NGROK_DOMAIN="$(grep -E '^NGROK_DOMAIN=' gateway/.env | tail -1 | cut -d= -f2- | tr -d '"'"'"' \r')"
fi
NGROK_DOMAIN="${NGROK_DOMAIN#https://}"; NGROK_DOMAIN="${NGROK_DOMAIN%/}"

fail() { echo "ERROR: $1" >&2; echo "$2" >&2; exit 1; }
command -v ngrok >/dev/null || fail "ngrok is not installed in this WSL distro." "Install it (https://ngrok.com/download, Linux apt or tarball), then run: ngrok config add-authtoken <your token>   (or use: make tunnel-cf)"
[ -n "$NGROK_DOMAIN" ] || fail "NGROK_DOMAIN is not set." "Claim your free static domain at https://dashboard.ngrok.com/domains and add one line to gateway/.env:  NGROK_DOMAIN=<name>.ngrok-free.app   (no https://)"
ngrok config check >/dev/null 2>&1 || fail "ngrok has no valid configuration (is the auth token set?)." "Run once: ngrok config add-authtoken <your token>"
curl -fsS --max-time 3 "http://localhost:${PORT}/health" >/dev/null 2>&1 || echo "note: the gateway does not answer on localhost:${PORT} yet (cd gateway && pnpm start). The tunnel will start anyway."

# ngrok 3.16+ calls the flag --url; older v3 releases call it --domain
if ngrok http --help 2>&1 | grep -q -- '--url'; then FLAG="--url=${NGROK_DOMAIN}"; else FLAG="--domain=${NGROK_DOMAIN}"; fi
echo "API_URL = https://${NGROK_DOMAIN}   (gateway on localhost:${PORT})"
exec ngrok http "$FLAG" "${PORT}"
