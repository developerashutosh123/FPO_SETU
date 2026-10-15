// Package testkit builds a fake transaction context over an in-memory ledger so chaincode rules can be unit tested
// without a peer. Public and private state, composite keys, range queries, transient data, events, identity and
// cross-chaincode calls are all simulated.
package testkit

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/hyperledger/fabric-chaincode-go/shim"
	"github.com/hyperledger/fabric-protos-go/ledger/queryresult"
	"github.com/hyperledger/fabric-protos-go/peer"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/fposetu/chaincode/common/mocks"
	"github.com/hyperledger/fabric-chaincode-go/pkg/statebased"
)

// Ledger is the shared in-memory world state. Several Ctx values can share one Ledger to model different submitters.
type Ledger struct {
	Public    map[string][]byte
	Private   map[string]map[string][]byte // collection -> key -> value
	SBE       map[string][]byte            // key -> state-based endorsement policy bytes
	Events    []Event
	TxCounter int
	Now       time.Time
	// Members, when set, makes the fake behave like the peer's memberOnlyRead/memberOnlyWrite: collection -> allowed MSP IDs.
	Members map[string][]string
}

// Event is a captured chaincode event.
type Event struct {
	Name    string
	Payload []byte
	TxID    string
}

// NewLedger returns an empty ledger. Time starts at 2026-11-14T12:32:00Z and moves one minute per transaction.
func NewLedger() *Ledger {
	return &Ledger{Public: map[string][]byte{}, Private: map[string]map[string][]byte{}, SBE: map[string][]byte{}, Now: time.Date(2026, 11, 14, 12, 32, 0, 0, time.UTC)}
}

// Ctx is a fake transaction context bound to one identity.
type Ctx struct {
	*mocks.TransactionContext
	Stub      *mocks.ChaincodeStub
	Identity  *mocks.ClientIdentity
	Ledger    *Ledger
	Transient map[string][]byte
	// CrossCC answers InvokeChaincode(name, channel): key is "channel/name/function".
	CrossCC map[string]peer.Response
	MSP     string
	TxID    string
	Calls   []string // cross-chaincode calls made, "channel/name/function"
}

// As starts a new transaction on the ledger as the given identity (msp, role attribute).
func (l *Ledger) As(msp, role string) *Ctx {
	l.TxCounter++
	l.Now = l.Now.Add(time.Minute)
	c := &Ctx{TransactionContext: &mocks.TransactionContext{}, Stub: &mocks.ChaincodeStub{}, Identity: &mocks.ClientIdentity{}, Ledger: l, Transient: map[string][]byte{}, CrossCC: map[string]peer.Response{}}
	c.TxID = fmt.Sprintf("txid-%04d", l.TxCounter)
	c.MSP = msp
	c.GetStubReturns(c.Stub)
	c.GetClientIdentityReturns(c.Identity)
	c.Identity.GetMSPIDReturns(msp, nil)
	c.Identity.GetAttributeValueCalls(func(attr string) (string, bool, error) {
		if attr == "role" && role != "" {
			return role, true, nil
		}
		return "", false, nil
	})
	s := c.Stub
	s.GetTxIDReturns(c.TxID)
	s.GetTxTimestampReturns(timestamppb.New(l.Now), nil)
	s.GetTransientCalls(func() (map[string][]byte, error) { return c.Transient, nil })
	s.GetStateCalls(func(k string) ([]byte, error) { return l.Public[k], nil })
	s.PutStateCalls(func(k string, v []byte) error { l.Public[k] = append([]byte(nil), v...); return nil })
	s.DelStateCalls(func(k string) error { delete(l.Public, k); return nil })
	s.CreateCompositeKeyCalls(func(t string, attrs []string) (string, error) {
		return "\x00" + t + "\x00" + strings.Join(attrs, "\x00") + "\x00", nil
	})
	s.GetStateByPartialCompositeKeyCalls(func(t string, attrs []string) (shim.StateQueryIteratorInterface, error) {
		prefix := "\x00" + t + "\x00" + strings.Join(attrs, "\x00")
		if len(attrs) > 0 {
			prefix += "\x00"
		}
		var keys []string
		for k := range l.Public {
			if strings.HasPrefix(k, prefix) {
				keys = append(keys, k)
			}
		}
		sort.Strings(keys)
		return &iter{ledger: l, keys: keys}, nil
	})
	s.SplitCompositeKeyCalls(func(k string) (string, []string, error) {
		parts := strings.Split(strings.Trim(k, "\x00"), "\x00")
		return parts[0], parts[1:], nil
	})
	member := func(coll string) error {
		if allowed, ok := l.Members[coll]; ok {
			for _, m := range allowed {
				if m == msp {
					return nil
				}
			}
			return fmt.Errorf("tx creator does not have read access permission on privatedata in chaincodeName:x collectionName: %s", coll)
		}
		return nil
	}
	s.GetPrivateDataCalls(func(coll, k string) ([]byte, error) {
		if err := member(coll); err != nil {
			return nil, err
		}
		return l.Private[coll][k], nil
	})
	s.PutPrivateDataCalls(func(coll, k string, v []byte) error {
		if err := member(coll); err != nil {
			return err
		}
		if l.Private[coll] == nil {
			l.Private[coll] = map[string][]byte{}
		}
		l.Private[coll][k] = append([]byte(nil), v...)
		return nil
	})
	s.GetPrivateDataHashCalls(func(coll, k string) ([]byte, error) {
		v := l.Private[coll][k]
		if v == nil {
			return nil, nil
		}
		return sha256Bytes(v), nil
	})
	s.SetEventCalls(func(name string, payload []byte) error {
		l.Events = append(l.Events, Event{Name: name, Payload: payload, TxID: c.TxID})
		return nil
	})
	s.SetStateValidationParameterCalls(func(k string, ep []byte) error { l.SBE[k] = ep; return nil })
	s.InvokeChaincodeCalls(func(name string, args [][]byte, channel string) peer.Response {
		fn := ""
		if len(args) > 0 {
			fn = string(args[0])
		}
		key := channel + "/" + name + "/" + fn
		c.Calls = append(c.Calls, key)
		if r, ok := c.CrossCC[key]; ok {
			return r
		}
		return peer.Response{Status: 404, Message: "no cross-chaincode answer configured for " + key}
	})
	return c
}

// LastEvent returns the chaincode event set by the most recent transaction on this ledger.
func (l *Ledger) LastEvent() (Event, bool) {
	if len(l.Events) == 0 {
		return Event{}, false
	}
	return l.Events[len(l.Events)-1], true
}

// SBEOrgs decodes the state-based endorsement policy stored for key.
func (l *Ledger) SBEOrgs(key string) ([]string, error) {
	raw, ok := l.SBE[key]
	if !ok {
		return nil, nil
	}
	ep, err := statebased.NewStateEP(raw)
	if err != nil {
		return nil, err
	}
	orgs := ep.ListOrgs()
	sort.Strings(orgs)
	return orgs, nil
}

type iter struct {
	ledger *Ledger
	keys   []string
	i      int
}

func (it *iter) HasNext() bool { return it.i < len(it.keys) }
func (it *iter) Close() error  { return nil }
func (it *iter) Next() (*queryresult.KV, error) {
	k := it.keys[it.i]
	it.i++
	return &queryresult.KV{Key: k, Value: it.ledger.Public[k]}, nil
}
