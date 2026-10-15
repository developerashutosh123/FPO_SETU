# FPO-SETU: Setup Guide for the Team (no Linux needed)

## 1. What you are setting up

```
fpo-setu/   (one GitHub repo)
  shared/            contract that all chats follow (written already; owned by chat 00)
  00-core-ledger/    Fabric 2.5 + gateway API          → runs in GitHub Codespaces
  01-farmer-app/     Expo app                          → Expo Go / APK / web on Vercel
  02-fpo-console/    → Vercel
  03-bank-portal/    → Vercel
  04-buyer-portal/   → Vercel
  05-consumer-site/  → Vercel
  06-gov-dashboard/  → Vercel  (also hosts the public Ledger Explorer)
```
There are **7 Claude Code chats, one per folder.** Chat 00 must reach CHECKPOINT C1 before any of the others start. After that, chats 01-06 can run in parallel.

## 2. Why Codespaces instead of a Linux PC
Hyperledger Fabric needs Docker on Linux. **GitHub Codespaces** gives you a Linux machine in the browser, and nothing is installed on your PC.
- The free allowance is 120 core-hours a month on GitHub Free and 180 on GitHub Pro. GitHub Pro is free with the GitHub Student Developer Pack. A 4-core machine therefore gives you about 30 hours a month on Free, or 45 on Pro, and core-hours are only used while the Codespace is running.
- Stop the Codespace when you are not using it.
- When it sleeps, the six websites stay up in **read-only mode** (the "index-only" banner) through the read-API on Vercel. Writes need the Codespace running.
- If you later want the ledger live 24/7, chat 00 has optional scripts (`deploy/vm/`) for a cloud VM. You would still not need Linux on your PC.

## 3. Step by step

### Step 1: Accounts (one-time)
- [ ] **GitHub** account. Apply for the **GitHub Student Developer Pack** with your IIT KGP email; it gives GitHub Pro.
- [ ] **Vercel** account (sign in with GitHub). Hobby plan is fine.
- [ ] **Expo** account (expo.dev).
- [ ] **Supabase** account (or Neon) for Postgres.
- [ ] **data.gov.in** account, for the AGMARKNET price API key.

### Step 2: Create the repo
1. Create a new GitHub repo `fpo-setu` (private is fine).
2. Upload this whole folder structure (`shared/`, `00-…` to `06-…`, this file).
3. Create `docs/` at the root and put the mid-term deck, report and guidelines PDF in it.

### Step 3: Start chat 00 in a Codespace
1. On the repo page, click **Code → Codespaces → ⋯ → New with options**, choose **4-core**, and create it.
2. In the Codespace terminal, run:
   ```
   npm i -g @anthropic-ai/claude-code
   cd 00-core-ledger && claude --add-dir ../shared
   ```
   Log in to Claude when asked, then paste the kickoff line from `00-core-ledger/PROMPT.md`.
3. In GitHub **Settings → Codespaces**, set the default idle timeout to the maximum before demo days.

### Step 4: After chat 00 says "Contract frozen, portal chats can start"
1. Clone the repo on your PC (Git for Windows + Node 22 LTS + pnpm), or open more terminals in the same Codespace. Portal chats need no Docker.
2. For each portal folder, open a separate terminal or Claude Code window:
   ```
   cd 02-fpo-console
   claude --add-dir ../shared
   ```
   Paste that folder's kickoff line. Repeat for 01, 03, 04, 05 and 06.
3. **Before every session in every chat, pull from Git**, because seven chats share one repo. Each chat commits only inside its own folder.

### Step 5: Go live
1. When chat 00 reaches C5, it gives you `API_URL` (the Codespace public port) and `READ_API_URL` (Vercel). Paste both into each portal chat at its Phase P5.
2. Each portal chat deploys to Vercel at P6. Then give every chat the full list of six URLs, so the cross-portal links point at production. Set these env vars on every Vercel project:
   ```
   NEXT_PUBLIC_URL_FARMER_WEB, NEXT_PUBLIC_URL_FPO, NEXT_PUBLIC_URL_BANK,
   NEXT_PUBLIC_URL_BUYER, NEXT_PUBLIC_URL_CONSUMER, NEXT_PUBLIC_URL_GOV
   ```
3. Add all six Vercel domains to `CORS_ORIGINS` in chat 00's gateway env.

## 4. API keys and secrets: what you need, where to get it, where it goes

| # | Key / secret | Needed? | Where to get it | Goes into |
|---|---|---|---|---|
| 1 | `DATABASE_URL` (Postgres connection string, pooled) + `DIRECT_URL` | **Required** | Supabase → Project → Connect (choose the Mumbai region if offered), or Neon | 00 gateway `.env`, 00 read-api (Vercel env) |
| 2 | `DATAGOVIN_API_KEY` | **Required** (real mandi prices) | data.gov.in → sign up → My Account → API key. Resource: "Current Daily Price of Various Commodities from Various Markets (Mandi)" | 00 gateway `.env` |
| 3 | `JWT_SECRET` | **Required** | Generate it yourself: chat 00 runs `openssl rand -hex 32` | 00 gateway `.env` and read-api |
| 4 | `FARMER_TOKEN_SECRET` (HMAC for pseudonymous farmer tokens) | **Required** | Generate it yourself, the same way | 00 gateway `.env` |
| 5 | Expo login / `EXPO_TOKEN` | **Required** for the app | expo.dev → Account → Access tokens (or just run `eas login` interactively) | 01 (only for EAS build/update) |
| 6 | Vercel login / `VERCEL_TOKEN` | Optional (CLI deploys) | vercel.com → Account Settings → Tokens. Without it, import each folder via the Vercel dashboard. | 02-06, 00 read-api |
| 7 | AGMARKNET history CSVs | **Required** for price history | Download from the AGMARKNET portal for Potato, Brinjal, Cauliflower, Tomato and Paddy at the Paschim Medinipur markets, last 2 seasons. The daily API only gives today's prices. | Give the files to chat 00 |
| 8 | Unsplash / Pexels API keys | Optional | Only if chats download images via API; manual downloads work too | the portal that needs them |
| 9 | Cloudflare tunnel / ngrok authtoken | Optional (fallback) | A Cloudflare quick tunnel needs no account; ngrok gives a free static domain | 00 runbook |

**You do NOT need keys for** Hyperledger Fabric (it creates its own certificates), AgriStack, NERL/CCRL e-NWR, e-NAM, ONDC, UPI/NPCI, Bhashini, OCEN, Account Aggregator or NCGTC. None of these are open to student projects, so they are **simulated adapters**, clearly labelled in the UI. Map tiles use OpenStreetMap, which needs no key at prototype traffic.

**Rules:** never paste keys into a prompt or commit them. Put them in `.env` files (gitignored) and in Vercel/Codespaces secrets. Codespaces secrets live under GitHub → Settings → Codespaces → Secrets; they become environment variables automatically.

## 5. Field work the team must do (the prototype cannot do this for you)
- [ ] Verify the proposed partner FPOs (Debra Agri Business PCL, Keshiary Agro PCL, Humgarh FPC) on the MCA portal (company status "Active"). Contact them through **ABIF, IIT Kharagpur**, which runs an FPO directory.
- [ ] Confirm Gopalpur (Keshiary) as a village in the Census 2011 directory and the LGD codes, and confirm the cold storages near Debra.
- [ ] Have a native Bengali speaker review every string marked `_review: true` (farmer app, consumer site).
- [ ] Get permission before photographing any farmer for the app. Otherwise use only licensed photos.

## 6. Demo day checklist
1. 20 minutes before: start the Codespace, run `make resume` in `00-core-ledger`, and check `API_URL/health` shows `live`.
2. Open six browser tabs, one per portal, plus the farmer app on a phone (Expo Go QR or APK).
3. Set `NEXT_PUBLIC_DEMO_MODE=true` on the Vercel projects, so the demo bar guides the 10 steps.
4. Have the backup screen recording ready (chat 00's `docs/PROFESSOR_DEMO.md` includes the recording plan).
