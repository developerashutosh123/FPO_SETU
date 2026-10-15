package main

import (
	"reflect"
	"testing"

	cc "github.com/fposetu/chaincode/common"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// contractapi checks every exported method's signature when the chaincode is built. A bad parameter or return type
// (a pointer field, a map, an unsupported struct) only shows up there, so build it in a test, not first on the peer.
func TestChaincodeBuildsWithContractAPI(t *testing.T) {
	cc, err := contractapi.NewChaincode(&LotContract{})
	if err != nil {
		t.Fatalf("contractapi rejects this chaincode: %v", err)
	}
	if cc == nil {
		t.Fatal("no chaincode")
	}
}

// Everything a Get function returns must be schema-safe (no pointers, maps or raw bytes), or the peer rejects the real answer.
func TestReturnedTypesAreSchemaSafe(t *testing.T) {
	for _, c := range []struct {
		name string
		typ  reflect.Type
	}{
		{"Lot", reflect.TypeOf(Lot{})},
		{"Farmer", reflect.TypeOf(Farmer{})},
		{"Device", reflect.TypeOf(Device{})},
		{"PatronageRun", reflect.TypeOf(PatronageRun{})},
		{"HistoryEntry", reflect.TypeOf(HistoryEntry{})},
	} {
		if err := cc.CheckSchemaSafe(c.typ); err != nil {
			t.Errorf("%s: %v", c.name, err)
		}
	}
}
