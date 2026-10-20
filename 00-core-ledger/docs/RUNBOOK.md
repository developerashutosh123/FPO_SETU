# Runbook: running FPO-SETU from this PC (WSL Ubuntu + Docker Desktop)

Academic prototype, RD61003, CRDIST, IIT Kharagpur, Group 7. The ledger (Fabric), the gateway and the tunnel run on this PC. The six portals and the read-only API run on Vercel. When this PC is off, the portals fall back to the read-only API and show the amber **index-only** banner (writes disabled).

```
portal (Vercel) --API_URL--> https://<NGROK_DOMAIN> --ngrok--> gateway :8080 --> Fabric (Docker)
        |                                                          |
        '--READ_API_URL (if /health fails in 2.5 s)--> read-api (Vercel) --> Supabase Postgres <-- indexer in the gateway
```

All commands run in the **Ubuntu (WSL)** terminal, in `~/FPO_SETU/00-core-ledger` (the WSL copy, not `/mnt/c/...`). Work from the WSL file system only: Fabric and Docker bind mounts are slow and unreliable on `/mnt/c`.

## 0. Values you give the portals (Phase P5)

| Variable | Value | Where it comes from |
|---|---|---|
| `API_URL` | `https://<NGROK_DOMAIN>` | your reserved ngrok static domain (section 3). Stable across restarts. |
| `READ_API_URL` | `https://<read-api project>.vercel.app` | the Vercel URL of the `read-api` project (section 6) |

Fill the two blanks once and keep them here: **API_URL = `https://________________.ngrok-free.app`**, **READ_API_URL = `https://________________.vercel.app`**.

Name the variables like this in each portal's Vercel project (Settings, Environment Variables, Production and Preview; `NEXT_PUBLIC_*` values are baked in at build time, so redeploy after changing them):

| Portal | API_URL variable | READ_API_URL variable | Other |
|---|---|---|---|
| 01 farmer app (Expo / web) | `EXPO_PUBLIC_API_URL` | `EXPO_PUBLIC_READ_API_URL` | `EXPO_PUBLIC_DATA_SOURCE=live` |
| 02 FPO console | `NEXT_PUBLIC_API_URL` | `NEXT_PUBLIC_READ_API_URL` | `NEXT_PUBLIC_DATA_SOURCE=live` |
| 03 bank portal | `NEXT_PUBLIC_API_URL` | `NEXT_PUBLIC_READ_API_URL` | `NEXT_PUBLIC_DATA_SOURCE=live` |
| 04 buyer portal | `NEXT_PUBLIC_API_URL` | `NEXT_PUBLIC_READ_API_URL` | `NEXT_PUBLIC_DATA_SOURCE=live` |
| 05 consumer site | `NEXT_PUBLIC_API_URL` | `NEXT_PUBLIC_READ_API_URL` | `NEXT_PUBLIC_DATA_SOURCE=live` |
| 06 gov dashboard | `NEXT_PUBLIC_API_URL` | `NEXT_PUBLIC_READ_API_URL` | `NEXT_PUBLIC_DATA_SOURCE=live` |

(Names are from `shared/PORTAL_COMMON.md` section B.) Each portal's domain must also be in the gateway's and the read-API's `CORS_ORIGINS` (section 5).

## 1. Start of a session: WSL and Docker

1. Open **Ubuntu** (Windows Terminal or the Start menu).
2. Make sure **Docker Desktop is running** (whale icon in the tray, "Engine running"). If `docker ps` says *"docker could not be found in this WSL 2 distro"*, Docker Desktop is stopped or its WSL integration is off: start Docker Desktop from Windows, wait about a minute, then open Settings, Resources, WSL integration and tick *Ubuntu*.
   - From WSL you can also start it: `cmd.exe /c start "" "C:\Users\<you>\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe"`
3. Check: `docker ps` prints a table (empty is fine) and `docker info --format '{{.ServerVersion}}'` prints a version.

## 2. Bring the ledger back: `make resume`

```
cd ~/FPO_SETU/00-core-ledger
make resume
```

This restarts the 12 Fabric containers (5 CAs, 3 orderers, 4 peers) on the **existing volumes**: heights and block hashes are unchanged. It takes 6 to 17 seconds. The chaincode containers start again on the first call. Then start the gateway (it also runs the indexer):

```
cd gateway && pnpm start          # leave it running; use a second terminal for the rest
```

**Check it is live** (locally first, then through the tunnel):

```
curl -s localhost:8080/health
# expect: {"ok":true,"ledgerMode":"live","contractVersion":"1.0.4","channels":{"trace-channel":{"height":N},"finance-channel":{"height":N},"trade-channel":{"height":N}}}
```

`"ledgerMode":"live"` and three heights mean the gateway reaches all four peers. If it answers `503 ERR_LEDGER_UNAVAILABLE`, a peer is not up yet: `make status`, wait 15 s, try again. If `make resume` complains about the Docker daemon, go back to section 1.

## 3. Publish the gateway: `make tunnel` (ngrok, canonical)

One-time setup (do it yourself; the token is yours and is never printed or stored by this repo):

1. Install the ngrok agent in Ubuntu (https://ngrok.com/download, the apt repository or the tarball into `/usr/local/bin`). Check: `ngrok version`.
2. `ngrok config add-authtoken <your token>` (it is saved in `~/.config/ngrok/ngrok.yml`).
3. Claim the free static domain: dashboard.ngrok.com, *Domains*, *Create domain*. It looks like `name-words-1234.ngrok-free.app` (or `.ngrok-free.dev`).
4. Put that name, without `https://`, into `gateway/.env`: `NGROK_DOMAIN=name-words-1234.ngrok-free.app`. Add `https://<that domain>` to `CORS_ORIGINS` too (section 5).

Every session, in a second terminal:

```
cd ~/FPO_SETU/00-core-ledger
make tunnel
```

It runs `ngrok http --url=<NGROK_DOMAIN> 8080` (older agents: `--domain`) and prints `API_URL = https://<NGROK_DOMAIN>`. Because the domain is reserved, **API_URL never changes**, across WSL and laptop restarts. Check from anywhere (phone data, not the same Wi-Fi):

```
curl -s https://<NGROK_DOMAIN>/health -H 'ngrok-skip-browser-warning: 1'
```

### The ngrok browser-warning page

Free ngrok domains can answer a **browser** with an HTML "You are about to visit ... " interstitial instead of your API, which looks like a CORS error in a portal (the HTML has no CORS headers). `curl` does not see it. Fix, in this order:

1. **Every portal `fetch` to `API_URL` sends the header `ngrok-skip-browser-warning: 1`** (any value). The gateway already allows that header in its CORS preflight (`allowedHeaders`), so the extra header does not break CORS. Only add it when the API host ends in `.ngrok-free.app` or `.ngrok-free.dev` so the same code works against the read-API.
2. **`EventSource` cannot set headers.** If `/events/stream` shows the interstitial in a browser, read the stream with `fetch()` plus a stream reader (for example `@microsoft/fetch-event-source`) and send the header there. The gateway's SSE response needs nothing else.
3. Last resort: use the cloudflared fallback (section 4), which has no interstitial, or a paid ngrok plan.

**Verified on 20-10-2026 against `repaying-chant-consumer.ngrok-free.dev` (ngrok 3.39.11, free plan), with `curl` sending a Chrome User-Agent:**

| Request | Result |
|---|---|
| `curl` default User-Agent, no header | 200, the API's JSON (no interstitial) |
| Browser User-Agent, `Accept: application/json`, no header | **intercepted**: `ngrok-error-code: ERR_NGROK_6024`, not the API's body |
| Browser User-Agent, `Accept: text/html`, no header | intercepted (HTML warning page) |
| Browser User-Agent + `ngrok-skip-browser-warning: 1` | 200, the API's JSON, `x-ledger-mode: live` |
| Browser User-Agent, `Accept: text/event-stream`, no header | **intercepted** (`text/plain`, no `retry:` line): a native `EventSource` cannot work through free ngrok |
| Browser User-Agent + header + `Origin` of a portal | CORS preflight 204, `access-control-allow-headers` includes the ngrok header; GET and SSE carry `access-control-allow-origin`; real events replayed through the tunnel |

So fix 1 (header on every `fetch`) is required, and fix 2 is required for SSE: use `fetch()` streaming with the header (for example `@microsoft/fetch-event-source`), not `new EventSource(...)`. This is a `curl` emulation of a browser; it has not yet been run from a real browser tab on a deployed portal.

Check from a browser console on any portal origin (replace the domain):

```js
fetch('https://<NGROK_DOMAIN>/health', { headers: { 'ngrok-skip-browser-warning': '1' } }).then(r => r.json()).then(console.log)   // expect the JSON, no CORS error
const es = new EventSource('https://<NGROK_DOMAIN>/events/stream'); es.onopen = () => console.log('SSE open'); es.onerror = (e) => console.log('SSE error', e)
```

## 4. No-account fallback: cloudflared

If ngrok is unavailable (no account, quota, agent problem):

```
cloudflared tunnel --url http://localhost:8080        # or: make tunnel-cf
```

Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ (the `.deb` or the binary). It prints a random `https://<words>.trycloudflare.com` URL. **That URL changes every run**, so use it only for the current session: put it in the portals' `API_URL` (redeploy, or enter it in the portal if it has a settings screen) and add it to `CORS_ORIGINS`, then restart the gateway. It has no browser-warning page. Quick tunnels have no uptime guarantee: not for the final demo if ngrok works.

## 5. CORS

The gateway and the read-API both take a comma-separated allowlist in `CORS_ORIGINS`:

- `gateway/.env`: one line, restart the gateway after changing it.
- Vercel `read-api` project: the same list, then redeploy.

Entries: `http://localhost:3001` to `3006` (the local portal ports), `https://<NGROK_DOMAIN>`, and **the six portal production domains** (exact, `https://...vercel.app` with no trailing slash). Vercel **preview** deployments get a new host name each time; add one pattern per portal where `*` stands for one host label, for example `https://fpo-console-*-myteam.vercel.app`. A bare `*` is rejected on purpose.

Verify a preview origin against the running gateway (no CORS error means the headers are present):

```
O=https://fpo-console-git-main-myteam.vercel.app
curl -si -X OPTIONS localhost:8080/lots -H "Origin: $O" -H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: authorization,ngrok-skip-browser-warning' | grep -i access-control
curl -si localhost:8080/health -H "Origin: $O" | grep -i -E 'access-control|x-ledger'
timeout 4 curl -si -N localhost:8080/events/stream -H "Origin: $O" | grep -i -E 'access-control|content-type|retry'
```

## 6. The read-only API (Vercel)

Project settings: import the GitHub repo, **Root Directory `00-core-ledger/read-api`**, Framework *Next.js* (detected), Node 22. `vercel.json` pins the function region to Mumbai (`bom1`, next to Supabase). Set these **environment variable names** for *Production* and *Preview*:

| Name | Value |
|---|---|
| `DATABASE_URL` | the Supabase pooled (transaction, port 6543) connection string, the same one the gateway uses |
| `DIRECT_URL` | the Supabase direct string. Not read at run time (the read-API never migrates); setting it is harmless |
| `JWT_SECRET` | exactly the gateway's `JWT_SECRET`, so tokens issued by the gateway are accepted |
| `CORS_ORIGINS` | not on your list, but **required in practice**: without it only the localhost portals pass CORS and every Vercel portal is blocked by the browser. Same list as the gateway (section 5) |

Optional: `URL_FARMER_WEB`, `URL_FPO`, `URL_BANK`, `URL_BUYER`, `URL_CONSUMER`, `URL_GOV` (returned by `GET /config/public`), `DB_POOL_MAX` (default 3). `FARMER_TOKEN_SECRET` and `PRICE_SALT_SECRET` are **not** needed: the read-API derives the two values its code insists on from `JWT_SECRET`.

After deploying, check (replace the URL):

```
curl -si https://<read-api>.vercel.app/health | grep -i -E '^HTTP|x-ledger-mode|ledgerMode'      # 200, index-only
curl -si -X POST https://<read-api>.vercel.app/lots/drafts -H 'content-type: application/json' -d '{}' | grep -i -E '^HTTP|x-ledger-mode|ERR_'   # 503 ERR_LEDGER_UNAVAILABLE
```

**If Vercel's install fails** with `Command "pnpm install" exited with 1` and a truncated log: it was `ERR_PNPM_IGNORED_BUILDS` (found by reproducing the install locally with `CI=1 pnpm install --frozen-lockfile` in an empty store from a checkout of `read-api/` alone). `read-api/pnpm-workspace.yaml` now denies the three unneeded build scripts, so it installs standalone. No Vercel dashboard override is needed: leave Install Command and Build Command empty (defaults), Node 22.x.

What the read-API is: the gateway's own routes and role filters (a generated copy of `gateway/src` in `read-api/src/gateway/`, kept in sync by `node read-api/scripts/sync-gateway.mjs` and checked by `gateway/test/readapi-sync.test.ts`), answering from the Postgres index with `X-Ledger-Mode: index-only`. Every write is `503 ERR_LEDGER_UNAVAILABLE`, except the three sign-in calls. `/ledger/status` says plainly that it shows the last indexed chain state, not a live peer query. **After any change under `gateway/src/`, run the sync and commit the copy**, otherwise Vercel serves old logic.

Compare the two APIs any time both are up (about 500 comparisons, as every demo persona):

```
node read-api/scripts/compare-with-gateway.mjs http://localhost:8080 https://<read-api>.vercel.app
```

## 7. If the state is lost

"State" is the Fabric volumes (Docker). Symptoms: `make resume` shows peers up but heights at 0 or 1, or the volumes were deleted (Docker Desktop reset, "Clean / Purge data", a disk wipe).

```
cd ~/FPO_SETU/00-core-ledger
make rebuild                      # wipes and rebuilds the network, deploys the three chaincodes; about 20 minutes
cd gateway
pnpm db:reset-seed --yes          # clears the seeded rows and the index in Supabase (keeps price_series and msp_entries)
pnpm start                        # leave running (indexer follows the new chain)
pnpm seed                         # about 44 minutes against Supabase Mumbai (150 members, about 540 lots); `pnpm seed --scale mini` first to check
```

Until `db:reset-seed` runs, the Supabase index still describes the **old** chain, and the read-API keeps serving it. Wrong `.env` after a rebuild is the usual surprise: do not `source gateway/.env` before `make rebuild` (see DECISIONS D26). If only the **gateway** crashed, nothing is lost: `cd gateway && pnpm start`; the indexer resumes from its checkpoint.

If Supabase is lost but the ledger is fine: `pnpm db:migrate`, then start the gateway; the indexer replays the chain from block 0 and rebuilds `blocks_view`, `tx_view`, events and the entity views. Personal data (names, phones, diary text) lives only in Postgres and is **not** recoverable from the ledger.

## 8. Before a demo (checklist)

1. Docker Desktop running, `make resume`, gateway started, `curl localhost:8080/health` says `live`.
2. `make tunnel` running; `curl https://<NGROK_DOMAIN>/health` says `live`.
3. Open one portal on your phone over mobile data: it must not show the amber banner.
4. Switch the laptop to sleep-proof power settings (WSL stops when Windows sleeps; the tunnel dies with it). If it does sleep, `make resume` and `make tunnel` again; API_URL is unchanged.
5. Pull the plug test (once, in advance): stop the gateway (Ctrl-C). Within about 3 seconds of the next page load a portal shows the amber **index-only** banner and write buttons are disabled; start the gateway and the banner clears.
6. `make check-secrets` before every commit.

## 9. Quick reference

| What | Command |
|---|---|
| Ledger up on existing volumes | `make resume` |
| Network and peers status | `make status` |
| Stop, keep data | `make down` |
| Wipe and rebuild | `make rebuild` |
| Gateway | `cd gateway && pnpm start` |
| Public URL (ngrok) | `make tunnel` |
| Public URL (fallback) | `make tunnel-cf` |
| Gateway tests (needs `make test-db`) | `cd gateway && pnpm check` |
| Read-API tests | `cd read-api && pnpm typecheck && pnpm test` |
| Compare read-API with gateway | `node read-api/scripts/compare-with-gateway.mjs <gateway url> <read-api url>` |
| Secrets scan | `make check-secrets` |
