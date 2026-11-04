# Testing

```
pnpm check                                   # typecheck + vitest (api failover, ngrok header, explain, contract copies)
pnpm exec playwright install chromium        # once
pnpm test:e2e                                # starts the mock (:4010) and next dev (:3006) itself
```

WSL without root: if Chromium says `libnspr4.so: cannot open shared object file`, either `sudo pnpm exec playwright install-deps chromium`, or download the four .debs (`apt-get download libnspr4 libnss3 libasound2t64`), `dpkg -x` them into a folder and set `LD_LIBRARY_PATH` to its `usr/lib/x86_64-linux-gnu`.

## Index-only failover (the "pull the plug" test, against the mock)
```
node ../shared/mock/server.mjs --index-only --port 4011 &
NEXT_PUBLIC_MOCK_URL=http://localhost:4999 NEXT_PUBLIC_READ_API_URL=http://localhost:4011 pnpm dev
INDEX_ONLY_E2E=1 pnpm exec playwright test tests/index-only.spec.ts
```
(4999 is a dead port, so `/health` fails and the portal switches to the read-only copy.)

## Screenshots
`pnpm exec playwright test tests/shots.spec.ts` writes `docs/screenshots/{desktop,mobile,dark}-*.png`.
