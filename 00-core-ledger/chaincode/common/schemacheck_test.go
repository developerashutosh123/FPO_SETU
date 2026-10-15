package common_test

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/fposetu/chaincode/common"
)

func TestCheckSchemaSafe(t *testing.T) {
	type good struct {
		A string
		B []struct{ C int }
		D bool
		e map[string]string // unexported fields are ignored
	}
	type withPtr struct{ P *bool }
	type withMap struct{ M map[string]string }
	type withRaw struct{ R json.RawMessage }
	type withBytes struct{ B []byte }
	type withOmit struct {
		O string `json:"o,omitempty"`
	}
	type optionalOK struct {
		O string `json:"o,omitempty" metadata:",optional"`
	}
	type nested struct{ Inner struct{ P *int } }
	type selfRef struct {
		Next []selfRef
	}
	if err := common.CheckSchemaSafe(reflect.TypeOf(good{})); err != nil {
		t.Errorf("good type refused: %v", err)
	}
	if err := common.CheckSchemaSafe(reflect.TypeOf(&good{})); err != nil {
		t.Errorf("pointer to a good type as a return value is fine: %v", err)
	}
	if err := common.CheckSchemaSafe(reflect.TypeOf(optionalOK{})); err != nil {
		t.Errorf("optional omitempty field: %v", err)
	}
	if err := common.CheckSchemaSafe(reflect.TypeOf(selfRef{})); err != nil {
		t.Errorf("recursive type: %v", err)
	}
	for name, typ := range map[string]reflect.Type{"pointer field": reflect.TypeOf(withPtr{}), "omitempty": reflect.TypeOf(withOmit{}), "map": reflect.TypeOf(withMap{}), "RawMessage": reflect.TypeOf(withRaw{}),
		"[]byte": reflect.TypeOf(withBytes{}), "nested pointer": reflect.TypeOf(nested{}), "func": reflect.TypeOf(struct{ F func() }{}), "chan": reflect.TypeOf(struct{ C chan int }{})} {
		if common.CheckSchemaSafe(typ) == nil {
			t.Errorf("%s must be refused", name)
		}
	}
}
