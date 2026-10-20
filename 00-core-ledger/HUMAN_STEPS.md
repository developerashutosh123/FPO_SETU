# Human steps for 00-core-ledger

Environment: local WSL2 Ubuntu + Docker Desktop. Updated at C3 start (your C0 answers are recorded in `docs/DECISIONS.md` D3).

## Done
- Git identity, credential helper and first push done. Month-12 criteria received. Full 3-orderer profile running.
- Toolchain verified: go 1.23.4, node 22.23.3, pnpm 12.11.2, jq 1.8.1, yq 4.44.3, make 4.4.1, docker 29.7.2 + compose v5.4.0, git 2.53.0.

## Open (not blocking)
- **Golgram and Gopalpur coordinates.** Both show the block centre, labelled. When you have them, send latitude and longitude (or LGD codes) for each, and confirm Gopalpur's gram panchayat in Keshiary block.

## Needed before the seed (C4)
In this order, when you have the keys:
1. Put `DATABASE_URL`, `DIRECT_URL` and `DATAGOVIN_API_KEY` into `gateway/.env` (copy `.env.example`; generate the three secrets with `openssl rand -hex 32`). Never paste them into the chat.
2. **Decide the deduction rates** (docs/DATA_SOURCES.md). I could not find the West Bengal notified cold-storage rent, the market fee, the commission or the hamali rate. Either send me the sourced figures (a notification, a circular or a market-committee rate card) or tell me to use labelled indicative values. Until then no statement, patronage run or settled-lot seed can run on the real configuration.
3. Download the AGMARKNET CSVs, including **Brinjal and Cauliflower** as well as Potato, Tomato and Paddy (the seed prices vegetable orders from real data and refuses without it).
4. I then run, with you watching: `make rebuild` (fresh ledger), `pnpm db:migrate`, `pnpm load:csv`, `pnpm seed --scale mini`, and only then the full `pnpm seed`.

## Needed for the keys above (C4)
| What | Where | Goes into |
|---|---|---|
| Supabase project, region Mumbai (ap-south-1). Send `DATABASE_URL` (pooled) and `DIRECT_URL` **by writing them into `00-core-ledger/gateway/.env`, never into the chat** | supabase.com, New project, Connect | gateway, indexer, read-API |
| data.gov.in account and `DATAGOVIN_API_KEY` (same rule: into `.env`) | data.gov.in, My Account | real AGMARKNET prices |
| AGMARKNET history CSVs: Potato, Brinjal, Cauliflower, Tomato, Paddy at Medinipur (West), Ghatal, Garbeta, Purba Medinipur; last 2 seasons | agmarknet.gov.in, save to `~/FPO_SETU/00-core-ledger/data/agmarknet/` | price history (never synthesised) |

I generate `JWT_SECRET`, `FARMER_TOKEN_SECRET` and `PRICE_SALT_SECRET` myself (`openssl rand -hex 32`) into the gitignored `.env`.

## Needed to finish C5 (public URL and deploy) — blocked on these, in this order
Found on 20-10-2026 in the Ubuntu distro: no `ngrok` binary, no `~/.config/ngrok`, no `cloudflared`, no Vercel CLI or token. If ngrok is installed on another machine or distro, run the steps there, or do them here:
1. **ngrok**: install the agent in Ubuntu (https://ngrok.com/download), then `ngrok config add-authtoken <token>` (yourself; I never read the token). Claim the free static domain (dashboard, Domains).
2. Add one line to `gateway/.env`: `NGROK_DOMAIN=<name>.ngrok-free.app` (no https://). Tell me the domain. Then `make tunnel` publishes the gateway; `https://<that domain>` is the canonical **API_URL**.
3. **Vercel**: push the repo (I commit locally; say "push" or tell me to continue), create a project from it with **Root Directory `00-core-ledger/read-api`**, and set in Production and Preview: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET` (same value as the gateway's), and `CORS_ORIGINS` (required in practice, see docs/RUNBOOK.md section 6). Give me the project URL, or a `VERCEL_TOKEN` and I deploy it.
4. **CORS_ORIGINS** in `gateway/.env` and in the Vercel read-api project: the six portal production domains (exact), `https://<NGROK_DOMAIN>`, localhost ports 3001-3006, and one `https://<portal>-*-<team>.vercel.app` pattern per portal for previews. The portals are not deployed yet, so I do not know these names.
Then I run: the cross-origin GET and SSE from a real Vercel preview origin, the ngrok interstitial check, the deployed read-API `/health` and POST 503, and report CHECKPOINT C5.

## Optional
- Raise WSL memory later only if you want the full 3-orderer profile (DECISIONS D2). Not needed now.
