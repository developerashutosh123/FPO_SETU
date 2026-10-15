package main

import (
	"encoding/json"
	"regexp"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"

	cc "github.com/fposetu/chaincode/common"
)

const (
	collLoanTerms = "loanTermsPDC"
	traceChannel  = "trace-channel"
	lotCC         = "lot-lifecycle"

	LoanSanctioned = "SANCTIONED"
	LoanDisbursed  = "DISBURSED"
	LoanRepaid     = "REPAID"
	LoanReleased   = "RELEASED"
)

var (
	depositRe  = regexp.MustCompile(`^DEP-\d{4}-\d{5}$`)
	enwrRe     = regexp.MustCompile(`^ENWR-(NERL|CCRL)-\d{4}-\d{6}$`)
	lienRe     = regexp.MustCompile(`^LIEN-\d{4}-\d{5}$`)
	loanRe     = regexp.MustCompile(`^LN-\d{4}-\d{5}$`)
	facilities = map[string]bool{"COLD_STORAGE": true, "WAREHOUSE": true}
)

// PledgeContract is the pledge finance ledger on finance-channel: deposits, e-NWR references, liens and loans.
// Loan terms live only in loanTermsPDC (FPO and Bank); the public state holds statuses and a salted hash of the terms.
type PledgeContract struct {
	contractapi.Contract
}

type Deposit struct {
	DepositID    string `json:"depositId"`
	SSCC         string `json:"sscc"`
	Facility     string `json:"facility"`
	FacilityName string `json:"facilityName"`
	Bags         int    `json:"bags"`
	DepositedAt  string `json:"depositedAt"`
	ENWR         string `json:"enwr"`
	Repository   string `json:"repository"`
	TxID         string `json:"txId"`
}
type ENWR struct {
	ENWR       string `json:"enwr"`
	Repository string `json:"repository"`
	DepositID  string `json:"depositId"`
	SSCC       string `json:"sscc"`
	IssuedAt   string `json:"issuedAt"`
	TxID       string `json:"txId"`
}
type Lien struct {
	LienID     string `json:"lienId"`
	ENWR       string `json:"enwr"`
	SSCC       string `json:"sscc"`
	LoanID     string `json:"loanId"`
	Bank       string `json:"bank"`
	Active     bool   `json:"active"`
	MarkedAt   string `json:"markedAt"`
	ReleasedAt string `json:"releasedAt"`
	TxID       string `json:"txId"` // the transaction that created the lien; quoted in ERR_DOUBLE_FINANCING
}
type Loan struct {
	LoanID       string `json:"loanId"`
	ENWR         string `json:"enwr"`
	SSCC         string `json:"sscc"`
	LienID       string `json:"lienId"`
	Status       string `json:"status"`
	TermsHash    string `json:"termsHash"`
	SanctionedAt string `json:"sanctionedAt"`
	DisbursedAt  string `json:"disbursedAt"`
	RepaidAt     string `json:"repaidAt"`
	ReleasedAt   string `json:"releasedAt"`
}

// LoanTerms is what the bank sends in the transient map and what is stored in loanTermsPDC.
type LoanTerms struct {
	Amount     int64   `json:"amount"`
	TenureDays int     `json:"tenureDays"`
	RatePct    float64 `json:"ratePct"`
	Salt       string  `json:"salt"`
}
type Repayment struct {
	Amount int64  `json:"amount"`
	At     string `json:"at"`
}

// lotView is the part of lot-lifecycle's Lot that this chaincode needs.
type lotView struct {
	SSCC     string `json:"sscc"`
	Status   string `json:"status"`
	Grade    string `json:"grade"`
	BagCount int    `json:"bagCount"`
}

// readLot makes a read-only cross-channel call to lot-lifecycle on trace-channel (InvokeChaincode is query-only across channels).
func readLot(ctx contractapi.TransactionContextInterface, sscc string) (*lotView, error) {
	resp := ctx.GetStub().InvokeChaincode(lotCC, [][]byte{[]byte("GetLot"), []byte(sscc)}, traceChannel)
	if resp.Status != 200 {
		return nil, cc.Errf(cc.ErrNotFound, "lot %s cannot be read on %s: %s", sscc, traceChannel, resp.Message)
	}
	var l lotView
	if err := json.Unmarshal(resp.Payload, &l); err != nil || l.SSCC != sscc {
		return nil, cc.Errf(cc.ErrNotFound, "lot %s: unexpected answer from %s", sscc, lotCC)
	}
	return &l, nil
}

func getLoan(ctx contractapi.TransactionContextInterface, id string) (*Loan, error) {
	var l Loan
	found, err := cc.GetJSON(ctx, "LOAN_"+id, &l)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, cc.Errf(cc.ErrNotFound, "loan %s does not exist", id)
	}
	return &l, nil
}

// ---------------------------------------------------------------- deposits and e-NWR

// RecordDeposit records that a graded lot entered a cold store or warehouse. One deposit per lot.
func (c *PledgeContract) RecordDeposit(ctx contractapi.TransactionContextInterface, depositID, sscc, facility, facilityName string, bags int, depositedAt string) error {
	if _, err := cc.Require(ctx, cc.FpoOrg, cc.RoleWarehouse); err != nil {
		return err
	}
	if !depositRe.MatchString(depositID) || !cc.ValidSSCC(sscc) || !facilities[facility] || facilityName == "" || bags <= 0 || depositedAt == "" {
		return cc.Errf(cc.ErrValidation, "depositId (DEP-YYYY-NNNNN), a valid sscc, facility, facilityName, bags and depositedAt are required")
	}
	if prior, _ := ctx.GetStub().GetState("DEPOSITSSCC_" + sscc); len(prior) > 0 {
		return cc.Errf(cc.ErrInvalidState, "lot %s already has deposit %s", sscc, prior)
	}
	if prior, _ := ctx.GetStub().GetState("DEPOSIT_" + depositID); len(prior) > 0 {
		return cc.Errf(cc.ErrInvalidState, "deposit %s already exists", depositID)
	}
	lot, err := readLot(ctx, sscc)
	if err != nil {
		return err
	}
	if lot.Status != "GRADED" {
		return cc.Errf(cc.ErrInvalidState, "lot %s is %s; only a GRADED lot can be deposited", sscc, lot.Status)
	}
	if lot.BagCount != bags {
		return cc.Errf(cc.ErrValidation, "deposit of %d bags does not match the lot (%d bags)", bags, lot.BagCount)
	}
	d := &Deposit{DepositID: depositID, SSCC: sscc, Facility: facility, FacilityName: facilityName, Bags: bags, DepositedAt: depositedAt, TxID: ctx.GetStub().GetTxID()}
	if err := cc.PutJSON(ctx, "DEPOSIT_"+depositID, d); err != nil {
		return err
	}
	if err := ctx.GetStub().PutState("DEPOSITSSCC_"+sscc, []byte(depositID)); err != nil {
		return err
	}
	return cc.Emit(ctx, "DepositRecorded", "storing", "in_progress", []string{sscc}, facilityName, map[string]any{"depositId": depositID, "facility": facility, "bags": bags})
}

// IssueENWRRef stores the reference of an e-NWR issued by the (simulated) repository for a deposit. The lot must already be IN_STORAGE.
func (c *PledgeContract) IssueENWRRef(ctx contractapi.TransactionContextInterface, depositID, enwr, repository string) error {
	if _, err := cc.Require(ctx, cc.FpoOrg, cc.RoleWarehouse); err != nil {
		return err
	}
	m := enwrRe.FindStringSubmatch(enwr)
	if m == nil || m[1] != repository {
		return cc.Errf(cc.ErrValidation, "enwr must look like ENWR-<NERL|CCRL>-YYYY-NNNNNN and match the repository")
	}
	var d Deposit
	found, err := cc.GetJSON(ctx, "DEPOSIT_"+depositID, &d)
	if err != nil {
		return err
	}
	if !found {
		return cc.Errf(cc.ErrNotFound, "deposit %s does not exist", depositID)
	}
	if d.ENWR != "" {
		return cc.Errf(cc.ErrInvalidState, "deposit %s already has e-NWR %s", depositID, d.ENWR)
	}
	if prior, _ := ctx.GetStub().GetState("ENWR_" + enwr); len(prior) > 0 {
		return cc.Errf(cc.ErrInvalidState, "e-NWR %s already exists", enwr)
	}
	lot, err := readLot(ctx, d.SSCC)
	if err != nil {
		return err
	}
	if lot.Status != "IN_STORAGE" {
		return cc.Errf(cc.ErrInvalidState, "lot %s is %s; an e-NWR needs IN_STORAGE (mirror the deposit first)", d.SSCC, lot.Status)
	}
	at, err := cc.TxTime(ctx)
	if err != nil {
		return err
	}
	d.ENWR, d.Repository = enwr, repository
	if err := cc.PutJSON(ctx, "DEPOSIT_"+depositID, &d); err != nil {
		return err
	}
	if err := cc.PutJSON(ctx, "ENWR_"+enwr, &ENWR{ENWR: enwr, Repository: repository, DepositID: depositID, SSCC: d.SSCC, IssuedAt: at, TxID: ctx.GetStub().GetTxID()}); err != nil {
		return err
	}
	return cc.Emit(ctx, "ENWRIssued", "urn:fposetu:bizstep:enwr_issue", "active", []string{d.SSCC}, d.FacilityName, map[string]any{"enwr": enwr, "repository": repository, "depositId": depositID})
}

// ---------------------------------------------------------------- F5: lien and loan

// MarkLien (F5) pledges an e-NWR. The bank supplies the loan terms in the transient map entry "loanTerms"
// ({amount, tenureDays, ratePct, salt}); they go to loanTermsPDC and never to public state or events.
// A lot may carry one active lien per e-NWR and per SSCC: a second attempt returns ERR_DOUBLE_FINANCING with the first lien's tx ID.
func (c *PledgeContract) MarkLien(ctx contractapi.TransactionContextInterface, lienID, enwr, loanID string) error {
	caller, err := cc.Require(ctx, cc.BankOrg, cc.RoleCreditOfficer)
	if err != nil {
		return err
	}
	if !lienRe.MatchString(lienID) || !loanRe.MatchString(loanID) || !enwrRe.MatchString(enwr) {
		return cc.Errf(cc.ErrValidation, "lienId (LIEN-YYYY-NNNNN), loanId (LN-YYYY-NNNNN) and enwr are required")
	}
	var e ENWR
	found, err := cc.GetJSON(ctx, "ENWR_"+enwr, &e)
	if err != nil {
		return err
	}
	if !found {
		return cc.Errf(cc.ErrNotFound, "e-NWR %s does not exist", enwr)
	}
	// 1. double financing: look at both the e-NWR and the SSCC before anything else
	var existing Lien
	if ok, err := cc.GetJSON(ctx, "LIEN_"+enwr, &existing); err != nil {
		return err
	} else if ok && existing.Active {
		return cc.Errf(cc.ErrDoubleFinancing, "e-NWR %s already has an active lien (tx %s)", enwr, existing.TxID)
	}
	if other, _ := ctx.GetStub().GetState("LIENSSCC_" + e.SSCC); len(other) > 0 {
		var o Lien
		if ok, _ := cc.GetJSON(ctx, "LIEN_"+string(other), &o); ok && o.Active {
			return cc.Errf(cc.ErrDoubleFinancing, "lot %s already has an active lien under e-NWR %s (tx %s)", e.SSCC, o.ENWR, o.TxID)
		}
	}
	if prior, _ := ctx.GetStub().GetState("LOAN_" + loanID); len(prior) > 0 {
		return cc.Errf(cc.ErrInvalidState, "loan %s already exists", loanID)
	}
	// 2. the lot must exist, be graded and be in storage
	lot, err := readLot(ctx, e.SSCC)
	if err != nil {
		return err
	}
	if lot.Status != "IN_STORAGE" || lot.Grade == "" {
		return cc.Errf(cc.ErrInvalidState, "lot %s is %s (grade %q); a lien needs a graded lot IN_STORAGE", e.SSCC, lot.Status, lot.Grade)
	}
	// 3. terms from the transient map
	raw, err := cc.Transient(ctx, "loanTerms")
	if err != nil {
		return err
	}
	var terms LoanTerms
	if err := json.Unmarshal(raw, &terms); err != nil || terms.Amount <= 0 || terms.TenureDays <= 0 || terms.RatePct < 0 || terms.RatePct > 60 || len(terms.Salt) < 16 {
		return cc.Errf(cc.ErrValidation, "loanTerms needs amount > 0, tenureDays > 0, 0 <= ratePct <= 60 and a salt of at least 16 characters")
	}
	canon, err := cc.CanonicalValue(map[string]any{"loanId": loanID, "amount": terms.Amount, "tenureDays": terms.TenureDays, "ratePct": terms.RatePct, "salt": terms.Salt})
	if err != nil {
		return err
	}
	at, err := cc.TxTime(ctx)
	if err != nil {
		return err
	}
	txID := ctx.GetStub().GetTxID()
	if err := cc.PutPrivateJSON(ctx, collLoanTerms, "TERMS_"+loanID, &terms); err != nil {
		return err
	}
	if err := cc.PutJSON(ctx, "LIEN_"+enwr, &Lien{LienID: lienID, ENWR: enwr, SSCC: e.SSCC, LoanID: loanID, Bank: caller.MSP, Active: true, MarkedAt: at, TxID: txID}); err != nil {
		return err
	}
	if err := ctx.GetStub().PutState("LIENSSCC_"+e.SSCC, []byte(enwr)); err != nil {
		return err
	}
	if err := cc.PutJSON(ctx, "LOAN_"+loanID, &Loan{LoanID: loanID, ENWR: enwr, SSCC: e.SSCC, LienID: lienID, Status: LoanSanctioned, TermsHash: cc.Sha256Hex(canon), SanctionedAt: at}); err != nil {
		return err
	}
	return cc.Emit(ctx, "LienMarked", "urn:fposetu:bizstep:pledging", "active", []string{e.SSCC}, "", map[string]any{"lienId": lienID, "enwr": enwr, "loanId": loanID, "bank": caller.MSP})
}

// RecordDisbursement marks the sanctioned loan as paid out.
func (c *PledgeContract) RecordDisbursement(ctx contractapi.TransactionContextInterface, loanID string) error {
	if _, err := cc.Require(ctx, cc.BankOrg, cc.RoleCreditOfficer); err != nil {
		return err
	}
	l, err := getLoan(ctx, loanID)
	if err != nil {
		return err
	}
	if l.Status != LoanSanctioned {
		return cc.Errf(cc.ErrInvalidState, "loan %s is %s; only a SANCTIONED loan can be disbursed", loanID, l.Status)
	}
	at, err := cc.TxTime(ctx)
	if err != nil {
		return err
	}
	l.Status, l.DisbursedAt = LoanDisbursed, at
	if err := cc.PutJSON(ctx, "LOAN_"+loanID, l); err != nil {
		return err
	}
	return cc.Emit(ctx, "LoanDisbursed", "urn:fposetu:bizstep:disbursing", "active", []string{l.SSCC}, "", map[string]any{"loanId": loanID, "enwr": l.ENWR})
}

// RecordRepayment adds a repayment, given in the transient map entry "repayment" ({amount}). When the repaid total reaches
// the principal in loanTermsPDC the loan becomes REPAID. The amount itself stays in the private collection.
func (c *PledgeContract) RecordRepayment(ctx contractapi.TransactionContextInterface, loanID string) error {
	if _, err := cc.Require(ctx, cc.BankOrg, cc.RoleCreditOfficer); err != nil {
		return err
	}
	l, err := getLoan(ctx, loanID)
	if err != nil {
		return err
	}
	if l.Status != LoanDisbursed {
		return cc.Errf(cc.ErrInvalidState, "loan %s is %s; repayments are recorded on a DISBURSED loan", loanID, l.Status)
	}
	raw, err := cc.Transient(ctx, "repayment")
	if err != nil {
		return err
	}
	var rp Repayment
	if err := json.Unmarshal(raw, &rp); err != nil || rp.Amount <= 0 {
		return cc.Errf(cc.ErrValidation, "repayment needs amount > 0")
	}
	var terms LoanTerms
	if ok, err := cc.GetPrivateJSON(ctx, collLoanTerms, "TERMS_"+loanID, &terms); err != nil {
		return err
	} else if !ok {
		return cc.Errf(cc.ErrNotFound, "terms of loan %s are not available on this peer", loanID)
	}
	var total struct {
		Total int64 `json:"total"`
	}
	if _, err := cc.GetPrivateJSON(ctx, collLoanTerms, "REPAID_"+loanID, &total); err != nil {
		return err
	}
	at, err := cc.TxTime(ctx)
	if err != nil {
		return err
	}
	total.Total += rp.Amount
	if err := cc.PutPrivateJSON(ctx, collLoanTerms, "REPAID_"+loanID, &total); err != nil {
		return err
	}
	if total.Total >= terms.Amount {
		l.Status, l.RepaidAt = LoanRepaid, at
		if err := cc.PutJSON(ctx, "LOAN_"+loanID, l); err != nil {
			return err
		}
	}
	return cc.Emit(ctx, "LoanRepaid", "urn:fposetu:bizstep:repaying", "active", []string{l.SSCC}, "", map[string]any{"loanId": loanID, "status": l.Status})
}

// ReleaseLien lifts the lien once the loan is REPAID. The gateway then mirrors the release to lot-lifecycle.setPledged(false).
func (c *PledgeContract) ReleaseLien(ctx contractapi.TransactionContextInterface, loanID string) error {
	if _, err := cc.Require(ctx, cc.BankOrg, cc.RoleCreditOfficer); err != nil {
		return err
	}
	l, err := getLoan(ctx, loanID)
	if err != nil {
		return err
	}
	if l.Status != LoanRepaid {
		return cc.Errf(cc.ErrInvalidState, "loan %s is %s; the lien is released after repayment", loanID, l.Status)
	}
	var lien Lien
	if ok, err := cc.GetJSON(ctx, "LIEN_"+l.ENWR, &lien); err != nil {
		return err
	} else if !ok || !lien.Active {
		return cc.Errf(cc.ErrInvalidState, "e-NWR %s has no active lien", l.ENWR)
	}
	at, err := cc.TxTime(ctx)
	if err != nil {
		return err
	}
	lien.Active, lien.ReleasedAt = false, at
	l.Status, l.ReleasedAt = LoanReleased, at
	if err := cc.PutJSON(ctx, "LIEN_"+l.ENWR, &lien); err != nil {
		return err
	}
	if err := ctx.GetStub().DelState("LIENSSCC_" + l.SSCC); err != nil {
		return err
	}
	if err := cc.PutJSON(ctx, "LOAN_"+loanID, l); err != nil {
		return err
	}
	return cc.Emit(ctx, "LienReleased", "urn:fposetu:bizstep:lien_release", "inactive", []string{l.SSCC}, "", map[string]any{"lienId": lien.LienID, "enwr": l.ENWR, "loanId": loanID})
}

// ---------------------------------------------------------------- queries

func (c *PledgeContract) GetDeposit(ctx contractapi.TransactionContextInterface, depositID string) (*Deposit, error) {
	var d Deposit
	found, err := cc.GetJSON(ctx, "DEPOSIT_"+depositID, &d)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, cc.Errf(cc.ErrNotFound, "deposit %s does not exist", depositID)
	}
	return &d, nil
}

func (c *PledgeContract) GetENWR(ctx contractapi.TransactionContextInterface, enwr string) (*ENWR, error) {
	var e ENWR
	found, err := cc.GetJSON(ctx, "ENWR_"+enwr, &e)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, cc.Errf(cc.ErrNotFound, "e-NWR %s does not exist", enwr)
	}
	return &e, nil
}

func (c *PledgeContract) GetLien(ctx contractapi.TransactionContextInterface, enwr string) (*Lien, error) {
	var l Lien
	found, err := cc.GetJSON(ctx, "LIEN_"+enwr, &l)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, cc.Errf(cc.ErrNotFound, "e-NWR %s has no lien", enwr)
	}
	return &l, nil
}

func (c *PledgeContract) GetLoan(ctx contractapi.TransactionContextInterface, loanID string) (*Loan, error) {
	return getLoan(ctx, loanID)
}

// GetLoanTerms reads loanTermsPDC. Only FPO and Bank may call it: any other org gets ERR_FORBIDDEN_ORG here,
// and the peer's memberOnlyRead refuses it as well.
func (c *PledgeContract) GetLoanTerms(ctx contractapi.TransactionContextInterface, loanID string) (*LoanTerms, error) {
	if _, err := cc.RequireCollectionMember(ctx, collLoanTerms, cc.FpoOrg, cc.BankOrg); err != nil {
		return nil, err
	}
	var t LoanTerms
	found, err := cc.GetPrivateJSON(ctx, collLoanTerms, "TERMS_"+loanID, &t)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, cc.Errf(cc.ErrNotFound, "terms of loan %s are not available", loanID)
	}
	return &t, nil
}

// GetLoanTermsHash returns the on-ledger hash of the private terms, for any channel member (it reveals nothing).
func (c *PledgeContract) GetLoanTermsHash(ctx contractapi.TransactionContextInterface, loanID string) (string, error) {
	h, err := ctx.GetStub().GetPrivateDataHash(collLoanTerms, "TERMS_"+loanID)
	if err != nil {
		return "", err
	}
	if len(h) == 0 {
		return "", cc.Errf(cc.ErrNotFound, "no terms hash for loan %s", loanID)
	}
	return string(cc.HexOf(h)), nil
}
