# Decisions (00-core-ledger)

Every deviation from the mid-term report or from PROMPT.md is recorded here.

## D1. Runtime: local WSL2 + Docker Desktop, not Codespaces (2026-10-16)
The human runs everything locally in WSL2 Ubuntu with Docker Desktop. PROMPT.md assumes a GitHub Codespace. Consequences:
- `.devcontainer/devcontainer.json` is still created (so Codespaces stays an option) but is not the active environment.
- `hostRequirements.memory: 16gb` in the devcontainer applies to Codespaces only. It does not apply to the local WSL2 setup.
- Public exposure of the gateway (port 8080) uses a tunnel from WSL instead of a Codespaces forwarded port. See open question Q3 in HUMAN_STEPS.md.
- "Codespace sleeps" becomes "the PC is off or WSL is stopped". The read-only fallback API (Phase C5) matters for that reason.
- Postgres stays hosted outside the machine (Supabase or Neon) so that the read-only API survives the PC being off.

## D2. Fabric profile: LITE (1 Raft orderer) (2026-10-16)
Measured on the human's machine:

| Item | Value |
|---|---|
| Windows host RAM | 15.7 GB |
| WSL2 VM RAM (`free -h`) | 7.6 GiB total, 6.3 GiB available at idle, 2.0 GiB swap |
| Docker Desktop (WSL2 backend) | sees the same 7.6 GiB (8,161,746,944 bytes) and 16 CPUs |
| CPUs | 16 logical |
| Disk | about 954 GB free |
| Idle WSL usage | about 1.3 GiB |

Choice: **lite** = 1 Raft orderer, 4 peers (LevelDB), 5 CAs.
Reasons:
- WSL2 defaults to half of host RAM, so the stack has about 6 GiB, not 16.
- The same 6 GiB must also hold the Go toolchain for chaincode builds, the Node gateway, a test Postgres container and Claude Code itself.
- Chaincode runs in its own containers: lot-lifecycle on 4 peers, pledge-lien on 3, order-settlement on 2. That is up to 9 extra containers.
- Both profiles use the same channels, chaincodes, policies and PDCs. Only the orderer count differs. A 1-node Raft cluster has no fault tolerance, and the explorer must say so honestly (`raftLeader` is the single orderer).

Upgrade path: the full profile (3 orderers) needs about 2 extra orderer containers. If `docker stats` at CHECKPOINT C2 shows the lite stack well under 3 GiB, we can switch to full. Alternatively the human can raise the WSL limit with `C:\Users\ashut\.wslconfig` (`[wsl2] memory=11GB`, then `wsl --shutdown`). The host has 15.7 GB, so 11 GB leaves Windows about 4.7 GB. This is a human decision. The stack will be measured, not guessed, at C2.

Memory figures per container are not yet measured. Real numbers will replace this paragraph at C2.
