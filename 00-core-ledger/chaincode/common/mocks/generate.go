// Package mocks holds counterfeiter fakes for the Fabric interfaces the chaincode touches,
// following the fabric-samples asset-transfer pattern. Regenerate with: go generate ./mocks
package mocks

//go:generate go run github.com/maxbrunsfeld/counterfeiter/v6@v6.8.1 -generate

//counterfeiter:generate -o chaincodestub.go --fake-name ChaincodeStub github.com/hyperledger/fabric-chaincode-go/shim.ChaincodeStubInterface
//counterfeiter:generate -o clientidentity.go --fake-name ClientIdentity github.com/hyperledger/fabric-chaincode-go/pkg/cid.ClientIdentity
//counterfeiter:generate -o transactioncontext.go --fake-name TransactionContext github.com/hyperledger/fabric-contract-api-go/contractapi.TransactionContextInterface
