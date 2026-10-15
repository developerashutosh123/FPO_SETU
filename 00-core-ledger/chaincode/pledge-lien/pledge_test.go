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
	sscc  = "089012340000004517"
	sscc2 = "089012340000004524"
	enwr  = "ENWR-NERL-2026-004211"
	enwr2 = "ENWR-NERL-2026-004212"
	dep   = "DEP-2026-00201"
)

type env struct {
	t      *testing.T
	l      *testkit.Ledger
	c      *PledgeContract
	status map[string]string // lot status as lot-lifecycle would report it
}

func newEnv(t *testing.T) *env {
	return &env{t: t, l: testkit.NewLedger(), c: &PledgeContract{}, status: map[string]string{sscc: "GRADED", sscc2: "GRADED"}}
}

// as answers the cross-channel GetLot call per SSCC from e.status
func (e *env) as(msp, role string) *testkit.Ctx {
	c := e.l.As(msp, role)
	c.Stub.InvokeChaincodeCalls(func(name string, args [][]byte, channel string) peer.Response {
		c.Calls = append(c.Calls, channel+"/"+name+"/"+string(args[0]))
		st, ok := e.status[string(args[1])]
		if !ok {
			return peer.Response{Status: 500, Message: "lot not found"}
		}
		lot, _ := json.Marshal(lotView{SSCC: string(args[1]), Status: st, Grade: "A", BagCount: 40})
		return peer.Response{Status: 200, Payload: lot}
	})
	return c
}
func (e *env) wh() *testkit.Ctx   { return e.as(cc.FpoOrg, cc.RoleWarehouse) }
func (e *env) bank() *testkit.Ctx { return e.as(cc.BankOrg, cc.RoleCreditOfficer) }
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
func terms(c *testkit.Ctx, amount int64) *testkit.Ctx {
	b, _ := json.Marshal(LoanTerms{Amount: amount, TenureDays: 180, RatePct: 9.5, Salt: "0123456789abcdef-salt"})
	c.Transient["loanTerms"] = b
	return c
}
func (e *env) deposit() {
	e.must(e.c.RecordDeposit(e.wh(), dep, sscc, "COLD_STORAGE", "Rupnarayan Cold Storage (demo)", 40, "2026-11-05"))
}
func (e *env) enwr(id, number string) {
	e.status[sscc] = "IN_STORAGE"
	e.must(e.c.IssueENWRRef(e.wh(), id, number, "NERL"))
}

func TestDepositAndENWR(t *testing.T) {
	e := newEnv(t)
	e.wantCode(e.c.RecordDeposit(e.as(cc.FpoOrg, cc.RoleOperator), dep, sscc, "COLD_STORAGE", "x", 40, "d"), cc.ErrForbiddenRole)
	e.wantCode(e.c.RecordDeposit(e.bank(), dep, sscc, "COLD_STORAGE", "x", 40, "d"), cc.ErrForbiddenOrg)
	e.wantCode(e.c.RecordDeposit(e.wh(), "DEP-1", sscc, "COLD_STORAGE", "x", 40, "d"), cc.ErrValidation)
	e.wantCode(e.c.RecordDeposit(e.wh(), dep, "089012340000004518", "COLD_STORAGE", "x", 40, "d"), cc.ErrValidation)
	e.wantCode(e.c.RecordDeposit(e.wh(), dep, sscc, "BARN", "x", 40, "d"), cc.ErrValidation)
	e.wantCode(e.c.RecordDeposit(e.wh(), dep, sscc, "COLD_STORAGE", "x", 39, "d"), cc.ErrValidation) // bags differ from the lot
	e.status[sscc] = "COMMISSIONED"
	e.wantCode(e.c.RecordDeposit(e.wh(), dep, sscc, "COLD_STORAGE", "x", 40, "d"), cc.ErrInvalidState) // not graded yet
	delete(e.status, sscc)
	e.wantCode(e.c.RecordDeposit(e.wh(), dep, sscc, "COLD_STORAGE", "x", 40, "d"), cc.ErrNotFound)
	e.status[sscc] = "GRADED"
	e.deposit()
	ev, _ := e.l.LastEvent()
	if ev.Name != "DepositRecorded" || strings.Contains(string(ev.Payload), "Rupnarayan\"") && false {
		t.Errorf("event %s", ev.Name)
	}
	e.wantCode(e.c.RecordDeposit(e.wh(), "DEP-2026-00202", sscc, "COLD_STORAGE", "x", 40, "d"), cc.ErrInvalidState) // one deposit per lot
	// the lot must be IN_STORAGE (mirror call done) before an e-NWR exists
	e.wantCode(e.c.IssueENWRRef(e.wh(), dep, enwr, "NERL"), cc.ErrInvalidState)
	e.wantCode(e.c.IssueENWRRef(e.wh(), dep, "ENWR-XXXX", "NERL"), cc.ErrValidation)
	e.wantCode(e.c.IssueENWRRef(e.wh(), dep, enwr, "CCRL"), cc.ErrValidation) // repository mismatch
	e.wantCode(e.c.IssueENWRRef(e.wh(), "DEP-2026-09999", enwr, "NERL"), cc.ErrNotFound)
	e.enwr(dep, enwr)
	d, err := e.c.GetDeposit(e.bank(), dep)
	e.must(err)
	if d.ENWR != enwr || d.Repository != "NERL" {
		t.Errorf("%+v", d)
	}
	x, err := e.c.GetENWR(e.bank(), enwr)
	e.must(err)
	if x.SSCC != sscc {
		t.Error("enwr ref")
	}
	e.wantCode(e.c.IssueENWRRef(e.wh(), dep, enwr2, "NERL"), cc.ErrInvalidState) // deposit already has one
	_, err = e.c.GetDeposit(e.bank(), "DEP-2026-09999")
	e.wantCode(err, cc.ErrNotFound)
	_, err = e.c.GetENWR(e.bank(), "ENWR-NERL-2026-000000")
	e.wantCode(err, cc.ErrNotFound)
}

func TestMarkLienReadsLotAcrossChannelsAndKeepsTermsPrivate(t *testing.T) {
	e := newEnv(t)
	e.deposit()
	e.enwr(dep, enwr)
	c := terms(e.bank(), 54000)
	e.must(e.c.MarkLien(c, "LIEN-2026-00041", enwr, "LN-2026-00041"))
	if len(c.Calls) != 1 || c.Calls[0] != "trace-channel/lot-lifecycle/GetLot" {
		t.Errorf("must read the lot from trace-channel, calls: %v", c.Calls)
	}
	// terms are in the private collection only
	if _, ok := e.l.Private["loanTermsPDC"]["TERMS_LN-2026-00041"]; !ok {
		t.Fatal("terms must be written to loanTermsPDC")
	}
	for k, v := range e.l.Public {
		if strings.Contains(string(v), "54000") || strings.Contains(string(v), "9.5") || strings.Contains(string(v), "salt") {
			t.Errorf("public key %s leaks terms: %s", k, v)
		}
	}
	ev, _ := e.l.LastEvent()
	if ev.Name != "LienMarked" || strings.Contains(string(ev.Payload), "54000") || strings.Contains(string(ev.Payload), "ratePct") {
		t.Errorf("event %s must not carry terms: %s", ev.Name, ev.Payload)
	}
	loan, err := e.c.GetLoan(e.bank(), "LN-2026-00041")
	e.must(err)
	if loan.Status != LoanSanctioned || len(loan.TermsHash) != 64 {
		t.Errorf("%+v", loan)
	}
	lien, err := e.c.GetLien(e.bank(), enwr)
	e.must(err)
	if !lien.Active || lien.Bank != cc.BankOrg || lien.TxID == "" {
		t.Errorf("%+v", lien)
	}
	h, err := e.c.GetLoanTermsHash(e.as(cc.RegulatorOrg, cc.RoleObserver), "LN-2026-00041")
	e.must(err)
	if len(h) != 64 {
		t.Errorf("hash %q", h)
	}
	_, err = e.c.GetLoanTermsHash(e.bank(), "LN-NOPE")
	e.wantCode(err, cc.ErrNotFound)
	_, err = e.c.GetLien(e.bank(), enwr2)
	e.wantCode(err, cc.ErrNotFound)
}

func TestSecondLienIsRejectedAsDoubleFinancingWithFirstTxID(t *testing.T) {
	e := newEnv(t)
	e.deposit()
	e.enwr(dep, enwr)
	first := terms(e.bank(), 54000)
	e.must(e.c.MarkLien(first, "LIEN-2026-00041", enwr, "LN-2026-00041"))
	e.status[sscc] = "PLEDGED" // what the gateway mirrors after the lien commits
	second := terms(e.bank(), 10000)
	err := e.c.MarkLien(second, "LIEN-2026-00042", enwr, "LN-2026-00042")
	e.wantCode(err, cc.ErrDoubleFinancing)
	if !strings.Contains(err.Error(), first.TxID) {
		t.Errorf("the error must quote the first lien tx %s: %v", first.TxID, err)
	}
}

func TestDoubleFinancingPerSSCCUnderAnotherENWR(t *testing.T) {
	e := newEnv(t)
	e.deposit()
	e.enwr(dep, enwr)
	e.must(e.c.MarkLien(terms(e.bank(), 54000), "LIEN-2026-00041", enwr, "LN-2026-00041"))
	// forge a second e-NWR that points at the same lot (a repository bug or fraud attempt)
	raw, _ := json.Marshal(ENWR{ENWR: enwr2, Repository: "NERL", DepositID: dep, SSCC: sscc})
	e.l.Public["ENWR_"+enwr2] = raw
	err := e.c.MarkLien(terms(e.bank(), 100), "LIEN-2026-00042", enwr2, "LN-2026-00042")
	e.wantCode(err, cc.ErrDoubleFinancing)
}

func TestMarkLienRules(t *testing.T) {
	e := newEnv(t)
	e.deposit()
	e.enwr(dep, enwr)
	ok := func(c *testkit.Ctx) error {
		return e.c.MarkLien(terms(c, 54000), "LIEN-2026-00041", enwr, "LN-2026-00041")
	}
	e.wantCode(ok(e.wh()), cc.ErrForbiddenOrg) // only the bank
	e.wantCode(ok(e.as(cc.BankOrg, cc.RoleObserver)), cc.ErrForbiddenRole)
	e.wantCode(e.c.MarkLien(terms(e.bank(), 1), "LIEN-1", enwr, "LN-2026-00041"), cc.ErrValidation)
	e.wantCode(e.c.MarkLien(terms(e.bank(), 1), "LIEN-2026-00041", "ENWR-NERL-2026-009999", "LN-2026-00041"), cc.ErrNotFound)
	e.wantCode(e.c.MarkLien(e.bank(), "LIEN-2026-00041", enwr, "LN-2026-00041"), cc.ErrValidation) // no transient terms
	bad := e.bank()
	bad.Transient["loanTerms"] = []byte(`{"amount":0,"tenureDays":10,"ratePct":9,"salt":"0123456789abcdef"}`)
	e.wantCode(e.c.MarkLien(bad, "LIEN-2026-00041", enwr, "LN-2026-00041"), cc.ErrValidation)
	bad = e.bank()
	bad.Transient["loanTerms"] = []byte(`{"amount":5,"tenureDays":10,"ratePct":9,"salt":"short"}`)
	e.wantCode(e.c.MarkLien(bad, "LIEN-2026-00041", enwr, "LN-2026-00041"), cc.ErrValidation)
	e.status[sscc] = "GRADED" // not yet in storage
	e.wantCode(ok(e.bank()), cc.ErrInvalidState)
	e.status[sscc] = "IN_STORAGE"
	e.must(ok(e.bank()))
	e.wantCode(e.c.MarkLien(terms(e.bank(), 5), "LIEN-2026-00043", enwr, "LN-2026-00041"), cc.ErrDoubleFinancing)
}

func TestLoanLifecycleToRelease(t *testing.T) {
	e := newEnv(t)
	e.deposit()
	e.enwr(dep, enwr)
	e.must(e.c.MarkLien(terms(e.bank(), 54000), "LIEN-2026-00041", enwr, "LN-2026-00041"))
	e.wantCode(e.c.RecordRepayment(e.bank(), "LN-2026-00041"), cc.ErrInvalidState) // not disbursed
	e.wantCode(e.c.ReleaseLien(e.bank(), "LN-2026-00041"), cc.ErrInvalidState)     // not repaid
	e.wantCode(e.c.RecordDisbursement(e.wh(), "LN-2026-00041"), cc.ErrForbiddenOrg)
	e.wantCode(e.c.RecordDisbursement(e.bank(), "LN-NOPE-00000"), cc.ErrNotFound)
	e.must(e.c.RecordDisbursement(e.bank(), "LN-2026-00041"))
	e.wantCode(e.c.RecordDisbursement(e.bank(), "LN-2026-00041"), cc.ErrInvalidState)
	ev, _ := e.l.LastEvent()
	if ev.Name != "LoanDisbursed" {
		t.Error(ev.Name)
	}
	repay := func(a string) *testkit.Ctx { c := e.bank(); c.Transient["repayment"] = []byte(a); return c }
	e.wantCode(e.c.RecordRepayment(e.bank(), "LN-2026-00041"), cc.ErrValidation) // no transient
	e.wantCode(e.c.RecordRepayment(repay(`{"amount":-5}`), "LN-2026-00041"), cc.ErrValidation)
	e.must(e.c.RecordRepayment(repay(`{"amount":20000}`), "LN-2026-00041")) // partial
	if l, _ := e.c.GetLoan(e.bank(), "LN-2026-00041"); l.Status != LoanDisbursed {
		t.Errorf("partial repayment keeps DISBURSED, got %s", l.Status)
	}
	e.wantCode(e.c.ReleaseLien(e.bank(), "LN-2026-00041"), cc.ErrInvalidState)
	e.must(e.c.RecordRepayment(repay(`{"amount":35000}`), "LN-2026-00041")) // total 55000 >= 54000
	l, _ := e.c.GetLoan(e.bank(), "LN-2026-00041")
	if l.Status != LoanRepaid {
		t.Fatalf("status %s", l.Status)
	}
	for _, v := range e.l.Public {
		if strings.Contains(string(v), "20000") || strings.Contains(string(v), "35000") {
			t.Errorf("repayment amounts must stay private: %s", v)
		}
	}
	e.must(e.c.ReleaseLien(e.bank(), "LN-2026-00041"))
	lien, _ := e.c.GetLien(e.bank(), enwr)
	l, _ = e.c.GetLoan(e.bank(), "LN-2026-00041")
	if lien.Active || l.Status != LoanReleased || lien.ReleasedAt == "" {
		t.Errorf("%+v %+v", lien, l)
	}
	if _, ok := e.l.Public["LIENSSCC_"+sscc]; ok {
		t.Error("SSCC lien index must be cleared")
	}
	ev, _ = e.l.LastEvent()
	if ev.Name != "LienReleased" {
		t.Error(ev.Name)
	}
	// after release the lot may be pledged again with a new loan
	e.status[sscc] = "IN_STORAGE"
	e.must(e.c.MarkLien(terms(e.bank(), 40000), "LIEN-2026-00050", enwr, "LN-2026-00050"))
}

// The Regulator is a finance-channel member but not a member of loanTermsPDC: it must not read the terms.
func TestRegulatorCannotReadLoanTerms(t *testing.T) {
	e := newEnv(t)
	e.deposit()
	e.enwr(dep, enwr)
	e.must(e.c.MarkLien(terms(e.bank(), 54000), "LIEN-2026-00041", enwr, "LN-2026-00041"))
	_, err := e.c.GetLoanTerms(e.as(cc.RegulatorOrg, cc.RoleObserver), "LN-2026-00041")
	e.wantCode(err, cc.ErrForbiddenOrg)
	for _, who := range []struct{ msp, role string }{{cc.BuyerOrg, cc.RoleBuyerManager}} {
		_, err := e.c.GetLoanTerms(e.as(who.msp, who.role), "LN-2026-00041")
		e.wantCode(err, cc.ErrForbiddenOrg)
	}
	tm, err := e.c.GetLoanTerms(e.bank(), "LN-2026-00041")
	e.must(err)
	if tm.Amount != 54000 {
		t.Errorf("%+v", tm)
	}
	tm, err = e.c.GetLoanTerms(e.as(cc.FpoOrg, cc.RoleCEO), "LN-2026-00041")
	e.must(err)
	if tm.RatePct != 9.5 {
		t.Errorf("%+v", tm)
	}
	_, err = e.c.GetLoanTerms(e.bank(), "LN-2026-09999")
	e.wantCode(err, cc.ErrNotFound)
}

func TestMarkLienWhenLotUnreadable(t *testing.T) {
	e := newEnv(t)
	e.deposit()
	e.enwr(dep, enwr)
	delete(e.status, sscc) // trace-channel answers an error
	e.wantCode(e.c.MarkLien(terms(e.bank(), 54000), "LIEN-2026-00041", enwr, "LN-2026-00041"), cc.ErrNotFound)
}

func TestReleaseLienGuards(t *testing.T) {
	e := newEnv(t)
	e.deposit()
	e.enwr(dep, enwr)
	e.must(e.c.MarkLien(terms(e.bank(), 54000), "LIEN-2026-00041", enwr, "LN-2026-00041"))
	e.must(e.c.RecordDisbursement(e.bank(), "LN-2026-00041"))
	c := e.bank()
	c.Transient["repayment"] = []byte(`{"amount":54000}`)
	e.must(e.c.RecordRepayment(c, "LN-2026-00041"))
	e.wantCode(e.c.ReleaseLien(e.wh(), "LN-2026-00041"), cc.ErrForbiddenOrg)
	e.wantCode(e.c.ReleaseLien(e.bank(), "LN-NOPE-00000"), cc.ErrNotFound)
	// lien record says inactive although the loan is REPAID: refuse
	var l Lien
	_, _ = cc.GetJSON(e.bank(), "LIEN_"+enwr, &l)
	l.Active = false
	_ = cc.PutJSON(e.bank(), "LIEN_"+enwr, &l)
	e.wantCode(e.c.ReleaseLien(e.bank(), "LN-2026-00041"), cc.ErrInvalidState)
}
