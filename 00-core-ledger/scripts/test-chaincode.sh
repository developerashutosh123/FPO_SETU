#!/usr/bin/env bash
# go vet + unit tests for the shared module and the three chaincodes. Fails if rule-logic coverage is below 80%.
# Coverage excludes main.go (process start-up) and the generated mocks and test kit.
set -euo pipefail
cd "$(dirname "$0")/../chaincode"
export GOFLAGS=-mod=mod   # the vendor/ folders made by deployCC.sh must not shadow the live ../common module
MIN=${MIN_COVERAGE:-80}
fail=0
for m in common lot-lifecycle pledge-lien order-settlement; do
  echo "== $m"
  (cd "$m" && go vet ./... && go test ./... -coverprofile="/tmp/fposetu-cov-$m.out" | grep -v "no test files")
  grep -v -E "/main.go:|/mocks/|/testkit/" "/tmp/fposetu-cov-$m.out" > "/tmp/fposetu-cov2-$m.out"
  pct=$(cd "$m" && go tool cover -func="/tmp/fposetu-cov2-$m.out" | tail -1 | awk '{print $NF}' | tr -d '%')
  printf '   rule-logic coverage %s%% (minimum %s%%)\n' "$pct" "$MIN"
  awk -v p="$pct" -v m="$MIN" 'BEGIN{exit !(p+0 >= m+0)}' || { echo "   BELOW MINIMUM"; fail=1; }
done
exit $fail
