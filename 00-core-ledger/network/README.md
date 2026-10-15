# network/

Full profile: 5 CAs, 3 Raft orderers, 4 peers (LevelDB), 3 channels. Use the Makefile in the parent folder.

| Command | What it does |
|---|---|
| `make up` | Creates what is missing: CA enrolment, genesis blocks, channel joins, anchor peers. Safe to run again (about 7 s when nothing is missing). |
| `make resume` | Same as `up`; use it after the PC or WSL was stopped. Ledgers and identities survive. |
| `make down` | Removes containers; keeps volumes, crypto and wallet. |
| `make reset` / `make rebuild` | Wipes everything, then (rebuild) brings it back, about 26 s for the network alone. |
| `make status` | Peers, channel heights, orderer, Raft leader, memory use. |
| `make logs SVC=peer0.fpo.setu.local` | Follow one container. |

Identities: `scripts/enroll.sh` registers each persona (CONTRACT.md Section 5) and the devices `WB-CHG-01`, `QM-CHG-01` with a `role` attribute and writes `wallet/<MSP>/<name>/{cert.pem,key.pem}` (gitignored). Generated passwords are in `network/.env` (gitignored).

Host ports (all bound to 127.0.0.1): CAs 7054 fpo, 8054 bank, 9054 buyer, 10054 regulator, 11054 orderer. Peers 7051 fpo, 9051 bank, 11051 buyer, 13051 regulator; peer operations 9444 to 9447. Orderers: orderer1 7050/7053/9443, orderer2 8050/8053/9453, orderer3 9050/9053/9463 (client / osnadmin / operations and metrics).

Channels: `trace-channel` (FPO, Bank, Buyer, Regulator), `finance-channel` (FPO, Bank, Regulator), `trade-channel` (FPO, Buyer). The Regulator is not on trade-channel.
