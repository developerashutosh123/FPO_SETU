> **x86_64 VM (Azure, AWS, ...)? Use [README-VM.md](README-VM.md).** `deploy.sh` now detects the CPU; this file keeps the Oracle ARM64 specifics (shape, capacity, ARM caveats). `check-arm64.sh` is now `check-images.sh`, and the compose override pins `${FPOSETU_PLATFORM}` instead of a fixed linux/arm64.

# Deploy on an Oracle Cloud Always Free Ampere A1 VM (ARM64, Ubuntu 22.04), ngrok mode

The whole backend (Fabric network, 3 chaincodes, gateway + indexer, ngrok tunnel) runs on one Always Free VM and starts again by itself after a reboot. The **reserved ngrok domain stays the same, so the deployed Vercel portals and the read-API need no change** (`API_URL = https://repaying-chant-consumer.ngrok-free.dev`). ngrok dials out, so **no inbound firewall rule or port is needed**: leave the VM's default rules (SSH 22 only) as they are, and do not open 8080 or any Fabric port.

What runs where after `deploy.sh`:

| Piece | How it is kept alive |
|---|---|
| 5 CAs, 3 orderers, 4 peers (12 containers) | Docker, `restart: unless-stopped` (`docker-compose.prod.yaml`), Docker itself is enabled at boot |
| Chaincode containers (`dev-peer*`) | started by the peers on first use after a boot (the first transaction after a reboot is a few seconds slower) |
| Gateway API + block indexer (one process) | `fposetu-gateway.service`, `Restart=always`, enabled at boot |
| ngrok tunnel on the reserved domain | `fposetu-ngrok.service`, `Restart=always`, enabled at boot |

> **The indexer is not a separate service.** The gateway starts the indexer inside its own process (`gateway/src/index.ts`), and read-after-write and the SSE stream depend on it being that same process. A second indexer process would race the first for the same blocks and the gateway would stop publishing SSE events. So `fposetu-gateway.service` *is* the indexer's unit: if it crashes, the unit restarts both, and the indexer resumes from its database checkpoint.

## Minimum spec

| | |
|---|---|
| Shape | `VM.Standard.A1.Flex` (Ampere A1, ARM64) |
| **Minimum** | **2 OCPU / 12 GB RAM** (the 12 Fabric containers are capped at about 5.8 GB, plus up to 9 chaincode containers and the gateway) |
| Allowed on Always Free | up to 4 OCPU / 24 GB in total. Use 4 OCPU / 24 GB if you can get it: chaincode builds and the seed are faster |
| Image | Canonical Ubuntu 22.04 (**aarch64**) |
| Boot volume | 100 GB (Always Free gives 200 GB in total) |
| Network | a public IPv4 only so that you can SSH in. Default security list: ingress TCP 22. Nothing else |

If the console says *Out of host capacity* for A1, try another availability domain, or retry later; it is a known shortage, not an error in your setup.

## 1. SSH in, and work inside tmux

Everything below runs on the VM as the default `ubuntu` user (not root). A full seed runs for a long time, so use tmux: if SSH drops, the deploy keeps going and you can reattach.

```bash
ssh -i ~/.ssh/<your-key> ubuntu@<VM_PUBLIC_IP>
sudo apt-get update && sudo apt-get install -y tmux git
tmux new -s deploy            # reattach later with: tmux attach -t deploy
```

## 2. Install Docker + compose (`deploy.sh` does this too and skips it if present; do it now if you want to see it work)

```bash
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu
newgrp docker                 # use the new group in this shell (or log out and back in)
docker run --rm hello-world   # prints "Hello from Docker!" and the line "(arm64v8)"
docker compose version
```

## 3. Clone

The `deploy/vm/` folder must be committed and pushed from your PC first (it is new). The repository is `developerashutosh123/FPO_SETU`; if it is private, authenticate (`gh auth login` after `sudo apt-get install -y gh`, or a read-only deploy key).

```bash
cd ~
git clone https://github.com/developerashutosh123/FPO_SETU.git
cd FPO_SETU/00-core-ledger
ls deploy/vm
```

## 4. Create `gateway/.env` (the only place secrets live; it is gitignored)

```bash
cp deploy/vm/.env.example gateway/.env
chmod 600 gateway/.env
nano gateway/.env
```

Fill in every variable in this table. **Never paste these values into a chat, an issue or a commit.** `deploy.sh` checks that they are set and long enough, and never prints them.

| Variable | Required | What to put | Where it comes from |
|---|---|---|---|
| `DATABASE_URL` | yes | the Supabase **pooled** (transaction, port 6543) connection string | the same value as in your PC's `gateway/.env` (Supabase, Connect) |
| `DIRECT_URL` | yes | the Supabase **direct** connection string (used by `db:migrate`) | same |
| `JWT_SECRET` | yes | at least 32 characters. **Must equal the `JWT_SECRET` of the Vercel `read-api` project**, or tokens stop validating | copy from your PC's `.env` |
| `FARMER_TOKEN_SECRET` | yes | at least 32 characters | copy from your PC's `.env` (or `openssl rand -hex 32`) |
| `PRICE_SALT_SECRET` | yes | at least 32 characters | copy from your PC's `.env` (or `openssl rand -hex 32`) |
| `NGROK_AUTHTOKEN` | yes | your ngrok authtoken | dashboard.ngrok.com, *Your Authtoken*. Read by the tunnel from its environment; never printed or put on a command line |
| `NGROK_DOMAIN` | yes | `repaying-chant-consumer.ngrok-free.dev` (no `https://`) | your reserved static domain, already filled in the template |
| `CORS_ORIGINS` | yes | the six portal origins (or the `https://fposetu-*.vercel.app` wildcard), the ngrok origin and localhost | copy from your PC's `.env` so it stays identical |
| `PORT` | no | `8080` | default |
| `DB_POOL_MAX` | no | `10` | default |
| `DATAGOVIN_API_KEY` | no | key for live AGMARKNET prices | data.gov.in (copy from your PC's `.env`) |
| `DEMO_PASSWORD`, `DEMO_OTP` | no | demo logins | defaults `Setu@2026`, `123456` |
| `URL_FARMER_WEB`, `URL_FPO`, `URL_BANK`, `URL_BUYER`, `URL_CONSUMER`, `URL_GOV`, `READ_API_URL` | no | public portal and read-API URLs returned by `GET /config/public` | the real Vercel URLs (the template has the expected names) |
| `NETWORK_DIR`, `WALLET_DIR` | no | leave `../network` and `../wallet` | |

Rules for the file (systemd reads it too): `KEY=value` lines only, no `export`, no spaces around `=`, and **no trailing `# comment` on a value line**.

**One tunnel per domain.** A reserved ngrok domain can be online from one machine at a time. Stop `make tunnel` on your PC (Ctrl-C) before, or right after, the VM tunnel starts; otherwise the VM's tunnel logs `ERR_NGROK_334` and retries until the PC one is gone.

## 5. Run `deploy.sh`

```bash
cd ~/FPO_SETU/00-core-ledger
./deploy/vm/deploy.sh --scale mini      # first time: small seed, to check the pipeline
```

It asks once, at the start, before installing anything: type `RESEED` to allow the fresh reseed. **That step clears the seeded rows (members, lots, orders, index) in the database named by `DATABASE_URL`**, so the deployed portals show the new VM ledger from then on. `price_series` and `msp_entries` are kept. Add `--yes` to skip the question.

Then do the real thing, from an empty ledger (a ledger that is already seeded is detected and the reseed is refused, because a second seed would collide with the first one's lots):

```bash
./network/scripts/network.sh reset      # only if you ran the mini seed above: wipes the VM's ledger, crypto and wallet
./deploy/vm/deploy.sh                   # full seed (150 members, about 540 lots; the PC runbook measured about 44 minutes against Supabase Mumbai)
```

Options: `--skip-reseed` (everything except the seed; **do not** use it on a fresh ledger while the database still describes the old one: run `pnpm db:reset-seed --yes` yourself first), `--scale full|mini`, `--skip-install`, `--yes`. The script is safe to run again; each step skips what is already done.

What it does, in order: checks `.env` and the machine, installs Docker, Go, Node 22, pnpm and ngrok (all ARM64), proves every Fabric image has a `linux/arm64` variant and pulls them (`check-arm64.sh`), brings the network up and applies the production override, deploys the three chaincodes, installs the gateway dependencies, runs the database migrations, installs and starts `fposetu-gateway` and `fposetu-ngrok`, reseeds, runs `pnpm verify:index` (index equals ledger), and checks `/health`.

## 6. Verify

On the VM:

```bash
curl -s localhost:8080/health | jq .
systemctl is-enabled fposetu-gateway fposetu-ngrok docker      # enabled x3
systemctl is-active  fposetu-gateway fposetu-ngrok             # active x2
deploy/vm/fabric-compose.sh ps                                 # 12 containers, all "Up"
docker inspect -f '{{.Name}} {{.HostConfig.RestartPolicy.Name}}' $(deploy/vm/fabric-compose.sh ps -q)   # 12 lines ending unless-stopped
```

From **anywhere else** (your PC, your phone on mobile data), through the tunnel:

```bash
curl -s https://repaying-chant-consumer.ngrok-free.dev/health -H 'ngrok-skip-browser-warning: 1' | jq .
```

Expected, both times: `"ok": true`, **`"ledgerMode": "live"`**, `contractVersion`, and three channels with a height each:

```json
{"ok":true,"ledgerMode":"live","contractVersion":"1.0.4","channels":{"trace-channel":{"height":N},"finance-channel":{"height":N},"trade-channel":{"height":N}}}
```

Then open one of the deployed portals: it must **not** show the amber *index-only* banner.

## 7. Confirm it survives a reboot

```bash
sudo reboot
```

Wait about two minutes, SSH back in (no command to run: nothing needs starting), and repeat the checks of step 6. Expect the `/health` through the ngrok domain to answer `"ledgerMode":"live"` within roughly 1 to 3 minutes of the VM coming up (Docker restarts the 12 containers, the peers and the Raft leaders settle, the gateway reconnects on its own). Heights are the same as before the reboot: the ledger is on Docker volumes. Useful while waiting:

```bash
uptime
journalctl -u fposetu-gateway -n 30 --no-pager
journalctl -u fposetu-ngrok -n 30 --no-pager
```

## Day-to-day

| What | Command |
|---|---|
| Gateway log (follow) | `journalctl -fu fposetu-gateway` |
| Tunnel log (follow) | `journalctl -fu fposetu-ngrok` |
| Restart the gateway / tunnel | `sudo systemctl restart fposetu-gateway` / `fposetu-ngrok` |
| Fabric containers | `deploy/vm/fabric-compose.sh ps` / `logs -f --tail=100 peer0.fpo.setu.local` |
| Fresh demo stock | `cd gateway && pnpm seed:demo-refresh --status`, then `pnpm seed:demo-refresh` |
| Pull new code | `git pull`, `cd gateway && pnpm install --frozen-lockfile`, `sudo systemctl restart fposetu-gateway` |
| Change `.env` | edit `gateway/.env`, then `sudo systemctl restart fposetu-gateway fposetu-ngrok` |
| Start over from an empty ledger | `network/scripts/network.sh reset`, then `./deploy/vm/deploy.sh` |

Do not use `make resume`, `make up` or `network.sh up` on the VM after `deploy.sh`: they use the base compose file only and would recreate the containers without the production override. Use `deploy/vm/fabric-compose.sh up -d` if you ever need to start them by hand.

## A new database

Everything above reuses your existing Supabase project, which already holds `price_series` (real AGMARKNET history, kept across reseeds). If you point `DATABASE_URL` at an **empty** Supabase project, `deploy.sh` still applies the migrations, but the seed refuses to start without real prices: load them first (copy the CSVs to `gateway/data/agmarknet/` and run `cd gateway && pnpm load:csv`, or `pnpm prices:snapshot` with `DATAGOVIN_API_KEY` set), and also set the same `JWT_SECRET` and `DATABASE_URL` in the Vercel read-api project.

## ARM64 caveats

1. **All five Fabric images have a native `linux/arm64` variant** at the pinned tags, so nothing runs under emulation: `hyperledger/fabric-peer:2.5.16`, `fabric-orderer:2.5.16`, `fabric-ccenv:2.5.16`, `fabric-baseos:2.5.16`, `fabric-ca:1.5.22` (checked against Docker Hub on 09-11-2026 with `deploy/vm/check-arm64.sh`; `deploy.sh` re-checks on every run and refuses to continue if one lacks it). The override sets `platform: linux/arm64`, so an image without an arm64 build fails to start instead of running slowly under qemu.
2. **The chaincode is built on the VM**, inside the arm64 `fabric-ccenv` image, so the first install of each chaincode compiles Go on ARM and downloads modules: 10 to 20 minutes in total. Later deploys are skipped when the source is unchanged. The Go toolchain on the host is only used for `go mod vendor`.
3. **Fabric host binaries** (`peer`, `osnadmin`, `configtxgen`) are downloaded by `network/scripts/install-fabric.sh` as the `linux-arm64` release tarballs (it detects `uname -m`).
4. **Node native modules.** The gateway has one optional native dependency (`pkcs11js`, an HSM binding) that is not used here. `build-essential` and `python3` are installed in case pnpm decides to compile it; pnpm 12 skips unapproved build scripts anyway. If `pnpm install --frozen-lockfile` stops with `ERR_PNPM_IGNORED_BUILDS`, make sure `CI` is not set in your shell (`unset CI`) and run it again.
5. **Memory.** The base compose file caps containers at about 5.8 GB in total (peers 1 GB each, orderers 384 MB, CAs 128 MB); the chaincode containers and the gateway come on top, so 12 GB is the floor, not a comfort zone. `docker stats --no-stream` shows the real use.
6. **Oracle reclaims idle Always Free instances** (CPU, network and memory all under about 20% for 7 days). A running ledger with the indexer and ngrok is not idle in practice, but if the VM ever disappears the Fabric state is gone with it: take a boot-volume backup after a good seed (console: Block Storage, Boot Volumes, Backups).
7. **Not tested on real Ampere hardware by the author of these scripts.** The image availability, the compose override, the systemd command lines and the `.env` checks were verified from an x86 machine. The first run on the A1 is the real test: if a step fails, the message names the step, and the script can be run again.
