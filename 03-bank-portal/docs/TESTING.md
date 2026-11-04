# Testing

```
pnpm check                              # typecheck + vitest (5 tests: contract copies match ../shared, API client)
pnpm exec playwright install chromium   # once
pnpm test:e2e                           # 7 tests against the mock (:4010) and next dev (:3003)
pnpm exec playwright test tests/shots.spec.ts   # regenerates docs/screenshots
```

WSL without root: if Chromium says `libnspr4.so: cannot open shared object file`, either `sudo pnpm exec playwright install-deps chromium`, or `apt-get download libnspr4 libnss3 libasound2t64`, `dpkg -x` them into a folder and run with `LD_LIBRARY_PATH=<folder>/usr/lib/x86_64-linux-gnu`.

## What the mock cannot do
The mock gateway keeps no loan or lien state beyond "a lien was marked in this run" (`POST /__mock/reset` clears it). Receipts come from fixture templates, so:
- a loan's status never changes after disburse, repay or release; the e2e test stubs `GET /loans/:id` at the network layer to reach the SANCTIONED and REPAID states, and the POST receipts are the mock's;
- a receipt's `resource` can name a different loan than the one acted on, so the UI shows the receipt's tx, block and endorsers only and re-reads the loan.
Both go away against the real gateway (P5).
