# Testing

```
pnpm check                              # typecheck + vitest (16 tests: contract copies, API client, SSE parser, SSCC scan parsing, SHA-256)
pnpm exec playwright install chromium   # once
pnpm test:e2e                           # 21 tests against the mock (:4010) and next dev (:3004)
pnpm exec playwright test tests/shots.spec.ts   # regenerates docs/screenshots
```

WSL without root: if Chromium says `libnspr4.so: cannot open shared object file`, `apt-get download libnspr4 libnss3 libasound2t64`, `dpkg -x` each into an empty folder and run with `LD_LIBRARY_PATH=<folder>/usr/lib/x86_64-linux-gnu`.

## What the mock cannot do
- Order and lot state never change after a write (`createOrder` always answers ORD-2026-00091; custody accept leaves the lot IN_TRANSIT). The UI re-reads the ledger, so against the mock the status after a write is unchanged; the receipts are the mock's.
- `GET /orders/:id/price` exists only for orders that already have a price in the fixtures, so the golden-step test stubs that one read at the network layer.
- Roles are checked before `X-Mock-Error`, so an FPO token gets `ERR_FORBIDDEN_ROLE`. The `ERR_UNILATERAL_CUSTODY` test stubs the chaincode's refusal for the FPO's call and checks the page shows it as returned.
- The QR test stubs `getUserMedia` and `BarcodeDetector`. A real camera and the `html5-qrcode` fallback are untested.
- The mock's price comparison is by order only, not by caller; the FPO side is played with `sujata.ceo` straight against the mock.
Everything above goes away against the real gateway (P5).
