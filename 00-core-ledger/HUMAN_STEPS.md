# Human steps for 00-core-ledger

Environment: local WSL2 Ubuntu + Docker Desktop (not Codespaces). Updated at CHECKPOINT C0.

## Do now (needed for C2, so not urgent for C1)
1. **Install the toolchain.** WSL lacks `go`, `node`, `pnpm`, `jq`, `yq`, `make` and `gh`. Docker 29.7.2 is present. The script needs your sudo password, so run it yourself. In the Claude prompt type:
   `! bash ~/FPO_SETU/00-core-ledger/scripts/bootstrap-wsl.sh`
   Then open a new shell and tell me when it is done. I will verify the versions.
2. **Docker Desktop:** Settings, Resources, WSL integration, enable it for the Ubuntu distro. (`docker` already works in WSL, so this is probably done.)
3. **GitHub CLI (optional, only if you want me to push or open PRs):** `sudo apt install gh && gh auth login`.

## Accounts and keys (needed later, from the table in `../HUMAN_SETUP.md` section 4)
| When | What | Needed for |
|---|---|---|
| Before C4 | Supabase (Mumbai if offered) or Neon project, and `DATABASE_URL` + `DIRECT_URL` | gateway, indexer, read-API |
| Before C4 | data.gov.in account, then `DATAGOVIN_API_KEY` | real AGMARKNET prices |
| Before C4 | AGMARKNET history CSVs: Potato, Brinjal, Cauliflower, Tomato, Paddy at Medinipur (West), Ghatal, Garbeta, Purba Medinipur; last 2 seasons | price history (never synthesised) |
| C5 | Vercel account (and optionally `VERCEL_TOKEN`) | read-API deploy |
| C5 | Tunnel choice (see Q3) | public gateway URL |

I generate `JWT_SECRET` and `FARMER_TOKEN_SECRET` myself (`openssl rand -hex 32`) into a gitignored `.env`. Never paste keys into the chat.

## Files I could not find
- `../docs/` (mid-term deck, report, guidelines PDF) does not exist in the repo. PROMPT.md says to read them if present. If you want them used, copy them to `~/FPO_SETU/docs/` before C1.

## Questions (answer in one message)
- **Q1. Postgres host:** Supabase or Neon? (Default: Supabase, Mumbai region.)
- **Q2. Mid-term docs:** will you add them to `~/FPO_SETU/docs/`, or should I proceed without them?
- **Q3. Public gateway URL.** Vercel-hosted portals must reach a gateway running on your PC. Options:
  (a) Cloudflare quick tunnel: no account, but the URL changes on every restart, so you must update `API_URL` in all portals each time;
  (b) ngrok free static domain: needs a free ngrok account, but the URL is stable. Recommended.
  Which one?
- **Q4. WSL memory:** keep the 7.6 GiB default with the lite profile, or raise it to about 11 GB in `.wslconfig` (the host has 15.7 GB) so we can run the full 3-orderer profile? Default: keep lite.
- **Q5. Commits:** may I commit and push to `origin` (github.com/developerashutosh123/FPO_SETU)? The `.devcontainer/` folder sits at the repo root, outside my folder, as PROMPT.md requires. Shall I include it in my commits? Default: commit locally only, push when you say so.
