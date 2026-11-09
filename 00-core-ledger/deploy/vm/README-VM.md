# Deploy on an x86_64 Azure VM (Ubuntu 24.04), ngrok mode

The whole backend (Fabric network, 3 chaincodes, gateway + indexer, ngrok tunnel) runs on one VM and starts again by itself after a reboot. The **reserved ngrok domain stays the same, so the deployed Vercel portals and the read-API need no change**: `API_URL = https://repaying-chant-consumer.ngrok-free.dev`. ngrok dials out, so **no inbound port is needed**: leave the default NSG (SSH 22 only) and do not open 8080 or any Fabric port.

`deploy/vm/deploy.sh` detects the CPU (`uname -m`): `x86_64` gives `linux/amd64` image pins and the `linux-amd64` Go tarball; `aarch64` gives the ARM64 equivalents. To force one: `FPOSETU_ARCH=amd64 ./deploy/vm/deploy.sh` (or `arm64`). The Oracle ARM specifics are in `README-ORACLE.md`.

| Piece | How it is kept alive |
|---|---|
| 5 CAs, 3 orderers, 4 peers (12 containers) | Docker, `restart: unless-stopped` (`docker-compose.prod.yaml`); Docker itself is `systemctl enable`d |
| Chaincode containers (`dev-peer*`) | started by the peers on first use after a boot (first transaction after a reboot is a few seconds slower) |
| Gateway API **and block indexer (one process)** | `fposetu-gateway.service`, `Restart=always`, enabled at boot |
| ngrok tunnel on the reserved domain | `fposetu-ngrok.service`, `Restart=always`, enabled at boot |

The indexer is not a separate service: the gateway starts it inside its own process, and a second indexer would race the first for the same blocks. `fposetu-gateway.service` is the indexer's unit.

## VM size

Standard_D4s_v5 (4 vCPU / 16 GB) recommended; Standard_D2s_v5 (2 vCPU / 8 GB) will OOM on the chaincode builds. Image: Ubuntu Server 24.04 LTS x64 Gen2. OS disk 64 GB or more (Premium SSD). Admin user `azureuser`; it has passwordless sudo on Azure. NSG: inbound TCP 22 only.

## 1. On the VM: tmux, then clone

```bash
ssh -i <your-key> azureuser@<VM_PUBLIC_IP>
sudo apt-get update && sudo apt-get install -y tmux git
tmux new -s deploy              # reattach later: tmux attach -t deploy
git clone https://github.com/developerashutosh123/FPO_SETU.git ~/FPO_SETU   # private repo: gh auth login, or a read-only deploy key
cd ~/FPO_SETU/00-core-ledger
```

Already cloned: `cd ~/FPO_SETU && git pull origin main && cd 00-core-ledger`.

## 2. Create `gateway/.env` (gitignored; the only place secrets live)

```bash
cp deploy/vm/.env.example gateway/.env && chmod 600 gateway/.env
nano gateway/.env
```

Required: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET` (identical to the Vercel read-api's), `FARMER_TOKEN_SECRET`, `PRICE_SALT_SECRET` (each at least 32 chars), `NGROK_AUTHTOKEN`, `NGROK_DOMAIN=repaying-chant-consumer.ngrok-free.dev` (no `https://`), `CORS_ORIGINS`. Copy the values from the laptop's `gateway/.env`. Plain `KEY=value` lines, no `export`, no trailing `# comment` on a value line (systemd reads the file too). `deploy.sh` checks them and never prints them.

**One tunnel per domain.** Stop `make tunnel` on the laptop before the VM tunnel starts, or the VM logs `ERR_NGROK_334` and retries until the laptop one is gone.

## 3. Run `deploy.sh` (full bring-up, end to end)

```bash
cd ~/FPO_SETU/00-core-ledger
./deploy/vm/deploy.sh --yes             # full: ~150 members, ~540 lots; roughly 45 min of seeding
```

First run on a new VM, optional smoke test with a small seed, then start over from an empty ledger:

```bash
./deploy/vm/deploy.sh --scale mini --yes
./network/scripts/network.sh reset      # wipes the VM's ledger, crypto and wallet
./deploy/vm/deploy.sh --yes
```

Without `--yes` it asks once, before installing anything; type `RESEED`. **The reseed clears the seeded rows (members, lots, orders, index) in the database named by `DATABASE_URL`**; `price_series` and `msp_entries` are kept. A ledger that is already seeded is detected and the reseed is skipped.

In order, it:

1. checks `gateway/.env` and the machine (x86_64 detected, memory);
2. installs Docker + compose, Go 1.23.4 (`linux-amd64`, checksum verified), Node 22, pnpm, ngrok, tmux; enables Docker at boot;
3. checks every Fabric image has a `linux/amd64` variant and pulls it (`check-images.sh`);
4. starts the Fabric network (5 CAs, 3 orderers, 4 peers, 3 channels) with the production override (`restart: unless-stopped`, log rotation), and checks 12 containers and all Raft leaders;
5. deploys the 3 chaincodes (`lot-lifecycle`, `pledge-lien`, `order-settlement`); first build 10 to 20 minutes;
6. installs the gateway dependencies, runs the DB migrations, installs and starts `fposetu-gateway.service` and `fposetu-ngrok.service` (enabled at boot);
7. reseeds deterministically (seed `20261015`, hard-coded in `gateway/scripts/seed-ledger.ts`) and runs `pnpm verify:index`;
8. checks `/health` shows `ledgerMode: live`, locally and through the ngrok domain.

Options: `--skip-reseed`, `--scale full|mini`, `--skip-install`, `--yes`. Safe to run again; finished steps are skipped. If the script has just added you to the `docker` group it continues itself in a shell that has it.

## 4. Verify `/health`

On the VM:

```bash
curl -s localhost:8080/health | jq .
systemctl is-enabled fposetu-gateway fposetu-ngrok docker      # enabled x3
systemctl is-active  fposetu-gateway fposetu-ngrok             # active x2
deploy/vm/fabric-compose.sh ps                                 # 12 containers, all Up
docker inspect -f '{{.Name}} {{.HostConfig.RestartPolicy.Name}}' $(deploy/vm/fabric-compose.sh ps -q)   # 12 lines ending unless-stopped
```

From anywhere else (laptop, phone):

```bash
curl -s https://repaying-chant-consumer.ngrok-free.dev/health -H 'ngrok-skip-browser-warning: 1' | jq .
```

Expected: `"ok": true`, **`"ledgerMode": "live"`**, `contractVersion`, and three channels (`trace-channel`, `finance-channel`, `trade-channel`) each with a height.

## 5. Survives a reboot

```bash
sudo reboot
```

Nothing to run afterwards. Within about 1 to 3 minutes `/health` through the ngrok domain answers `live` again (Docker restarts the 12 containers, the gateway and tunnel units start on their own). Heights are unchanged: the ledger is on Docker volumes. While waiting: `journalctl -u fposetu-gateway -n 30 --no-pager`, `journalctl -u fposetu-ngrok -n 30 --no-pager`.

## Day-to-day

| What | Command |
|---|---|
| Gateway / tunnel log | `journalctl -fu fposetu-gateway` / `journalctl -fu fposetu-ngrok` |
| Restart gateway / tunnel | `sudo systemctl restart fposetu-gateway` / `fposetu-ngrok` |
| Fabric containers | `deploy/vm/fabric-compose.sh ps` / `logs -f --tail=100 peer0.fpo.setu.local` |
| Fresh demo stock | `cd gateway && pnpm seed:demo-refresh --status`, then `pnpm seed:demo-refresh` |
| Pull new code | `git pull`, `cd gateway && pnpm install --frozen-lockfile`, `sudo systemctl restart fposetu-gateway` |
| Change `.env` | edit `gateway/.env`, then `sudo systemctl restart fposetu-gateway fposetu-ngrok` |
| Start over from an empty ledger | `network/scripts/network.sh reset`, then `./deploy/vm/deploy.sh --yes` |

Do not use `make resume`, `make up` or `network.sh up` on the VM after `deploy.sh`: they use the base compose file only and would recreate the containers without the production override. Use `deploy/vm/fabric-compose.sh up -d` to start them by hand.

## Notes

- **Untested on a real Azure VM.** The scripts were edited and syntax-checked (`bash -n`) on another machine; nothing was executed. The first run is the real test. If a step fails the message names it, and the script can be run again.
- Fabric host binaries (`peer`, `osnadmin`, `configtxgen`) are fetched by `network/scripts/install-fabric.sh`, which already maps `x86_64` to `amd64`.
- The chaincode is built on the VM inside the `fabric-ccenv` image for this CPU; the host Go toolchain is only used for `go mod vendor`.
- A new, empty Supabase database needs `price_series` loaded before the seed (`cd gateway && pnpm load:csv`, or `pnpm prices:snapshot` with `DATAGOVIN_API_KEY`).
