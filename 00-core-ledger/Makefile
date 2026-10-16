# FPO-SETU core ledger. Local WSL2 + Docker Desktop. See network/VERSIONS.md for pinned versions.
NET := ./network/scripts/network.sh
.PHONY: check-secrets up resume rebuild down reset status logs stats test test-shared deploy smoke

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

test:      ## go vet + unit tests for the chaincode (coverage minimum 80% on rule logic)
	./scripts/test-chaincode.sh
deploy:    ## package, install, approve, commit the three chaincodes (idempotent)
	./scripts/deployCC.sh
smoke:     ## CLI smoke test: F1-F7 happy path and four negative cases
	./scripts/cli-smoke.sh

test-db:   ## throwaway local Postgres for the gateway tests (never used for real data)
	@docker start fposetu-test-pg >/dev/null 2>&1 || docker run -d --name fposetu-test-pg -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test -p 127.0.0.1:54329:5432 --memory 384m postgres:16-alpine

check-secrets: ## fail if a tracked file looks like a secret (run before every commit)
	./scripts/check-secrets.sh
