package main

import (
	"log"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

func main() {
	chaincode, err := contractapi.NewChaincode(&OrderContract{})
	if err != nil {
		log.Panicf("create order-settlement chaincode: %v", err)
	}
	if err := chaincode.Start(); err != nil {
		log.Panicf("start order-settlement chaincode: %v", err)
	}
}
