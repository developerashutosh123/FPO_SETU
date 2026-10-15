package common_test

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/fposetu/chaincode/common"
	"github.com/fposetu/chaincode/common/testkit"
)

type sigVec struct {
	Name         string         `json:"name"`
	PublicKeyHex string         `json:"publicKeyHex"`
	Payload      map[string]any `json:"payload"`
	Canonical    string         `json:"canonical"`
	CanonicalSha string         `json:"canonicalSha256"`
	SignatureHex string         `json:"signatureHex"`
}

func loadSigs(t *testing.T) map[string]sigVec {
	t.Helper()
	raw, err := os.ReadFile("../testdata/signatures.json")
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	out := map[string]sigVec{}
	for k, v := range m {
		var sv sigVec
		if json.Unmarshal(v, &sv) == nil && sv.Canonical != "" {
			out[k] = sv
		}
	}
	return out
}

// The vectors were produced by shared/contract.ts canonicalJson() in Node. Go must give identical bytes.
func TestCanonicalJSONMatchesTypeScriptVectors(t *testing.T) {
	raw, err := os.ReadFile("../testdata/canonical-json.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Cases []struct {
			Name      string          `json:"name"`
			Input     json.RawMessage `json:"input"`
			Canonical string          `json:"canonical"`
			Sha256    string          `json:"sha256"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	if len(f.Cases) < 8 {
		t.Fatalf("expected the shared vectors, got %d", len(f.Cases))
	}
	for _, c := range f.Cases {
		got, err := common.CanonicalJSON(c.Input)
		if err != nil {
			t.Errorf("%s: %v", c.Name, err)
			continue
		}
		if string(got) != c.Canonical {
			t.Errorf("%s:\n got  %s\n want %s", c.Name, got, c.Canonical)
		}
		if common.Sha256Hex(got) != c.Sha256 {
			t.Errorf("%s: sha256 differs", c.Name)
		}
	}
}

func TestCanonicalJSONNumbersLikeJavaScript(t *testing.T) {
	cases := map[string]string{`{"a":1.0}`: `{"a":1}`, `{"a":0.8}`: `{"a":0.8}`, `{"a":-0}`: `{"a":0}`, `{"a":1e21}`: `{"a":1e+21}`, `{"a":1e-7}`: `{"a":1e-7}`,
		`{"a":123456789012}`: `{"a":123456789012}`, `{"a":1.5e3}`: `{"a":1500}`, ` { "b" : [ 2 , 1 ] , "a" : null } `: `{"a":null,"b":[2,1]}`}
	for in, want := range cases {
		got, err := common.CanonicalJSON([]byte(in))
		if err != nil || string(got) != want {
			t.Errorf("%s => %s (%v), want %s", in, got, err, want)
		}
	}
	for _, bad := range []string{`{"a":}`, `[1,2]x`, ``, `{"a":1e999}`} {
		if _, err := common.CanonicalJSON([]byte(bad)); err == nil {
			t.Errorf("%q should fail", bad)
		}
	}
	if b, err := common.CanonicalValue(map[string]any{"z": 1, "a": []any{"x"}}); err != nil || string(b) != `{"a":["x"],"z":1}` {
		t.Errorf("CanonicalValue: %s %v", b, err)
	}
	// raw U+2028 and U+2029 and HTML characters stay as they are
	b, _ := common.CanonicalJSON([]byte("{\"s\":\"<a>&\u2028\"}"))
	if !strings.Contains(string(b), "<a>&\u2028") {
		t.Errorf("html or separator escaped: %q", b)
	}
	b, _ = common.CanonicalJSON([]byte(`{"s":"\u0001\u007f"}`))
	if string(b) != "{\"s\":\"\\u0001\x7f\"}" {
		t.Errorf("control chars: %q", b)
	}
}

func TestVerifyP256AcceptsTypeScriptSignatures(t *testing.T) {
	for name, v := range loadSigs(t) {
		canon, err := common.CanonicalValue(v.Payload)
		if err != nil {
			t.Fatal(err)
		}
		if string(canon) != v.Canonical {
			t.Errorf("%s: Go canonical bytes differ from TypeScript:\n got  %s\n want %s", name, canon, v.Canonical)
		}
		if err := common.VerifyP256(v.PublicKeyHex, v.SignatureHex, canon); err != nil {
			t.Errorf("%s: valid signature rejected: %v", name, err)
		}
	}
}

func TestVerifyP256RejectsBadInput(t *testing.T) {
	v := loadSigs(t)["f2"]
	msg := []byte(v.Canonical)
	flip := func(s string) string {
		b := []byte(s)
		if b[10] == 'a' {
			b[10] = 'b'
		} else {
			b[10] = 'a'
		}
		return string(b)
	}
	cases := map[string]error{
		"tampered message":   common.VerifyP256(v.PublicKeyHex, v.SignatureHex, []byte(strings.Replace(v.Canonical, "40", "41", 1))),
		"tampered signature": common.VerifyP256(v.PublicKeyHex, flip(v.SignatureHex), msg),
		"other key":          common.VerifyP256(loadSigs(t)["weighbridge"].PublicKeyHex, v.SignatureHex, msg),
		"short signature":    common.VerifyP256(v.PublicKeyHex, v.SignatureHex[:100], msg),
		"not hex signature":  common.VerifyP256(v.PublicKeyHex, strings.Repeat("zz", 64), msg),
		"short key":          common.VerifyP256("04abcd", v.SignatureHex, msg),
		"key off curve":      common.VerifyP256("04"+strings.Repeat("11", 64), v.SignatureHex, msg),
		"compressed key":     common.VerifyP256("02"+v.PublicKeyHex[2:66], v.SignatureHex, msg),
	}
	for name, err := range cases {
		if err == nil {
			t.Errorf("%s: should be rejected", name)
		}
	}
}

func TestSSCC(t *testing.T) {
	if !common.ValidSSCC("089012340000004517") {
		t.Error("contract example must be valid")
	}
	for _, bad := range []string{"089012340000004518", "08901234000000451", "0890123400000045170", "08901234000000451x", "", "abcdefghijklmnopqr"} {
		if common.ValidSSCC(bad) {
			t.Errorf("%q must be invalid", bad)
		}
	}
	if d, ok := common.SSCCCheckDigit("08901234000000451"); !ok || d != 7 {
		t.Errorf("check digit %d %v", d, ok)
	}
	if _, ok := common.SSCCCheckDigit("0890123400000045x"); ok {
		t.Error("non-digit accepted")
	}
}

func TestRequireDistinguishesOrgAndRole(t *testing.T) {
	l := testkit.NewLedger()
	if _, err := common.Require(l.As(common.FpoOrg, "vle"), common.FpoOrg, "vle", "operator"); err != nil {
		t.Fatalf("vle must pass: %v", err)
	}
	if _, err := common.Require(l.As(common.BankOrg, "vle"), common.FpoOrg, "vle"); common.CodeOf(err) != common.ErrForbiddenOrg {
		t.Errorf("wrong org: %v", err)
	}
	if _, err := common.Require(l.As(common.FpoOrg, "member"), common.FpoOrg, "vle"); common.CodeOf(err) != common.ErrForbiddenRole {
		t.Errorf("wrong role: %v", err)
	}
	if _, err := common.Require(l.As(common.FpoOrg, ""), common.FpoOrg, "vle"); common.CodeOf(err) != common.ErrForbiddenRole {
		t.Errorf("no role attribute: %v", err)
	}
	if _, err := common.RequireCollectionMember(l.As(common.RegulatorOrg, "observer"), "tradePricePDC", common.FpoOrg, common.BuyerOrg); common.CodeOf(err) != common.ErrForbiddenOrg {
		t.Errorf("regulator must not be a member: %v", err)
	}
	if _, err := common.RequireCollectionMember(l.As(common.BuyerOrg, "buyer_manager"), "tradePricePDC", common.FpoOrg, common.BuyerOrg); err != nil {
		t.Errorf("buyer is a member: %v", err)
	}
	if common.CodeOf(common.Errf(common.ErrNotFound, "x")) != common.ErrNotFound || common.CodeOf(nil) != "" || common.CodeOf(os.ErrNotExist) != "" {
		t.Error("CodeOf")
	}
}

func TestEmitShapeAndGuards(t *testing.T) {
	l := testkit.NewLedger()
	c := l.As(common.FpoOrg, "vle")
	if err := common.Emit(c, "LotCommissioned", "commissioning", "active", []string{"089012340000004517"}, "CHANGUAL", map[string]any{"farmerToken": "FT-1"}, "X"); err != nil {
		t.Fatal(err)
	}
	ev, _ := l.LastEvent()
	var p common.EventPayload
	if err := json.Unmarshal(ev.Payload, &p); err != nil {
		t.Fatal(err)
	}
	if ev.Name != "LotCommissioned" || p.EventType != "LotCommissioned" || p.EPCISType != "ObjectEvent" || len(p.EPCList) != 1 || p.ReadPoint != "urn:fposetu:org:FpoOrgMSP" || p.EventTime != "2026-11-14T12:33:00Z" || p.AlsoEmitted[0] != "X" {
		t.Errorf("payload %+v", p)
	}
	for _, k := range []string{"price", "pricePerQtl", "amount", "name", "phone", "Gross", "net", "salt"} {
		if err := common.Emit(l.As(common.FpoOrg, "vle"), "X", "a", "b", nil, "", map[string]any{k: 1}); common.CodeOf(err) != common.ErrValidation {
			t.Errorf("key %q must be refused in events", k)
		}
	}
	if err := common.Emit(l.As(common.FpoOrg, "vle"), "X", "a", "b", nil, "", nil); err != nil {
		t.Error("nil epc and refs are fine")
	}
}

func TestStateHelpers(t *testing.T) {
	l := testkit.NewLedger()
	c := l.As(common.FpoOrg, "vle")
	type v struct{ A int }
	if found, err := common.GetJSON(c, "k", &v{}); found || err != nil {
		t.Fatal("missing key")
	}
	if err := common.PutJSON(c, "k", v{A: 3}); err != nil {
		t.Fatal(err)
	}
	var out v
	if found, err := common.GetJSON(c, "k", &out); !found || err != nil || out.A != 3 {
		t.Fatalf("%v %v %v", found, err, out)
	}
	if err := common.PutPrivateJSON(c, "coll", "k", v{A: 5}); err != nil {
		t.Fatal(err)
	}
	if found, _ := common.GetPrivateJSON(c, "coll", "k", &out); !found || out.A != 5 {
		t.Fatal("private")
	}
	if _, err := common.Transient(c, "terms"); common.CodeOf(err) != common.ErrValidation {
		t.Error("missing transient must be ERR_VALIDATION")
	}
	c.Transient["terms"] = []byte("{}")
	if b, err := common.Transient(c, "terms"); err != nil || string(b) != "{}" {
		t.Error("transient present")
	}
}
