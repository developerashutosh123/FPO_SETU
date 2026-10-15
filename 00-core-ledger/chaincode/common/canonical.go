package common

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

// CanonicalJSON re-encodes JSON text exactly like `canonicalJson()` in shared/contract.ts:
// object keys sorted by UTF-16 code unit order (keys are ASCII), no whitespace, UTF-8 output,
// no HTML escaping, U+2028/U+2029 left raw, numbers printed like JavaScript's Number.prototype.toString.
func CanonicalJSON(text []byte) ([]byte, error) {
	dec := json.NewDecoder(bytes.NewReader(text))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return nil, err
	}
	if dec.More() {
		return nil, fmt.Errorf("trailing data after JSON value")
	}
	var b bytes.Buffer
	if err := writeCanonical(&b, v); err != nil {
		return nil, err
	}
	return b.Bytes(), nil
}

// CanonicalValue canonicalises a Go value (map[string]any, []any, string, bool, nil, json.Number, int, int64, float64).
func CanonicalValue(v any) ([]byte, error) {
	raw, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	return CanonicalJSON(raw)
}

func writeCanonical(b *bytes.Buffer, v any) error {
	switch t := v.(type) {
	case nil:
		b.WriteString("null")
	case bool:
		if t {
			b.WriteString("true")
		} else {
			b.WriteString("false")
		}
	case string:
		b.WriteString(quoteJS(t))
	case json.Number:
		s, err := jsNumber(t)
		if err != nil {
			return err
		}
		b.WriteString(s)
	case []any:
		b.WriteByte('[')
		for i, x := range t {
			if i > 0 {
				b.WriteByte(',')
			}
			if err := writeCanonical(b, x); err != nil {
				return err
			}
		}
		b.WriteByte(']')
	case map[string]any:
		keys := make([]string, 0, len(t))
		for k := range t {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		b.WriteByte('{')
		for i, k := range keys {
			if i > 0 {
				b.WriteByte(',')
			}
			b.WriteString(quoteJS(k))
			b.WriteByte(':')
			if err := writeCanonical(b, t[k]); err != nil {
				return err
			}
		}
		b.WriteByte('}')
	default:
		return fmt.Errorf("unsupported JSON value %T", v)
	}
	return nil
}

// quoteJS mirrors JSON.stringify for strings: escapes ", \, control characters (\b \f \n \r \t, else \u00xx); everything else is raw UTF-8.
func quoteJS(s string) string {
	var b strings.Builder
	b.WriteByte('"')
	for _, r := range s {
		switch {
		case r == '"':
			b.WriteString(`\"`)
		case r == '\\':
			b.WriteString(`\\`)
		case r == '\b':
			b.WriteString(`\b`)
		case r == '\f':
			b.WriteString(`\f`)
		case r == '\n':
			b.WriteString(`\n`)
		case r == '\r':
			b.WriteString(`\r`)
		case r == '\t':
			b.WriteString(`\t`)
		case r < 0x20:
			fmt.Fprintf(&b, `\u%04x`, r)
		case r == utf8.RuneError:
			b.WriteString("�")
		default:
			b.WriteRune(r)
		}
	}
	b.WriteByte('"')
	return b.String()
}

// jsNumber prints a JSON number the way JavaScript would after JSON.parse then JSON.stringify.
func jsNumber(n json.Number) (string, error) {
	f, err := strconv.ParseFloat(string(n), 64)
	if err != nil || math.IsInf(f, 0) || math.IsNaN(f) {
		return "", fmt.Errorf("bad number %q", string(n))
	}
	if f == 0 {
		return "0", nil // also covers -0
	}
	abs := math.Abs(f)
	if abs >= 1e-6 && abs < 1e21 {
		return strconv.FormatFloat(f, 'f', -1, 64), nil
	}
	s := strconv.FormatFloat(f, 'e', -1, 64) // 1e+21, 1e-07
	mant, exp, _ := strings.Cut(s, "e")
	sign := exp[0]
	digits := strings.TrimLeft(exp[1:], "0")
	if digits == "" {
		digits = "0"
	}
	return mant + "e" + string(sign) + digits, nil
}
