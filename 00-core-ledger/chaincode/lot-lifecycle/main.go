package main

import (
	"log"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

func main() {
	chaincode, err := contractapi.NewChaincode(&LotContract{})
	if err != nil {
		log.Panicf("create lot-lifecycle chaincode: %v", err)
	}
	if err := chaincode.Start(); err != nil {
		log.Panicf("start lot-lifecycle chaincode: %v", err)
	}
}
