package main

import (
	"log"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

func main() {
	chaincode, err := contractapi.NewChaincode(&PledgeContract{})
	if err != nil {
		log.Panicf("create pledge-lien chaincode: %v", err)
	}
	if err := chaincode.Start(); err != nil {
		log.Panicf("start pledge-lien chaincode: %v", err)
	}
}
