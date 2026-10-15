# Pinned versions (network/)

Fabric 2.5 LTS line and Fabric CA 1.5 line. **No Fabric 3.x.** Pinned on 15-10-2026, the newest releases of each line at that date (GitHub releases of hyperledger/fabric and hyperledger/fabric-ca).

| Component | Version | Where it is pinned |
|---|---|---|
| Fabric peer, orderer, tools (`peer`, `osnadmin`, `configtxgen`, `configtxlator`, `discover`) | **2.5.16** (commit f871cf9) | `scripts/lib.sh` `FABRIC_VERSION`; image tags in `docker-compose.yaml` |
| Fabric CA server and client | **1.5.22** | `scripts/lib.sh` `FABRIC_CA_VERSION`; image tag in `docker-compose.yaml` |
| Chaincode build image `fabric-ccenv` | 2.5.16 | `CORE_CHAINCODE_BUILDER` in `docker-compose.yaml` (not the floating `2.5` tag) |
| Chaincode runtime image `fabric-baseos` | 2.5.16 | `CORE_CHAINCODE_GOLANG_RUNTIME` in `docker-compose.yaml` |
| State database | LevelDB (`goleveldb`) | `CORE_LEDGER_STATE_STATEDATABASE` |
| Channel capabilities | Channel V2_0, Orderer V2_0, Application V2_5 | `configtx/configtx.yaml` |
| Consensus | Raft (etcdraft), 1 consenter in the lite profile | `configtx/configtx.yaml` |
| Installer | `scripts/install-fabric.sh`, sha256 `740eacc549dbb4c124bcddccc36c18ddd065bc8cb6eb8899030c9d83ea42ac3c`, copied from hyperledger/fabric `main` on 15-10-2026 | committed in this folder |

Local image IDs when pinned (the install script also tags the same images `2.5`, `1.5` and `latest` locally; the compose file uses only the exact tags):

```
hyperledger/fabric-baseos:2.5.16 109b4a15b282
hyperledger/fabric-ca:1.5.22 87c36f0b6558
hyperledger/fabric-ccenv:2.5.16 807493f095f6
hyperledger/fabric-orderer:2.5.16 1d918fc7e1e0
hyperledger/fabric-peer:2.5.16 58979b65744b
```

Host toolchain (WSL2 Ubuntu): go 1.23.4, node 22.23.3, pnpm 12.11.2, docker 29.7.2, compose v5.4.0.

To change a version: edit `FABRIC_VERSION`/`FABRIC_CA_VERSION` in `scripts/lib.sh` and the image tags in `docker-compose.yaml`, run `make reset`, `make up`, and update this file.
