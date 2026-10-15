package common

import (
	"encoding/json"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// GetJSON loads and decodes a public state value. found is false when the key does not exist.
func GetJSON(ctx contractapi.TransactionContextInterface, key string, out any) (bool, error) {
	raw, err := ctx.GetStub().GetState(key)
	if err != nil {
		return false, err
	}
	if len(raw) == 0 {
		return false, nil
	}
	return true, json.Unmarshal(raw, out)
}

// PutJSON encodes and stores a public state value.
func PutJSON(ctx contractapi.TransactionContextInterface, key string, v any) error {
	raw, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(key, raw)
}

// GetPrivateJSON loads a private data value from a collection.
func GetPrivateJSON(ctx contractapi.TransactionContextInterface, collection, key string, out any) (bool, error) {
	raw, err := ctx.GetStub().GetPrivateData(collection, key)
	if err != nil {
		return false, err
	}
	if len(raw) == 0 {
		return false, nil
	}
	return true, json.Unmarshal(raw, out)
}

// PutPrivateJSON stores a private data value in a collection.
func PutPrivateJSON(ctx contractapi.TransactionContextInterface, collection, key string, v any) error {
	raw, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutPrivateData(collection, key, raw)
}

// Transient returns one entry of the transient map, or ERR_VALIDATION if it is missing.
func Transient(ctx contractapi.TransactionContextInterface, key string) ([]byte, error) {
	m, err := ctx.GetStub().GetTransient()
	if err != nil {
		return nil, err
	}
	v, ok := m[key]
	if !ok || len(v) == 0 {
		return nil, Errf(ErrValidation, "transient map entry %q is required", key)
	}
	return v, nil
}

// HexOf returns the lowercase hex encoding of b.
func HexOf(b []byte) []byte {
	const digits = "0123456789abcdef"
	out := make([]byte, len(b)*2)
	for i, x := range b {
		out[i*2], out[i*2+1] = digits[x>>4], digits[x&0x0f]
	}
	return out
}
