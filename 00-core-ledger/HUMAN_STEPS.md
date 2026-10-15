# Human steps for 00-core-ledger

Environment: local WSL2 Ubuntu + Docker Desktop. Updated at CHECKPOINT C1 (your C0 answers are recorded in `docs/DECISIONS.md` D3).

## Done
- Toolchain verified: go 1.23.4, node 22.23.3, pnpm 12.11.2, jq 1.8.1, yq 4.44.3, make 4.4.1, docker 29.7.2 + compose v5.4.0, git 2.53.0.

## Do now (small)
1. **Git identity (30 seconds).** `git config --global user.name "Your Name"` and `git config --global user.email you@example.com`. Until then my commits use the handle `developerashutosh123`. Push to `origin` needs credentials: if `git push` asks for a password, create a GitHub personal access token (classic, `repo` scope) or run `sudo apt install gh && gh auth login`.
2. **Golgram and Gopalpur coordinates.** Neither village exists in OpenStreetMap, so `villages.json` shows the block centre for them. Please send, for each: latitude and longitude (from Google Maps, long-press the village) **or** the LGD code, and for Gopalpur confirm the gram panchayat in Keshiary block (Census 2011 village directory). Not blocking.
3. **The four Month-12 gate criteria** from the mid-term report (one line each). Until then that KPI shows "criteria not provided". Not blocking.

## Needed before C4 (gateway and seed)
| What | Where | Goes into |
|---|---|---|
| Supabase project, region Mumbai (ap-south-1). Send `DATABASE_URL` (pooled) and `DIRECT_URL` **by writing them into `00-core-ledger/gateway/.env`, never into the chat** | supabase.com, New project, Connect | gateway, indexer, read-API |
| data.gov.in account and `DATAGOVIN_API_KEY` (same rule: into `.env`) | data.gov.in, My Account | real AGMARKNET prices |
| AGMARKNET history CSVs: Potato, Brinjal, Cauliflower, Tomato, Paddy at Medinipur (West), Ghatal, Garbeta, Purba Medinipur; last 2 seasons | agmarknet.gov.in, save to `~/FPO_SETU/00-core-ledger/data/agmarknet/` | price history (never synthesised) |

I generate `JWT_SECRET`, `FARMER_TOKEN_SECRET` and `PRICE_SALT_SECRET` myself (`openssl rand -hex 32`) into the gitignored `.env`.

## Needed before C5 (public URL and deploy)
- **ngrok** (your choice, Q3): free account at ngrok.com, claim the free static domain (dashboard, Domains), install the agent (`snap install ngrok` or the apt repo) and run `ngrok config add-authtoken <token>` yourself. Tell me the domain name.
- **Vercel** account for the read-only API (and optionally `VERCEL_TOKEN`).

## Optional
- Raise WSL memory later only if you want the full 3-orderer profile (DECISIONS D2). Not needed now.
