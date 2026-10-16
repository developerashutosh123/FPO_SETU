#!/usr/bin/env bash
# Fails if a tracked file looks like a secret: private keys, .env files, wallet material, database URLs with passwords, API keys.
# Run before every commit (make check-secrets). Test fixtures that are public by design are listed in the allowlist below.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
bad=0
files=$(git ls-files)
hit() { echo "SECRET? $1"; bad=1; }
while IFS= read -r f; do
  case "$f" in
    */.env|.env|*/wallet/*|wallet/*|*/key.pem|*_sk) hit "$f (secret file name)";;
  esac
done <<<"$files"
# content scan (skip binaries, lockfiles and public-by-design fixtures). URLs to the local throwaway test database (127.0.0.1, localhost) are fine.
pattern='BEGIN (EC |RSA |OPENSSH )?PRIVATE KEY|postgres(ql)?://[^ :@]+:[^ @]{4,}@[^ ]+|api-key=[0-9a-f]{32,}'
while IFS= read -r f; do
  case "$f" in *.lock|pnpm-lock.yaml|*.pb|*.tar.gz|*.png|*.pdf|*/test/fixtures/*|*/testdata/*|shared/fixtures/*|shared/openapi.yaml|*/scripts/check-secrets.sh) continue;; esac
  [ -f "$f" ] || continue
  if grep -IEh "$pattern" "$f" 2>/dev/null | grep -vE '@(127\.0\.0\.1|localhost)[:/]' | grep -q .; then hit "$f (private key, URL with a password, or API key)"; fi
done <<<"$files"
[ "$bad" = 0 ] && echo "no secrets found in $(wc -l <<<"$files" | tr -d ' ') tracked files"
exit $bad
