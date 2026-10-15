package common

import (
	"fmt"
	"reflect"
	"strings"
)

// CheckSchemaSafe walks a type that a chaincode function returns and reports fields that contractapi cannot validate at run time:
// pointers, maps, []byte (and json.RawMessage), channels, functions. contractapi builds a JSON schema from the Go type and rejects a
// real answer that does not fit it, but only when the function is invoked on a peer, so this is checked in unit tests instead.
func CheckSchemaSafe(t reflect.Type) error {
	if t.Kind() == reflect.Ptr { // a pointer return value is fine; look at what it points to
		t = t.Elem()
	}
	return checkType(t, t.Name(), map[reflect.Type]bool{})
}

func checkType(t reflect.Type, path string, seen map[reflect.Type]bool) error {
	switch t.Kind() {
	case reflect.Ptr:
		return fmt.Errorf("%s: pointer fields are not supported by contractapi", path)
	case reflect.Map, reflect.Chan, reflect.Func, reflect.UnsafePointer:
		return fmt.Errorf("%s: %s is not supported by contractapi", path, t.Kind())
	case reflect.Slice, reflect.Array:
		if t.Elem().Kind() == reflect.Uint8 {
			return fmt.Errorf("%s: []byte or json.RawMessage is validated as an array of numbers; use string", path)
		}
		return checkType(t.Elem(), path+"[]", seen)
	case reflect.Struct:
		if seen[t] {
			return nil
		}
		seen[t] = true
		for i := 0; i < t.NumField(); i++ {
			f := t.Field(i)
			if f.PkgPath != "" {
				continue
			}
			// contractapi marks every field required unless it is tagged metadata:",optional", and `omitempty` makes the real answer
			// leave the key out, which then fails validation. Emit every key instead.
			if tag := f.Tag.Get("json"); strings.Contains(tag, "omitempty") && !strings.Contains(f.Tag.Get("metadata"), "optional") {
				return fmt.Errorf("%s.%s: json omitempty would leave a required key out of the answer", path, f.Name)
			}
			if err := checkType(f.Type, path+"."+f.Name, seen); err != nil {
				return err
			}
		}
	}
	return nil
}
