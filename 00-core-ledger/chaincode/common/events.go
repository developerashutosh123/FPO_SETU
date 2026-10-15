package common

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// EPCIS 2.0 shaped event payload (CONTRACT.md Section 3.3). No PII and no price may appear in it.
type EventPayload struct {
	EventType   string         `json:"eventType"` // the ledger event name, e.g. LotCommissioned
	EPCISType   string         `json:"epcisType"` // ObjectEvent
	EventTime   string         `json:"eventTime"`
	BizStep     string         `json:"bizStep"`
	Disposition string         `json:"disposition"`
	EPCList     []string       `json:"epcList"`
	BizLocation string         `json:"bizLocation"`
	ReadPoint   string         `json:"readPoint"`
	Refs        map[string]any `json:"refs"`
	// Fabric keeps one chaincode event per transaction. A function that CONTRACT.md says emits several events
	// emits one, named after the first, and lists the others here; the indexer expands them.
	AlsoEmitted []string `json:"alsoEmitted,omitempty"`
}

// Keys that must never be in an event: personal data and money.
var forbiddenRefKeys = map[string]bool{
	"name": true, "phone": true, "aadhaar": true, "account": true, "ifsc": true, "upi": true, "upiref": true,
	"price": true, "priceperqtl": true, "pricepkg": true, "amount": true, "gross": true, "net": true, "salt": true, "rate": true, "ratepct": true,
}

// TxTime returns the transaction timestamp (not the peer clock) as RFC 3339 UTC.
func TxTime(ctx contractapi.TransactionContextInterface) (string, error) {
	ts, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return "", err
	}
	return time.Unix(ts.GetSeconds(), int64(ts.GetNanos())).UTC().Format(time.RFC3339), nil
}

// Emit sets the transaction's chaincode event. It refuses payloads whose refs contain personal data or money fields.
func Emit(ctx contractapi.TransactionContextInterface, name, bizStep, disposition string, epc []string, location string, refs map[string]any, also ...string) error {
	for k := range refs {
		if forbiddenRefKeys[strings.ToLower(k)] {
			return Errf(ErrValidation, "event %s must not carry %q (PII or price)", name, k)
		}
	}
	at, err := TxTime(ctx)
	if err != nil {
		return err
	}
	msp, _ := ctx.GetClientIdentity().GetMSPID()
	if epc == nil {
		epc = []string{}
	}
	if refs == nil {
		refs = map[string]any{}
	}
	p := EventPayload{
		EventType: name, EPCISType: "ObjectEvent", EventTime: at, BizStep: urn("bizstep", bizStep), Disposition: urn("disp", disposition),
		EPCList: epc, BizLocation: location, ReadPoint: "urn:fposetu:org:" + msp, Refs: refs, AlsoEmitted: also,
	}
	raw, err := json.Marshal(p)
	if err != nil {
		return err
	}
	return ctx.GetStub().SetEvent(name, raw)
}

// urn expands a short CBV term (commissioning, in_progress) to its URN; a value that already contains ':' is used as given,
// so terms that GS1 CBV does not define can be passed as urn:fposetu:bizstep:<term>.
func urn(kind, v string) string {
	if strings.Contains(v, ":") {
		return v
	}
	return "urn:epcglobal:cbv:" + kind + ":" + v
}
