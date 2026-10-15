package main

import (
	"encoding/json"
	"regexp"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"

	cc "github.com/fposetu/chaincode/common"
)

const (
	collPrice    = "tradePricePDC"
	traceChannel = "trace-channel"
	lotCC        = "lot-lifecycle"

	StOpen        = "OPEN"
	StPriceAgreed = "PRICE_AGREED"
	StDelivered   = "DELIVERED"
	StSettled     = "SETTLED"
)

var (
	orderRe  = regexp.MustCompile(`^ORD-\d{4}-\d{5}$`)
	hashRe   = regexp.MustCompile(`^[0-9a-f]{64}$`)
	channels = map[string]bool{"DIRECT": true, "ONDC": true, "ENAM": true}
)

// OrderContract is the trade ledger on trade-channel (FPO and Buyer only). The agreed price lives in tradePricePDC;
// public state and events carry only the price hash. The Regulator is not on this channel and never sees a price.
type OrderContract struct {
	contractapi.Contract
}

type Order struct {
	OrderID          string   `json:"orderId"`
	Channel          string   `json:"channel"`
	SSCCs            []string `json:"ssccs"`
	Status           string   `json:"status"`
	DeliveryBy       string   `json:"deliveryBy"`
	CreatedBy        string   `json:"createdBy"`
	CreatedAt        string   `json:"createdAt"`
	PriceHash        string   `json:"priceHash"`
	AgreedAt         string   `json:"agreedAt"`
	QualityOutcome   string   `json:"qualityOutcome"` // "", ACCEPTED or REJECTED
	QualityNotesHash string   `json:"qualityNotesHash"`
	SettlementHash   string   `json:"settlementHash"`
	SettledAt        string   `json:"settledAt"`
}

// PriceTransient is the transient map entry "price" the FPO and the Buyer each send.
type PriceTransient struct {
	PricePerQtl float64 `json:"pricePerQtl"`
	Salt        string  `json:"salt"`
}
type SettlementTransient struct {
	Amount int64  `json:"amount"`
	UPIRef string `json:"upiRef"`
}

type lotView struct {
	SSCC   string `json:"sscc"`
	Status string `json:"status"`
	NetKg  int    `json:"netKg"`
}

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

func (c *OrderContract) load(ctx contractapi.TransactionContextInterface, id string) (*Order, error) {
	var o Order
	found, err := cc.GetJSON(ctx, "ORDER_"+id, &o)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, cc.Errf(cc.ErrNotFound, "order %s does not exist", id)
	}
	return &o, nil
}

// requireTrader accepts the FPO CEO or the Buyer procurement manager, the two parties of a trade.
func requireTrader(ctx contractapi.TransactionContextInterface) (cc.Caller, error) {
	caller, err := cc.RequireCollectionMember(ctx, collPrice, cc.FpoOrg, cc.BuyerOrg)
	if err != nil {
		return caller, err
	}
	if (caller.MSP == cc.FpoOrg && caller.Role == cc.RoleCEO) || (caller.MSP == cc.BuyerOrg && caller.Role == cc.RoleBuyerManager) {
		return caller, nil
	}
	return caller, cc.Errf(cc.ErrForbiddenRole, "role %q cannot trade (FPO ceo or Buyer buyer_manager)", caller.Role)
}

func other(msp string) string {
	if msp == cc.FpoOrg {
		return cc.BuyerOrg
	}
	return cc.FpoOrg
}

// CreateOrder opens an order for lots that are GRADED or IN_STORAGE. Each lot is read from trace-channel (query only).
// A pledged lot gives ERR_LOT_PLEDGED.
func (c *OrderContract) CreateOrder(ctx contractapi.TransactionContextInterface, orderID, ssccsJSON, channel, deliveryBy string) error {
	caller, err := requireTrader(ctx)
	if err != nil {
		return err
	}
	var ssccs []string
	if err := json.Unmarshal([]byte(ssccsJSON), &ssccs); err != nil || len(ssccs) == 0 || !orderRe.MatchString(orderID) || !channels[channel] || deliveryBy == "" {
		return cc.Errf(cc.ErrValidation, "orderId (ORD-YYYY-NNNNN), a non-empty ssccs array, channel (DIRECT|ONDC|ENAM) and deliveryBy are required")
	}
	if prior, _ := ctx.GetStub().GetState("ORDER_" + orderID); len(prior) > 0 {
		return cc.Errf(cc.ErrInvalidState, "order %s already exists", orderID)
	}
	seen := map[string]bool{}
	for _, s := range ssccs {
		if !cc.ValidSSCC(s) || seen[s] {
			return cc.Errf(cc.ErrValidation, "sscc %q is invalid or repeated", s)
		}
		seen[s] = true
		lot, err := readLot(ctx, s)
		if err != nil {
			return err
		}
		switch lot.Status {
		case "GRADED", "IN_STORAGE":
		case "PLEDGED":
			return cc.Errf(cc.ErrLotPledged, "lot %s has an active lien and cannot be ordered", s)
		default:
			return cc.Errf(cc.ErrInvalidState, "lot %s is %s; only GRADED or IN_STORAGE lots can be ordered", s, lot.Status)
		}
	}
	at, err := cc.TxTime(ctx)
	if err != nil {
		return err
	}
	o := &Order{OrderID: orderID, Channel: channel, SSCCs: ssccs, Status: StOpen, DeliveryBy: deliveryBy, CreatedBy: caller.MSP, CreatedAt: at}
	if err := cc.PutJSON(ctx, "ORDER_"+orderID, o); err != nil {
		return err
	}
	return cc.Emit(ctx, "OrderCreated", "urn:fposetu:bizstep:ordering", "active", ssccs, "", map[string]any{"orderId": orderID, "channel": channel, "lots": len(ssccs)})
}

// AgreePrice (F6) is two-step. Each party sends {orderId, priceHash} as arguments and {pricePerQtl, salt} in the transient map.
// The first call stores that party's proposal in tradePricePDC. The second call (the other party) is accepted only if the hash of the
// first party's private proposal, read with GetPrivateDataHash, equals the hash of the second party's identical proposal; then the
// order moves to PRICE_AGREED. Otherwise: ERR_PRICE_HASH_MISMATCH. Returns AWAITING_COUNTERPARTY or AGREED.
// The first step changes no public state except a proposal hash, so it emits no event; the second emits PriceAgreed (hash only).
func (c *OrderContract) AgreePrice(ctx contractapi.TransactionContextInterface, orderID, priceHash string) (string, error) {
	caller, err := requireTrader(ctx)
	if err != nil {
		return "", err
	}
	o, err := c.load(ctx, orderID)
	if err != nil {
		return "", err
	}
	if o.Status != StOpen {
		return "", cc.Errf(cc.ErrInvalidState, "order %s is %s; a price can be agreed while it is OPEN", orderID, o.Status)
	}
	raw, err := cc.Transient(ctx, "price")
	if err != nil {
		return "", err
	}
	var p PriceTransient
	if err := json.Unmarshal(raw, &p); err != nil || p.PricePerQtl <= 0 || len(p.Salt) < 16 {
		return "", cc.Errf(cc.ErrValidation, "transient price needs pricePerQtl > 0 and a salt of at least 16 characters")
	}
	canon, err := cc.CanonicalValue(map[string]any{"orderId": orderID, "pricePerQtl": p.PricePerQtl, "salt": p.Salt})
	if err != nil {
		return "", err
	}
	mine := cc.Sha256Hex(canon)
	if !hashRe.MatchString(priceHash) || priceHash != mine {
		return "", cc.Errf(cc.ErrValidation, "priceHash does not match sha256 of canonicalJson({orderId, pricePerQtl, salt})")
	}
	theirs, err := ctx.GetStub().GetPrivateDataHash(collPrice, "PROPOSAL_"+orderID+"_"+other(caller.MSP))
	if err != nil {
		return "", err
	}
	if len(theirs) == 0 {
		if err := ctx.GetStub().PutPrivateData(collPrice, "PROPOSAL_"+orderID+"_"+caller.MSP, canon); err != nil {
			return "", err
		}
		return "AWAITING_COUNTERPARTY", nil
	}
	if string(cc.HexOf(theirs)) != mine {
		return "", cc.Errf(cc.ErrPriceHashMismatch, "the other party's proposal for %s does not match this one", orderID)
	}
	at, err := cc.TxTime(ctx)
	if err != nil {
		return "", err
	}
	if err := ctx.GetStub().PutPrivateData(collPrice, "PRICE_"+orderID, canon); err != nil {
		return "", err
	}
	o.Status, o.PriceHash, o.AgreedAt = StPriceAgreed, mine, at
	if err := cc.PutJSON(ctx, "ORDER_"+orderID, o); err != nil {
		return "", err
	}
	if err := cc.Emit(ctx, "PriceAgreed", "urn:fposetu:bizstep:price_agreement", "active", o.SSCCs, "", map[string]any{"orderId": orderID, "priceHash": mine}); err != nil {
		return "", err
	}
	return "AGREED", nil
}

// AcceptQuality records the buyer's decision after delivery. Every lot of the order must be DELIVERED on trace-channel.
func (c *OrderContract) AcceptQuality(ctx contractapi.TransactionContextInterface, orderID string, accepted bool, notesHash string) error {
	if _, err := cc.Require(ctx, cc.BuyerOrg, cc.RoleBuyerManager); err != nil {
		return err
	}
	if notesHash != "" && !hashRe.MatchString(notesHash) {
		return cc.Errf(cc.ErrValidation, "notesHash must be sha256 hex (notes stay off-chain)")
	}
	o, err := c.load(ctx, orderID)
	if err != nil {
		return err
	}
	if o.Status != StPriceAgreed {
		return cc.Errf(cc.ErrInvalidState, "order %s is %s; quality is accepted after the price is agreed", orderID, o.Status)
	}
	for _, s := range o.SSCCs {
		lot, err := readLot(ctx, s)
		if err != nil {
			return err
		}
		if lot.Status != "DELIVERED" {
			return cc.Errf(cc.ErrInvalidState, "lot %s is %s; custody must be accepted before quality", s, lot.Status)
		}
	}
	o.Status, o.QualityOutcome, o.QualityNotesHash = StDelivered, "REJECTED", notesHash
	if accepted {
		o.QualityOutcome = "ACCEPTED"
	}
	if err := cc.PutJSON(ctx, "ORDER_"+orderID, o); err != nil {
		return err
	}
	return cc.Emit(ctx, "QualityAccepted", "accepting", "in_progress", o.SSCCs, "", map[string]any{"orderId": orderID, "accepted": accepted})
}

// RecordSettlement stores the payment ({amount, upiRef} in the transient map) in tradePricePDC. The amount must equal
// the agreed price times the delivered weight of the lots, within INR 1 per lot for rounding. The public order keeps only a hash.
func (c *OrderContract) RecordSettlement(ctx contractapi.TransactionContextInterface, orderID string) error {
	if _, err := cc.Require(ctx, cc.FpoOrg, cc.RoleCEO); err != nil {
		return err
	}
	o, err := c.load(ctx, orderID)
	if err != nil {
		return err
	}
	if o.Status != StDelivered || o.QualityOutcome != "ACCEPTED" {
		return cc.Errf(cc.ErrInvalidState, "order %s is %s; settlement needs accepted quality", orderID, o.Status)
	}
	raw, err := cc.Transient(ctx, "settlement")
	if err != nil {
		return err
	}
	var st SettlementTransient
	if err := json.Unmarshal(raw, &st); err != nil || st.Amount <= 0 || len(st.UPIRef) < 6 {
		return cc.Errf(cc.ErrValidation, "transient settlement needs amount > 0 and upiRef")
	}
	var agreed PriceTransient
	if ok, err := cc.GetPrivateJSON(ctx, collPrice, "PRICE_"+orderID, &agreed); err != nil {
		return err
	} else if !ok {
		return cc.Errf(cc.ErrNotFound, "the agreed price of %s is not available on this peer", orderID)
	}
	var kg int
	for _, s := range o.SSCCs {
		lot, err := readLot(ctx, s)
		if err != nil {
			return err
		}
		kg += lot.NetKg
	}
	expected := int64(float64(kg)/100*agreed.PricePerQtl + 0.5)
	if d := st.Amount - expected; d > int64(len(o.SSCCs)) || -d > int64(len(o.SSCCs)) {
		return cc.Errf(cc.ErrValidation, "settlement does not match the agreed price times the delivered weight")
	}
	canon, err := cc.CanonicalValue(map[string]any{"orderId": orderID, "amount": st.Amount, "upiRef": st.UPIRef})
	if err != nil {
		return err
	}
	at, err := cc.TxTime(ctx)
	if err != nil {
		return err
	}
	if err := ctx.GetStub().PutPrivateData(collPrice, "SETTLEMENT_"+orderID, canon); err != nil {
		return err
	}
	o.Status, o.SettlementHash, o.SettledAt = StSettled, cc.Sha256Hex(canon), at
	if err := cc.PutJSON(ctx, "ORDER_"+orderID, o); err != nil {
		return err
	}
	return cc.Emit(ctx, "SettlementExecuted", "urn:fposetu:bizstep:settlement", "inactive", o.SSCCs, "", map[string]any{"orderId": orderID, "settlementHash": o.SettlementHash})
}

func (c *OrderContract) GetOrder(ctx contractapi.TransactionContextInterface, orderID string) (*Order, error) {
	return c.load(ctx, orderID)
}

// GetOrderPrice reads the agreed price from tradePricePDC: FPO ceo and Buyer buyer_manager only.
// Any other org gets ERR_FORBIDDEN_ORG; the peer's memberOnlyRead refuses it too.
func (c *OrderContract) GetOrderPrice(ctx contractapi.TransactionContextInterface, orderID string) (*PriceTransient, error) {
	if _, err := requireTrader(ctx); err != nil {
		return nil, err
	}
	var p PriceTransient
	found, err := cc.GetPrivateJSON(ctx, collPrice, "PRICE_"+orderID, &p)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, cc.Errf(cc.ErrNotFound, "no agreed price for %s", orderID)
	}
	return &p, nil
}

// GetOrderPriceHash returns the ledger's hash of the private price record, for anyone on the channel (it reveals nothing).
func (c *OrderContract) GetOrderPriceHash(ctx contractapi.TransactionContextInterface, orderID string) (string, error) {
	h, err := ctx.GetStub().GetPrivateDataHash(collPrice, "PRICE_"+orderID)
	if err != nil {
		return "", err
	}
	if len(h) == 0 {
		return "", cc.Errf(cc.ErrNotFound, "no agreed price for %s", orderID)
	}
	return string(cc.HexOf(h)), nil
}
