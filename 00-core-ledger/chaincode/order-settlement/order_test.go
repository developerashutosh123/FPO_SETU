package main

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/hyperledger/fabric-protos-go/peer"

	cc "github.com/fposetu/chaincode/common"
	"github.com/fposetu/chaincode/common/testkit"
)

const (
	s1  = "089012340000004517"
	s2  = "089012340000004524"
	oid = "ORD-2026-00087"
)

type env struct {
	t     *testing.T
	l     *testkit.Ledger
	c     *OrderContract
	state map[string]string
	kg    map[string]int
}

func newEnv(t *testing.T) *env {
	l := testkit.NewLedger()
	l.Members = map[string][]string{"tradePricePDC": {cc.FpoOrg, cc.BuyerOrg}} // the peer's memberOnlyRead / memberOnlyWrite
	return &env{t: t, l: l, c: &OrderContract{}, state: map[string]string{s1: "IN_STORAGE", s2: "GRADED"}, kg: map[string]int{s1: 1964, s2: 2950}}
}
func (e *env) as(msp, role string) *testkit.Ctx {
	c := e.l.As(msp, role)
	c.Stub.InvokeChaincodeCalls(func(name string, args [][]byte, channel string) peer.Response {
		c.Calls = append(c.Calls, channel+"/"+name+"/"+string(args[0]))
		st, ok := e.state[string(args[1])]
		if !ok {
			return peer.Response{Status: 500, Message: "lot not found"}
		}
		b, _ := json.Marshal(lotView{SSCC: string(args[1]), Status: st, NetKg: e.kg[string(args[1])]})
		return peer.Response{Status: 200, Payload: b}
	})
	return c
}
func (e *env) ceo() *testkit.Ctx   { return e.as(cc.FpoOrg, cc.RoleCEO) }
func (e *env) buyer() *testkit.Ctx { return e.as(cc.BuyerOrg, cc.RoleBuyerManager) }
func (e *env) must(err error) {
	e.t.Helper()
	if err != nil {
		e.t.Fatalf("unexpected error: %v", err)
	}
}
func (e *env) wantCode(err error, code string) {
	e.t.Helper()
	if cc.CodeOf(err) != code {
		e.t.Fatalf("want %s, got %v", code, err)
	}
}

const salt = "0123456789abcdef0123"

func hashOf(price float64, s string) string {
	b, _ := cc.CanonicalValue(map[string]any{"orderId": oid, "pricePerQtl": price, "salt": s})
	return cc.Sha256Hex(b)
}
func priced(c *testkit.Ctx, price float64, s string) *testkit.Ctx {
	b, _ := json.Marshal(PriceTransient{PricePerQtl: price, Salt: s})
	c.Transient["price"] = b
	return c
}
func (e *env) open() {
	e.must(e.c.CreateOrder(e.buyer(), oid, `["`+s1+`","`+s2+`"]`, "DIRECT", "2026-11-18"))
}
func (e *env) agree(price float64) {
	st, err := e.c.AgreePrice(priced(e.ceo(), price, salt), oid, hashOf(price, salt))
	e.must(err)
	if st != "AWAITING_COUNTERPARTY" {
		e.t.Fatalf("first step returned %s", st)
	}
	st, err = e.c.AgreePrice(priced(e.buyer(), price, salt), oid, hashOf(price, salt))
	e.must(err)
	if st != "AGREED" {
		e.t.Fatalf("second step returned %s", st)
	}
}

func TestCreateOrderReadsLotsFromTraceChannel(t *testing.T) {
	e := newEnv(t)
	c := e.buyer()
	e.must(e.c.CreateOrder(c, oid, `["`+s1+`","`+s2+`"]`, "DIRECT", "2026-11-18"))
	if len(c.Calls) != 2 || c.Calls[0] != "trace-channel/lot-lifecycle/GetLot" {
		t.Errorf("calls %v", c.Calls)
	}
	o, err := e.c.GetOrder(e.ceo(), oid)
	e.must(err)
	if o.Status != StOpen || len(o.SSCCs) != 2 || o.CreatedBy != cc.BuyerOrg || o.PriceHash != "" {
		t.Errorf("%+v", o)
	}
	ev, _ := e.l.LastEvent()
	if ev.Name != "OrderCreated" {
		t.Error(ev.Name)
	}
	e.wantCode(e.c.CreateOrder(e.buyer(), oid, `["`+s1+`"]`, "DIRECT", "d"), cc.ErrInvalidState) // exists
	_, err = e.c.GetOrder(e.ceo(), "ORD-2026-09999")
	e.wantCode(err, cc.ErrNotFound)
}

func TestCreateOrderRules(t *testing.T) {
	e := newEnv(t)
	create := func(c *testkit.Ctx, lots string) error { return e.c.CreateOrder(c, oid, lots, "DIRECT", "2026-11-18") }
	e.wantCode(create(e.as(cc.RegulatorOrg, cc.RoleObserver), `["`+s1+`"]`), cc.ErrForbiddenOrg)
	e.wantCode(create(e.as(cc.BankOrg, cc.RoleCreditOfficer), `["`+s1+`"]`), cc.ErrForbiddenOrg)
	e.wantCode(create(e.as(cc.FpoOrg, cc.RoleOperator), `["`+s1+`"]`), cc.ErrForbiddenRole)
	e.wantCode(create(e.buyer(), `[]`), cc.ErrValidation)
	e.wantCode(create(e.buyer(), `not json`), cc.ErrValidation)
	e.wantCode(create(e.buyer(), `["089012340000004518"]`), cc.ErrValidation)
	e.wantCode(create(e.buyer(), `["`+s1+`","`+s1+`"]`), cc.ErrValidation)
	e.wantCode(e.c.CreateOrder(e.buyer(), "ORD-1", `["`+s1+`"]`, "DIRECT", "d"), cc.ErrValidation)
	e.wantCode(e.c.CreateOrder(e.buyer(), oid, `["`+s1+`"]`, "FAX", "d"), cc.ErrValidation)
	e.state[s2] = "PLEDGED"
	e.wantCode(create(e.buyer(), `["`+s1+`","`+s2+`"]`), cc.ErrLotPledged)
	e.state[s2] = "SOLD"
	e.wantCode(create(e.buyer(), `["`+s2+`"]`), cc.ErrInvalidState)
	delete(e.state, s2)
	e.wantCode(create(e.buyer(), `["`+s2+`"]`), cc.ErrNotFound)
	e.must(create(e.ceo(), `["`+s1+`"]`)) // the FPO CEO may open an order as well
}

func TestTwoStepPriceAgreementKeepsPriceInPDCOnly(t *testing.T) {
	e := newEnv(t)
	e.open()
	// step 1: FPO proposes
	c := priced(e.ceo(), 1580, salt)
	st, err := e.c.AgreePrice(c, oid, hashOf(1580, salt))
	e.must(err)
	if st != "AWAITING_COUNTERPARTY" {
		t.Fatal(st)
	}
	if o, _ := e.c.GetOrder(e.ceo(), oid); o.Status != StOpen || o.PriceHash != "" {
		t.Error("one proposal must not agree the price")
	}
	// step 2: buyer submits the same price, the call commits
	c2 := priced(e.buyer(), 1580, salt)
	st, err = e.c.AgreePrice(c2, oid, hashOf(1580, salt))
	e.must(err)
	if st != "AGREED" {
		t.Fatal(st)
	}
	if c2.Stub.GetPrivateDataHashCallCount() == 0 {
		t.Error("the other party's proposal must be checked with GetPrivateDataHash, not read in clear")
	}
	if c2.Stub.GetPrivateDataCallCount() != 0 {
		t.Error("the second step must not read the first party's private data")
	}
	o, _ := e.c.GetOrder(e.ceo(), oid)
	if o.Status != StPriceAgreed || o.PriceHash != hashOf(1580, salt) {
		t.Errorf("%+v", o)
	}
	// the price is in the PDC and nowhere in public state or events
	if _, ok := e.l.Private["tradePricePDC"]["PRICE_"+oid]; !ok {
		t.Fatal("agreed price missing from tradePricePDC")
	}
	for k, v := range e.l.Public {
		if strings.Contains(string(v), "1580") || strings.Contains(string(v), salt) {
			t.Errorf("public key %s leaks the price or salt: %s", k, v)
		}
	}
	for _, ev := range e.l.Events {
		if strings.Contains(string(ev.Payload), "1580") || strings.Contains(string(ev.Payload), salt) {
			t.Errorf("event %s leaks the price: %s", ev.Name, ev.Payload)
		}
	}
	if ev, _ := e.l.LastEvent(); ev.Name != "PriceAgreed" {
		t.Error(ev.Name)
	}
	p, err := e.c.GetOrderPrice(e.ceo(), oid)
	e.must(err)
	if p.PricePerQtl != 1580 {
		t.Errorf("%+v", p)
	}
	if p, err = e.c.GetOrderPrice(e.buyer(), oid); err != nil || p.Salt != salt {
		t.Errorf("buyer must read the price too: %v", err)
	}
	h, err := e.c.GetOrderPriceHash(e.as(cc.FpoOrg, cc.RoleBoard), oid)
	e.must(err)
	if len(h) != 64 {
		t.Error(h)
	}
	e.wantCode(func() error {
		_, err := e.c.AgreePrice(priced(e.ceo(), 1580, salt), oid, hashOf(1580, salt))
		return err
	}(), cc.ErrInvalidState) // already agreed
}

func TestPriceHashMismatchIsRefused(t *testing.T) {
	e := newEnv(t)
	e.open()
	_, err := e.c.AgreePrice(priced(e.ceo(), 1580, salt), oid, hashOf(1580, salt))
	e.must(err)
	// buyer submits a different price
	_, err = e.c.AgreePrice(priced(e.buyer(), 1620, salt), oid, hashOf(1620, salt))
	e.wantCode(err, cc.ErrPriceHashMismatch)
	// buyer submits the same price with a different salt
	_, err = e.c.AgreePrice(priced(e.buyer(), 1580, "another-salt-0123456"), oid, hashOf(1580, "another-salt-0123456"))
	e.wantCode(err, cc.ErrPriceHashMismatch)
	if o, _ := e.c.GetOrder(e.ceo(), oid); o.Status != StOpen {
		t.Error("a mismatch must leave the order OPEN")
	}
	// the matching second step still works afterwards
	_, err = e.c.AgreePrice(priced(e.buyer(), 1580, salt), oid, hashOf(1580, salt))
	e.must(err)
}

func TestAgreePriceInputRules(t *testing.T) {
	e := newEnv(t)
	e.open()
	_, err := e.c.AgreePrice(e.ceo(), oid, hashOf(1580, salt))
	e.wantCode(err, cc.ErrValidation) // no transient
	_, err = e.c.AgreePrice(priced(e.ceo(), 1580, salt), oid, hashOf(1581, salt))
	e.wantCode(err, cc.ErrValidation) // argument hash is not the hash of the transient price
	_, err = e.c.AgreePrice(priced(e.ceo(), 1580, salt), oid, "nothex")
	e.wantCode(err, cc.ErrValidation)
	_, err = e.c.AgreePrice(priced(e.ceo(), 0, salt), oid, hashOf(0, salt))
	e.wantCode(err, cc.ErrValidation)
	_, err = e.c.AgreePrice(priced(e.ceo(), 1580, "short"), oid, hashOf(1580, "short"))
	e.wantCode(err, cc.ErrValidation)
	_, err = e.c.AgreePrice(priced(e.as(cc.FpoOrg, cc.RoleOperator), 1580, salt), oid, hashOf(1580, salt))
	e.wantCode(err, cc.ErrForbiddenRole)
	_, err = e.c.AgreePrice(priced(e.ceo(), 1580, salt), "ORD-2026-09999", hashOf(1580, salt))
	e.wantCode(err, cc.ErrNotFound)
}

// A non-member org cannot read the private data collection, neither through the chaincode nor straight from the stub.
func TestNonMemberCannotReadTradePricePDC(t *testing.T) {
	e := newEnv(t)
	e.open()
	e.agree(1580)
	for _, who := range []struct{ msp, role string }{{cc.RegulatorOrg, cc.RoleObserver}, {cc.BankOrg, cc.RoleCreditOfficer}} {
		_, err := e.c.GetOrderPrice(e.as(who.msp, who.role), oid)
		e.wantCode(err, cc.ErrForbiddenOrg)
		// even code that forgot the membership check would be stopped at the stub (the peer's memberOnlyRead)
		raw, err := e.as(who.msp, who.role).Stub.GetPrivateData("tradePricePDC", "PRICE_"+oid)
		if err == nil || len(raw) != 0 || !strings.Contains(err.Error(), "does not have read access") {
			t.Errorf("%s read the PDC directly: %q %v", who.msp, raw, err)
		}
	}
	// a member org with a role that does not trade is refused as well
	_, err := e.c.GetOrderPrice(e.as(cc.FpoOrg, cc.RoleVLE), oid)
	e.wantCode(err, cc.ErrForbiddenRole)
	_, err = e.c.GetOrderPrice(e.ceo(), "ORD-2026-09999")
	e.wantCode(err, cc.ErrNotFound)
	_, err = e.c.GetOrderPriceHash(e.ceo(), "ORD-2026-09999")
	e.wantCode(err, cc.ErrNotFound)
	// members can read
	if raw, err := e.as(cc.BuyerOrg, cc.RoleBuyerManager).Stub.GetPrivateData("tradePricePDC", "PRICE_"+oid); err != nil || len(raw) == 0 {
		t.Errorf("buyer must read: %v", err)
	}
}

func (e *env) deliver() {
	e.state[s1], e.state[s2] = "DELIVERED", "DELIVERED"
}

func TestAcceptQualityAndSettlement(t *testing.T) {
	e := newEnv(t)
	e.open()
	e.wantCode(e.c.AcceptQuality(e.buyer(), oid, true, ""), cc.ErrInvalidState) // price not agreed
	e.agree(1580)
	e.wantCode(e.c.AcceptQuality(e.buyer(), oid, true, ""), cc.ErrInvalidState) // lots not delivered yet
	e.deliver()
	e.wantCode(e.c.AcceptQuality(e.ceo(), oid, true, ""), cc.ErrForbiddenOrg)
	e.wantCode(e.c.AcceptQuality(e.buyer(), oid, true, "zz"), cc.ErrValidation)
	e.must(e.c.AcceptQuality(e.buyer(), oid, true, strings.Repeat("a", 64)))
	o, _ := e.c.GetOrder(e.ceo(), oid)
	if o.Status != StDelivered || o.QualityOutcome != "ACCEPTED" {
		t.Errorf("%+v", o)
	}
	settle := func(amount int64, ref string) *testkit.Ctx {
		c := e.ceo()
		b, _ := json.Marshal(SettlementTransient{Amount: amount, UPIRef: ref})
		c.Transient["settlement"] = b
		return c
	}
	// expected: (1964 + 2950) kg = 49.14 qtl * 1580 = 77641.2 -> 77641
	e.wantCode(e.c.RecordSettlement(settle(77000, "604512339876"), oid), cc.ErrValidation) // does not match price x weight
	e.wantCode(e.c.RecordSettlement(settle(100000, "604512339876"), oid), cc.ErrValidation)
	e.wantCode(e.c.RecordSettlement(e.ceo(), oid), cc.ErrValidation) // no transient
	e.wantCode(e.c.RecordSettlement(settle(77641, "12"), oid), cc.ErrValidation)
	e.wantCode(e.c.RecordSettlement(e.buyer(), oid), cc.ErrForbiddenOrg)
	e.must(e.c.RecordSettlement(settle(77641, "604512339876"), oid))
	o, _ = e.c.GetOrder(e.ceo(), oid)
	if o.Status != StSettled || len(o.SettlementHash) != 64 || o.SettledAt == "" {
		t.Errorf("%+v", o)
	}
	for k, v := range e.l.Public {
		if strings.Contains(string(v), "77641") || strings.Contains(string(v), "604512339876") {
			t.Errorf("public key %s leaks the settlement: %s", k, v)
		}
	}
	if _, ok := e.l.Private["tradePricePDC"]["SETTLEMENT_"+oid]; !ok {
		t.Error("settlement must be in the PDC")
	}
	ev, _ := e.l.LastEvent()
	if ev.Name != "SettlementExecuted" || strings.Contains(string(ev.Payload), "77641") {
		t.Errorf("%s %s", ev.Name, ev.Payload)
	}
	e.wantCode(e.c.RecordSettlement(settle(77641, "604512339876"), oid), cc.ErrInvalidState) // twice
}

func TestRejectedQualityBlocksSettlement(t *testing.T) {
	e := newEnv(t)
	e.open()
	e.agree(1580)
	e.deliver()
	e.must(e.c.AcceptQuality(e.buyer(), oid, false, ""))
	c := e.ceo()
	c.Transient["settlement"] = []byte(`{"amount":77641,"upiRef":"604512339876"}`)
	e.wantCode(e.c.RecordSettlement(c, oid), cc.ErrInvalidState)
}

func TestSettlementWhenPriceMissingOnPeer(t *testing.T) {
	e := newEnv(t)
	e.open()
	e.agree(1580)
	e.deliver()
	e.must(e.c.AcceptQuality(e.buyer(), oid, true, ""))
	delete(e.l.Private["tradePricePDC"], "PRICE_"+oid)
	c := e.ceo()
	c.Transient["settlement"] = []byte(`{"amount":77641,"upiRef":"604512339876"}`)
	e.wantCode(e.c.RecordSettlement(c, oid), cc.ErrNotFound)
}
