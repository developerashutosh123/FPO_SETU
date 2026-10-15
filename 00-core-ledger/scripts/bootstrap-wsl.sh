#!/usr/bin/env bash
# Installs the toolchain Phase C2+ needs inside WSL2 Ubuntu. Idempotent. Needs sudo.
# Fabric binaries and images are installed later by network/ (pinned versions), not here.
set -euo pipefail

sudo apt-get update
sudo apt-get install -y make jq curl ca-certificates git build-essential unzip

# Go (Fabric chaincode and fabric-samples tooling want 1.22+; install current stable from go.dev)
if ! command -v go >/dev/null; then
  GO_VER="${GO_VER:-1.23.4}"
  curl -fsSL "https://go.dev/dl/go${GO_VER}.linux-amd64.tar.gz" -o /tmp/go.tgz
  sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf /tmp/go.tgz
  grep -q '/usr/local/go/bin' ~/.profile || echo 'export PATH=$PATH:/usr/local/go/bin:$HOME/go/bin' >> ~/.profile
fi

# Node 22 LTS via NodeSource, then pnpm via corepack
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" != "22" ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo corepack enable
corepack prepare pnpm@latest --activate

# yq (mikefarah)
if ! command -v yq >/dev/null; then
  sudo curl -fsSL https://github.com/mikefarah/yq/releases/download/v4.44.3/yq_linux_amd64 -o /usr/local/bin/yq
  sudo chmod +x /usr/local/bin/yq
fi

echo "Done. Open a new shell, then check: go version; node -v; pnpm -v; jq --version; yq --version; make -v"
