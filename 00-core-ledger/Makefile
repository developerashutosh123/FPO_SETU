# FPO-SETU core ledger. Local WSL2 + Docker Desktop. See network/VERSIONS.md for pinned versions.
NET := ./network/scripts/network.sh
.PHONY: up resume rebuild down reset status logs stats

up:        ## create what is missing and start the network (idempotent)
	$(NET) up
resume:    ## restart after the PC or WSL was stopped, on existing volumes
	$(NET) resume
rebuild:   ## wipe everything and build again from scratch (chaincode deploy and seed are added in C3/C4)
	$(NET) reset
	$(NET) up
	@if [ -x ./scripts/deployCC.sh ]; then ./scripts/deployCC.sh; fi
down:      ## stop containers, keep volumes
	$(NET) down
reset:     ## remove containers, volumes, crypto, wallet
	$(NET) reset
status:    ## peers, channels, orderer, Raft leader, resource use
	$(NET) status
logs:      ## docker compose logs, e.g. make logs SVC=peer0.fpo.setu.local
	docker compose -f network/docker-compose.yaml --env-file network/.env logs -f --tail=100 $(SVC)
stats:
	docker stats --no-stream
