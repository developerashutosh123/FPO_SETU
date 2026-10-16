package main

import (
	"encoding/json"
	"fmt"
	"regexp"

	"github.com/hyperledger/fabric-chaincode-go/pkg/statebased"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"

	cc "github.com/fposetu/chaincode/common"
)

// LotContract implements the lot lifecycle on trace-channel: F1 onboarding, F2 farmer-signed commissioning,
// F3 device-attested grading, F4 two-party custody, F7 patronage, DPDP erasure, and the status mirror calls.
type LotContract struct {
	contractapi.Contract
}

var (
	humanRefRe  = regexp.MustCompile(`^WB-PSM-(KGP2|DBR|KSY)-(POT|PAD|BRJ|CAU)-FPO07-\d{4}-[RKB]-\d{5}$`)
	tokenRe     = regexp.MustCompile(`^FT-[0-9a-f]{16}$`)
	plotRe      = regexp.MustCompile(`^PL-[A-Z0-9]{10}$`)
	hashRe      = regexp.MustCompile(`^[0-9a-f]{64}$`)
	commodities = map[string]bool{"POTATO": true, "PADDY": true, "BRINJAL": true, "CAULIFLOWER": true}
	villages    = map[string]bool{"CHANGUAL": true, "GOLGRAM": true, "GOPALPUR": true, "SANKOA": true, "DUAN": true}
	grades      = map[string]bool{"A": true, "B": true, "C": true}
	orgs        = map[string]bool{cc.FpoOrg: true, cc.BankOrg: true, cc.BuyerOrg: true, cc.RegulatorOrg: true}
	dedTypes    = map[string]bool{"HAMALI": true, "MARKET_FEE": true, "COMMISSION": true, "TRANSPORT": true, "COLD_STORAGE_RENT": true, "FPO_MARGIN": true, "LOAN_RECOVERY": true}
)

// allowed lot status transitions (CONTRACT.md Section 3.2). UNVERIFIABLE is reached only through MarkUnverifiable.
var transitions = map[string][]string{
	StCommissioned: {StGraded},
	StGraded:       {StInStorage, StListed, StTransformed},
	StInStorage:    {StPledged, StListed, StTransformed},
	StPledged:      {StInStorage, StListed}, // a pledged lot may be listed and sold; only dispatch waits for the lien (CONTRACT.md 3.2, journey steps 6 to 8)
	StListed:       {StSold},
	StSold:         {StInTransit},
	StInTransit:    {StDelivered},
	StDelivered:    {StSettled, StRejected},
	StSettled:      {StClosed},
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

// move changes the lot status if the state machine allows it.
func (l *Lot) move(to string) error {
	// a lot with an active lien never goes on the road; and while its status is PLEDGED it can only be listed or released
	if to == StInTransit && l.LienRef != "" {
		return cc.Errf(cc.ErrLotPledged, "lot %s has an active lien; release it before dispatch", l.SSCC)
	}
	if l.Status == StPledged && to != StInStorage && to != StListed {
		return cc.Errf(cc.ErrLotPledged, "lot %s has an active lien; release it before moving to %s", l.SSCC, to)
	}
	if !contains(transitions[l.Status], to) {
		return cc.Errf(cc.ErrInvalidState, "lot %s cannot go from %s to %s", l.SSCC, l.Status, to)
	}
	l.Status = to
	return nil
}

func (c *LotContract) load(ctx contractapi.TransactionContextInterface, sscc string) (*Lot, error) {
	var l Lot
	found, err := cc.GetJSON(ctx, sscc, &l)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, cc.Errf(cc.ErrNotFound, "lot %s does not exist", sscc)
	}
	return &l, nil
}

func (c *LotContract) save(ctx contractapi.TransactionContextInterface, l *Lot) error {
	at, err := cc.TxTime(ctx)
	if err != nil {
		return err
	}
	l.UpdatedAt = at
	l.LastTxID = ctx.GetStub().GetTxID()
	return cc.PutJSON(ctx, l.SSCC, l)
}

// statusChanged saves the lot and emits LotStatusChanged.
func (c *LotContract) statusChanged(ctx contractapi.TransactionContextInterface, l *Lot, from, ref string) error {
	if err := c.save(ctx, l); err != nil {
		return err
	}
	return cc.Emit(ctx, "LotStatusChanged", "urn:fposetu:bizstep:status_change", "active", []string{l.SSCC}, l.Village,
		map[string]any{"from": from, "to": l.Status, "ref": ref})
}

// ---------------------------------------------------------------- F1: farmer and plot

// RegisterFarmerAndPlot (F1) stores the pseudonymous farmer record. Calling it again for the same token adds a plot.
// Emits FarmerOnboarded (also PlotRegistered, ConsentGranted) for a new farmer, PlotRegistered for an added plot.
func (c *LotContract) RegisterFarmerAndPlot(ctx contractapi.TransactionContextInterface, farmerToken, devicePubKeyHex, consentHash, plotID, polygonHash string) error {
	if _, err := cc.Require(ctx, cc.FpoOrg, cc.RoleVLE); err != nil {
		return err
	}
	if !tokenRe.MatchString(farmerToken) {
		return cc.Errf(cc.ErrValidation, "farmerToken must look like FT-<16 hex>")
	}
	if !plotRe.MatchString(plotID) || !hashRe.MatchString(polygonHash) || !hashRe.MatchString(consentHash) {
		return cc.Errf(cc.ErrValidation, "plotId (PL-+10 chars), polygonHash and consentHash (sha256 hex) are required")
	}
	if devicePubKeyHex != "" {
		if err := cc.ValidatePublicKey(devicePubKeyHex); err != nil {
			return cc.Errf(cc.ErrValidation, "devicePubKeyHex: %v", err)
		}
	}
	at, err := cc.TxTime(ctx)
	if err != nil {
		return err
	}
	key := farmerKeyPrefix + farmerToken
	var f Farmer
	found, err := cc.GetJSON(ctx, key, &f)
	if err != nil {
		return err
	}
	if found && f.Erased {
		return cc.Errf(cc.ErrInvalidState, "farmer %s was erased and cannot be registered again", farmerToken)
	}
	if found && contains(f.PlotIDs, plotID) {
		return cc.Errf(cc.ErrInvalidState, "plot %s is already registered", plotID)
	}
	event, also := "FarmerOnboarded", []string{"PlotRegistered", "ConsentGranted"}
	if !found {
		f = Farmer{Token: farmerToken, DevicePubKeyHex: devicePubKeyHex, ConsentHash: consentHash, RegisteredAt: at}
	} else {
		event, also = "PlotRegistered", nil
		if f.DevicePubKeyHex == "" {
			f.DevicePubKeyHex = devicePubKeyHex
		}
	}
	f.PlotIDs = append(f.PlotIDs, plotID)
	f.PolygonHashes = append(f.PolygonHashes, polygonHash)
	if err := cc.PutJSON(ctx, key, &f); err != nil {
		return err
	}
	return cc.Emit(ctx, event, "enrolling", "active", nil, "", map[string]any{"farmerToken": farmerToken, "plotId": plotID}, also...)
}

// RegisterDeviceKey sets the farmer's device public key (POST /farmers/me/device-key). Only while no key is registered or by replacing it explicitly.
func (c *LotContract) RegisterDeviceKey(ctx contractapi.TransactionContextInterface, farmerToken, devicePubKeyHex string) error {
	if _, err := cc.Require(ctx, cc.FpoOrg, cc.RoleMember, cc.RoleVLE); err != nil {
		return err
	}
	var f Farmer
	found, err := cc.GetJSON(ctx, farmerKeyPrefix+farmerToken, &f)
	if err != nil {
		return err
	}
	if !found || f.Erased {
		return cc.Errf(cc.ErrNotFound, "farmer %s is not registered", farmerToken)
	}
	if err := cc.ValidatePublicKey(devicePubKeyHex); err != nil {
		return cc.Errf(cc.ErrValidation, "devicePubKeyHex: %v", err)
	}
	f.DevicePubKeyHex = devicePubKeyHex
	if err := cc.PutJSON(ctx, farmerKeyPrefix+farmerToken, &f); err != nil {
		return err
	}
	return cc.Emit(ctx, "ConsentGranted", "enrolling", "active", nil, "", map[string]any{"farmerToken": farmerToken, "deviceKeyRegistered": true})
}

// RegisterDevice registers a simulated device public key for F3 verification. Infrastructure call: it emits no business event.
func (c *LotContract) RegisterDevice(ctx contractapi.TransactionContextInterface, deviceID, pubKeyHex, kind string) error {
	if _, err := cc.Require(ctx, cc.FpoOrg, cc.RoleCEO); err != nil {
		return err
	}
	if kind != "weighbridge" && kind != "quality" {
		return cc.Errf(cc.ErrValidation, "kind must be weighbridge or quality")
	}
	if deviceID == "" {
		return cc.Errf(cc.ErrValidation, "deviceId is required")
	}
	if err := cc.ValidatePublicKey(pubKeyHex); err != nil {
		return cc.Errf(cc.ErrValidation, "pubKeyHex: %v", err)
	}
	at, err := cc.TxTime(ctx)
	if err != nil {
		return err
	}
	return cc.PutJSON(ctx, deviceKeyPrefix+deviceID, &Device{DeviceID: deviceID, PubKeyHex: pubKeyHex, Kind: kind, RegisteredAt: at})
}

// RecordInputEvent anchors the hash of a crop-diary entry. The diary itself stays off-chain.
func (c *LotContract) RecordInputEvent(ctx contractapi.TransactionContextInterface, farmerToken, inputHash, crop, appliedOn, phiClearOn string) error {
	if _, err := cc.Require(ctx, cc.FpoOrg, cc.RoleMember, cc.RoleVLE); err != nil {
		return err
	}
	if !hashRe.MatchString(inputHash) || !commodities[crop] {
		return cc.Errf(cc.ErrValidation, "inputHash (sha256 hex) and crop are required")
	}
	var f Farmer
	if found, err := cc.GetJSON(ctx, farmerKeyPrefix+farmerToken, &f); err != nil {
		return err
	} else if !found || f.Erased {
		return cc.Errf(cc.ErrNotFound, "farmer %s is not registered", farmerToken)
	}
	if err := cc.PutJSON(ctx, inputKeyPrefix+farmerToken+"_"+inputHash[:16], map[string]string{"hash": inputHash, "crop": crop, "appliedOn": appliedOn, "phiClearOn": phiClearOn}); err != nil {
		return err
	}
	return cc.Emit(ctx, "InputApplied", "urn:fposetu:bizstep:input_applied", "active", nil, "", map[string]any{"farmerToken": farmerToken, "inputHash": inputHash, "crop": crop, "phiClearOn": phiClearOn})
}

// ---------------------------------------------------------------- F2: commissioning with the farmer's signature

// CommissionLot (F2) creates the lot once the farmer's device signature over canonicalJson({sscc, farmerToken, plotId, commodity,
// bagCount, estWeightKg, harvestOrUnloadDate}) verifies against the key registered in F1. Bad signature: ERR_BAD_FARMER_SIGNATURE.
func (c *LotContract) CommissionLot(ctx contractapi.TransactionContextInterface, sscc, humanRef, farmerToken, plotID, commodity, variety, village string, bagCount, estWeightKg int, harvestOrUnloadDate, farmerSignatureHex string) error {
	if _, err := cc.Require(ctx, cc.FpoOrg, cc.RoleVLE, cc.RoleOperator); err != nil {
		return err
	}
	if !cc.ValidSSCC(sscc) {
		return cc.Errf(cc.ErrValidation, "sscc %q is not a valid 18-digit SSCC", sscc)
	}
	if !humanRefRe.MatchString(humanRef) || !commodities[commodity] || !villages[village] || bagCount <= 0 || estWeightKg <= 0 || harvestOrUnloadDate == "" {
		return cc.Errf(cc.ErrValidation, "humanRef, commodity, village, bagCount, estWeightKg and harvestOrUnloadDate must be valid")
	}
	if existing, _ := ctx.GetStub().GetState(sscc); len(existing) > 0 {
		return cc.Errf(cc.ErrInvalidState, "lot %s already exists", sscc)
	}
	var f Farmer
	found, err := cc.GetJSON(ctx, farmerKeyPrefix+farmerToken, &f)
	if err != nil {
		return err
	}
	if !found {
		return cc.Errf(cc.ErrNotFound, "farmer %s is not registered (run F1 first)", farmerToken)
	}
	if f.Erased {
		return cc.Errf(cc.ErrInvalidState, "farmer %s was erased; no new lots", farmerToken)
	}
	if !contains(f.PlotIDs, plotID) {
		return cc.Errf(cc.ErrValidation, "plot %s does not belong to farmer %s", plotID, farmerToken)
	}
	if f.DevicePubKeyHex == "" {
		return cc.Errf(cc.ErrBadFarmerSignature, "farmer %s has no device key registered", farmerToken)
	}
	payload, err := cc.CanonicalValue(map[string]any{
		"sscc": sscc, "farmerToken": farmerToken, "plotId": plotID, "commodity": commodity,
		"bagCount": bagCount, "estWeightKg": estWeightKg, "harvestOrUnloadDate": harvestOrUnloadDate,
	})
	if err != nil {
		return err
	}
	if err := cc.VerifyP256(f.DevicePubKeyHex, farmerSignatureHex, payload); err != nil {
		return cc.Errf(cc.ErrBadFarmerSignature, "the farmer signature does not verify: %v", err)
	}
	at, err := cc.TxTime(ctx)
	if err != nil {
		return err
	}
	l := &Lot{SSCC: sscc, HumanRef: humanRef, Commodity: commodity, Variety: variety, Village: village, FarmerToken: farmerToken, PlotID: plotID,
		BagCount: bagCount, EstWeightKg: estWeightKg, HarvestOrUnloadDate: harvestOrUnloadDate, FarmerSignatureHex: farmerSignatureHex,
		Status: StCommissioned, OriginStatus: OriginVerified, Custody: []CustodyHop{}, Digests: []Digest{}, CreatedAt: at}
	if err := c.save(ctx, l); err != nil {
		return err
	}
	idx, err := ctx.GetStub().CreateCompositeKey(farmerLotIndex, []string{farmerToken, sscc})
	if err != nil {
		return err
	}
	if err := ctx.GetStub().PutState(idx, []byte{0}); err != nil {
		return err
	}
	return cc.Emit(ctx, "LotCommissioned", "commissioning", "active", []string{sscc}, village,
		map[string]any{"farmerToken": farmerToken, "plotId": plotID, "commodity": commodity, "humanRef": humanRef})
}

// ---------------------------------------------------------------- F3: device-attested grading

type weighbridgeReading struct {
	DeviceID string  `json:"deviceId"`
	GrossKg  float64 `json:"grossKg"`
	TareKg   float64 `json:"tareKg"`
	NetKg    float64 `json:"netKg"`
	At       string  `json:"at"`
}

func (c *LotContract) verifyDevice(ctx contractapi.TransactionContextInterface, readingJSON, sigHex, kind string) (canon []byte, deviceID string, err error) {
	var probe struct {
		DeviceID string `json:"deviceId"`
	}
	if err := json.Unmarshal([]byte(readingJSON), &probe); err != nil || probe.DeviceID == "" {
		return nil, "", cc.Errf(cc.ErrValidation, "%s reading must be JSON with a deviceId", kind)
	}
	var d Device
	found, err := cc.GetJSON(ctx, deviceKeyPrefix+probe.DeviceID, &d)
	if err != nil {
		return nil, "", err
	}
	if !found || d.Kind != kind {
		return nil, "", cc.Errf(cc.ErrBadDeviceSignature, "device %s is not a registered %s", probe.DeviceID, kind)
	}
	canon, err = cc.CanonicalJSON([]byte(readingJSON))
	if err != nil {
		return nil, "", cc.Errf(cc.ErrValidation, "%s reading is not valid JSON: %v", kind, err)
	}
	if err := cc.VerifyP256(d.PubKeyHex, sigHex, canon); err != nil {
		return nil, "", cc.Errf(cc.ErrBadDeviceSignature, "the %s signature does not verify: %v", kind, err)
	}
	return canon, probe.DeviceID, nil
}

// AttestQuality (F3) verifies both device signatures, records the readings and the grade, and moves the lot to GRADED.
// Emits LotGraded (also QualityCredentialIssued).
func (c *LotContract) AttestQuality(ctx contractapi.TransactionContextInterface, sscc, weighbridgeJSON, weighbridgeSigHex, qualityJSON, qualitySigHex, grade string) error {
	if _, err := cc.Require(ctx, cc.FpoOrg, cc.RoleOperator); err != nil {
		return err
	}
	if !grades[grade] {
		return cc.Errf(cc.ErrValidation, "grade must be A, B or C")
	}
	l, err := c.load(ctx, sscc)
	if err != nil {
		return err
	}
	if l.Status != StCommissioned {
		return cc.Errf(cc.ErrInvalidState, "lot %s is %s; only a COMMISSIONED lot can be graded", sscc, l.Status)
	}
	wbCanon, _, err := c.verifyDevice(ctx, weighbridgeJSON, weighbridgeSigHex, "weighbridge")
	if err != nil {
		return err
	}
	qCanon, _, err := c.verifyDevice(ctx, qualityJSON, qualitySigHex, "quality")
	if err != nil {
		return err
	}
	var wb weighbridgeReading
	if err := json.Unmarshal(wbCanon, &wb); err != nil || wb.NetKg <= 0 || wb.GrossKg-wb.TareKg != wb.NetKg || wb.NetKg != float64(int(wb.NetKg)) {
		return cc.Errf(cc.ErrValidation, "weighbridge reading must have whole-kg netKg = grossKg - tareKg > 0")
	}
	var q map[string]any
	_ = json.Unmarshal(qCanon, &q)
	section := map[string]string{"POTATO": "potato", "PADDY": "paddy", "BRINJAL": "vegetable", "CAULIFLOWER": "vegetable"}[l.Commodity]
	if _, ok := q[section]; !ok {
		return cc.Errf(cc.ErrValidation, "quality reading for %s must contain a %q section", l.Commodity, section)
	}
	l.NetKg, l.Grade = int(wb.NetKg), grade
	l.WeighbridgeJSON, l.WeighbridgeSigHex, l.QualityJSON, l.QualitySigHex = string(wbCanon), weighbridgeSigHex, string(qCanon), qualitySigHex
	if err := l.move(StGraded); err != nil {
		return err
	}
	if err := c.save(ctx, l); err != nil {
		return err
	}
	return cc.Emit(ctx, "LotGraded", "inspecting", "conformant", []string{sscc}, l.Village,
		map[string]any{"grade": grade, "netKg": l.NetKg, "weighbridgeHash": cc.Sha256Hex(wbCanon), "qualityHash": cc.Sha256Hex(qCanon)}, "QualityCredentialIssued")
}

// ---------------------------------------------------------------- status mirror calls (finance and trade transactions move the lot)

// SetInStorage marks the lot as stored (after pledge-lien.recordDeposit). GRADED to IN_STORAGE.
func (c *LotContract) SetInStorage(ctx contractapi.TransactionContextInterface, sscc, facility, facilityRef string) error {
	if _, err := cc.Require(ctx, cc.FpoOrg, cc.RoleWarehouse); err != nil {
		return err
	}
	l, err := c.load(ctx, sscc)
	if err != nil {
		return err
	}
	from := l.Status
	if err := l.move(StInStorage); err != nil {
		return err
	}
	l.Facility, l.FacilityRef = facility, facilityRef
	return c.statusChanged(ctx, l, from, facilityRef)
}

// SetPledged follows the lien: true after markLien (IN_STORAGE to PLEDGED); false after releaseLien. On release a PLEDGED lot goes back to
// IN_STORAGE; a lot that was listed or sold while pledged keeps its status and only loses the lien reference (which unblocks dispatch).
func (c *LotContract) SetPledged(ctx contractapi.TransactionContextInterface, sscc string, pledged bool, lienRef string) error {
	if _, err := cc.Require(ctx, cc.FpoOrg, cc.RoleWarehouse); err != nil {
		return err
	}
	l, err := c.load(ctx, sscc)
	if err != nil {
		return err
	}
	from := l.Status
	if pledged {
		if l.LienRef != "" {
			return cc.Errf(cc.ErrInvalidState, "lot %s is already pledged", sscc)
		}
		if err := l.move(StPledged); err != nil {
			return err
		}
		l.LienRef = lienRef
	} else {
		switch {
		case l.Status == StPledged:
			if err := l.move(StInStorage); err != nil {
				return err
			}
		case l.LienRef != "" && (l.Status == StListed || l.Status == StSold):
			// status stays; only the lien goes
		default:
			return cc.Errf(cc.ErrInvalidState, "lot %s has no active lien to release (status %s)", sscc, l.Status)
		}
		l.LienRef = ""
	}
	return c.statusChanged(ctx, l, from, lienRef)
}

// SetListed follows order-settlement.createOrder. GRADED or IN_STORAGE to LISTED; a PLEDGED lot gives ERR_LOT_PLEDGED.
func (c *LotContract) SetListed(ctx contractapi.TransactionContextInterface, sscc, orderID string) error {
	if _, err := cc.Require(ctx, cc.FpoOrg, cc.RoleCEO); err != nil {
		return err
	}
	l, err := c.load(ctx, sscc)
	if err != nil {
		return err
	}
	from := l.Status
	if err := l.move(StListed); err != nil {
		return err
	}
	l.OrderID = orderID
	return c.statusChanged(ctx, l, from, orderID)
}

// SetSold follows the second agreePrice. LISTED to SOLD. Only the public price hash is stored.
func (c *LotContract) SetSold(ctx contractapi.TransactionContextInterface, sscc, orderID, priceHash string) error {
	if _, err := cc.Require(ctx, cc.FpoOrg, cc.RoleCEO); err != nil {
		return err
	}
	if !hashRe.MatchString(priceHash) {
		return cc.Errf(cc.ErrValidation, "priceHash must be sha256 hex")
	}
	l, err := c.load(ctx, sscc)
	if err != nil {
		return err
	}
	from := l.Status
	if err := l.move(StSold); err != nil {
		return err
	}
	if l.OrderID != orderID {
		return cc.Errf(cc.ErrInvalidState, "lot %s is listed on order %q, not %q", sscc, l.OrderID, orderID)
	}
	l.PriceHash = priceHash
	return c.statusChanged(ctx, l, from, orderID)
}

// RecordQualityOutcome follows order-settlement.acceptQuality. Accepted keeps DELIVERED; rejected moves to REJECTED.
func (c *LotContract) RecordQualityOutcome(ctx contractapi.TransactionContextInterface, sscc string, accepted bool) error {
	if _, err := cc.Require(ctx, cc.BuyerOrg, cc.RoleBuyerManager); err != nil {
		return err
	}
	l, err := c.load(ctx, sscc)
	if err != nil {
		return err
	}
	if l.Status != StDelivered || l.QualityOutcome != "" {
		return cc.Errf(cc.ErrInvalidState, "lot %s is %s; quality can be recorded once, on a DELIVERED lot", sscc, l.Status)
	}
	from := l.Status
	l.QualityOutcome = "ACCEPTED"
	if !accepted {
		l.QualityOutcome = "REJECTED"
		if err := l.move(StRejected); err != nil {
			return err
		}
	}
	return c.statusChanged(ctx, l, from, l.OrderID)
}

// SetSettled follows order-settlement.recordSettlement. DELIVERED (quality accepted) to SETTLED.
func (c *LotContract) SetSettled(ctx contractapi.TransactionContextInterface, sscc string) error {
	if _, err := cc.Require(ctx, cc.FpoOrg, cc.RoleCEO); err != nil {
		return err
	}
	l, err := c.load(ctx, sscc)
	if err != nil {
		return err
	}
	if l.Status == StDelivered && l.QualityOutcome != "ACCEPTED" {
		return cc.Errf(cc.ErrInvalidState, "lot %s has no accepted quality outcome yet", sscc)
	}
	from := l.Status
	if err := l.move(StSettled); err != nil {
		return err
	}
	return c.statusChanged(ctx, l, from, l.OrderID)
}

// RecordTransformation grades a lot out to processing. GRADED or IN_STORAGE (not pledged) to TRANSFORMED.
func (c *LotContract) RecordTransformation(ctx contractapi.TransactionContextInterface, sscc, reason string) error {
	if _, err := cc.Require(ctx, cc.FpoOrg, cc.RoleCEO); err != nil {
		return err
	}
	l, err := c.load(ctx, sscc)
	if err != nil {
		return err
	}
	if err := l.move(StTransformed); err != nil {
		return err
	}
	l.TransformReason = cc.Sha256Hex([]byte(reason))
	if err := c.save(ctx, l); err != nil {
		return err
	}
	return cc.Emit(ctx, "LotTransformed", "transforming", "inactive", []string{sscc}, l.Village, map[string]any{"reasonHash": l.TransformReason})
}

// ---------------------------------------------------------------- F4: custody

// ProposeTransfer (F4) starts custody transfer to another org. It needs a SOLD lot (PLEDGED gives ERR_LOT_PLEDGED) and sets a
// state-based endorsement policy on the lot key, so that every later write to this lot needs BOTH the from-org and the to-org.
func (c *LotContract) ProposeTransfer(ctx contractapi.TransactionContextInterface, sscc, toOrg, vehicleNo, loggerID string) error {
	caller, err := cc.Require(ctx, cc.FpoOrg, cc.RoleOperator)
	if err != nil {
		return err
	}
	if !orgs[toOrg] || toOrg == caller.MSP {
		return cc.Errf(cc.ErrValidation, "toOrg must be another consortium org")
	}
	if vehicleNo == "" || loggerID == "" {
		return cc.Errf(cc.ErrValidation, "vehicleNo and loggerId are required")
	}
	l, err := c.load(ctx, sscc)
	if err != nil {
		return err
	}
	if err := l.move(StInTransit); err != nil {
		return err
	}
	at, err := cc.TxTime(ctx)
	if err != nil {
		return err
	}
	l.Custody = append(l.Custody, CustodyHop{From: caller.MSP, To: toOrg, VehicleHash: cc.Sha256Hex([]byte(vehicleNo)), LoggerID: loggerID, ProposedAt: at})
	if err := c.save(ctx, l); err != nil {
		return err
	}
	ep, err := statebased.NewStateEP(nil)
	if err != nil {
		return err
	}
	if err := ep.AddOrgs(statebased.RoleTypePeer, caller.MSP, toOrg); err != nil {
		return err
	}
	policy, err := ep.Policy()
	if err != nil {
		return err
	}
	if err := ctx.GetStub().SetStateValidationParameter(sscc, policy); err != nil {
		return err
	}
	return cc.Emit(ctx, "CustodyProposed", "shipping", "in_transit", []string{sscc}, l.Village, map[string]any{"from": caller.MSP, "to": toOrg, "loggerId": loggerID})
}

// AcceptTransfer (F4) completes custody. Only the org named in the proposal may accept: any other org gets ERR_UNILATERAL_CUSTODY.
func (c *LotContract) AcceptTransfer(ctx contractapi.TransactionContextInterface, sscc string) error {
	caller, err := cc.GetCaller(ctx)
	if err != nil {
		return err
	}
	l, err := c.load(ctx, sscc)
	if err != nil {
		return err
	}
	if l.Status != StInTransit || len(l.Custody) == 0 || l.Custody[len(l.Custody)-1].AcceptedAt != "" {
		return cc.Errf(cc.ErrInvalidState, "lot %s has no pending custody proposal", sscc)
	}
	hop := &l.Custody[len(l.Custody)-1]
	if caller.MSP != hop.To {
		return cc.Errf(cc.ErrUnilateralCustody, "custody of %s was proposed to %s; %s cannot accept it", sscc, hop.To, caller.MSP)
	}
	if caller.Role != cc.RoleBuyerManager {
		return cc.Errf(cc.ErrForbiddenRole, "role %q cannot accept custody", caller.Role)
	}
	at, err := cc.TxTime(ctx)
	if err != nil {
		return err
	}
	hop.AcceptedAt = at
	if err := l.move(StDelivered); err != nil {
		return err
	}
	if err := c.save(ctx, l); err != nil {
		return err
	}
	// custody is complete: drop the two-party policy so later writes fall back to the chaincode-level majority policy
	if err := ctx.GetStub().SetStateValidationParameter(sscc, nil); err != nil {
		return err
	}
	return cc.Emit(ctx, "CustodyAccepted", "receiving", "in_progress", []string{sscc}, l.Village, map[string]any{"from": hop.From, "to": hop.To})
}

// AnchorConditionDigest stores a cold-chain digest (window, min/max/avg temperature, breaches, hash of the full log).
func (c *LotContract) AnchorConditionDigest(ctx contractapi.TransactionContextInterface, sscc, window string, minC, maxC, avgC float64, breaches int, digestHash string) error {
	if _, err := cc.Require(ctx, cc.FpoOrg, cc.RoleOperator); err != nil {
		return err
	}
	if !hashRe.MatchString(digestHash) || window == "" || breaches < 0 || minC > maxC || avgC < minC || avgC > maxC {
		return cc.Errf(cc.ErrValidation, "window, digestHash (sha256 hex), breaches >= 0 and minC <= avgC <= maxC are required")
	}
	l, err := c.load(ctx, sscc)
	if err != nil {
		return err
	}
	if l.Status != StInTransit && l.Status != StInStorage && l.Status != StDelivered {
		return cc.Errf(cc.ErrInvalidState, "lot %s is %s; digests are anchored while stored or in transit", sscc, l.Status)
	}
	at, err := cc.TxTime(ctx)
	if err != nil {
		return err
	}
	l.Digests = append(l.Digests, Digest{Window: window, MinC: minC, MaxC: maxC, AvgC: avgC, Breaches: breaches, DigestHash: digestHash, At: at, TxID: ctx.GetStub().GetTxID()})
	if err := c.save(ctx, l); err != nil {
		return err
	}
	return cc.Emit(ctx, "ConditionDigestAnchored", "urn:fposetu:bizstep:condition_monitoring", "in_progress", []string{sscc}, l.Village,
		map[string]any{"window": window, "breaches": breaches, "digestHash": digestHash})
}

// ---------------------------------------------------------------- F7: patronage

// DistributePatronage (F7) records one run. The vector must reconcile: sum(gross) equals the settlement amount and
// sum(net) + sum(all deductions, FPO_MARGIN included) equals it too, each within INR 1 in total, else ERR_PATRONAGE_UNBALANCED.
// No price per kilogram is written. Per-member amounts ARE on this channel (see docs/DECISIONS.md D11).
func (c *LotContract) DistributePatronage(ctx contractapi.TransactionContextInterface, runID, orderID string, settlementAmount int64, linesJSON string) error {
	if _, err := cc.Require(ctx, cc.FpoOrg, cc.RoleCEO); err != nil {
		return err
	}
	if runID == "" || orderID == "" || settlementAmount <= 0 {
		return cc.Errf(cc.ErrValidation, "runId, orderId and a positive settlementAmount are required")
	}
	var lines []PatronageLine
	if err := json.Unmarshal([]byte(linesJSON), &lines); err != nil || len(lines) == 0 {
		return cc.Errf(cc.ErrValidation, "lines must be a non-empty JSON array")
	}
	if prior, _ := ctx.GetStub().GetState(patronagePrefix + "ORDER_" + orderID); len(prior) > 0 {
		return cc.Errf(cc.ErrInvalidState, "order %s already has a patronage run", orderID)
	}
	var gross, net, ded, margin int64
	seen := map[string]bool{}
	for i := range lines {
		ln := &lines[i]
		if ln.Deductions == nil {
			ln.Deductions = []Deduction{}
		}
		if seen[ln.SSCC] {
			return cc.Errf(cc.ErrValidation, "lot %s appears twice", ln.SSCC)
		}
		seen[ln.SSCC] = true
		if ln.Gross < 0 || ln.Net < 0 || ln.Kg <= 0 {
			return cc.Errf(cc.ErrValidation, "line %d has negative amounts or no weight", i)
		}
		for _, d := range ln.Deductions {
			if !dedTypes[d.Type] || d.Amount < 0 {
				return cc.Errf(cc.ErrValidation, "line %d has an invalid deduction %q", i, d.Type)
			}
			ded += d.Amount
			if d.Type == "FPO_MARGIN" {
				margin += d.Amount
			}
		}
		gross += ln.Gross
		net += ln.Net
	}
	if abs64(settlementAmount-gross) > 1 || abs64(settlementAmount-(net+ded)) > 1 {
		return cc.Errf(cc.ErrPatronageUnbalanced, "settlement %d, sum of gross %d, sum of net %d + deductions %d: they must agree within 1", settlementAmount, gross, net, ded)
	}
	for _, ln := range lines {
		l, err := c.load(ctx, ln.SSCC)
		if err != nil {
			return err
		}
		if l.OrderID != orderID || l.FarmerToken != ln.FarmerToken || ln.Kg > l.NetKg {
			return cc.Errf(cc.ErrValidation, "line for lot %s does not match its order, farmer or weight", ln.SSCC)
		}
		if err := l.move(StClosed); err != nil {
			return err
		}
		l.PatronageRunID = runID
		if err := c.save(ctx, l); err != nil {
			return err
		}
	}
	at, err := cc.TxTime(ctx)
	if err != nil {
		return err
	}
	run := &PatronageRun{RunID: runID, OrderID: orderID, SettlementAmount: settlementAmount, FpoMargin: margin, Lines: lines, DistributedAt: at, TxID: ctx.GetStub().GetTxID()}
	if err := cc.PutJSON(ctx, patronagePrefix+runID, run); err != nil {
		return err
	}
	if err := ctx.GetStub().PutState(patronagePrefix+"ORDER_"+orderID, []byte(runID)); err != nil {
		return err
	}
	epc := make([]string, 0, len(lines))
	for _, ln := range lines {
		epc = append(epc, ln.SSCC)
	}
	return cc.Emit(ctx, "PatronageDistributed", "urn:fposetu:bizstep:patronage", "inactive", epc, "", map[string]any{"runId": runID, "orderId": orderID, "memberCount": len(lines)})
}

func abs64(x int64) int64 {
	if x < 0 {
		return -x
	}
	return x
}

// ---------------------------------------------------------------- DPDP erasure

// MarkUnverifiable (DPDP Act 2023) breaks the origin link of one farmer: the farmer record loses its device key and plot
// references, every lot of the farmer gets originStatus UNVERIFIABLE, and lots that have not been sold yet get status UNVERIFIABLE.
func (c *LotContract) MarkUnverifiable(ctx contractapi.TransactionContextInterface, farmerToken string) error {
	if _, err := cc.Require(ctx, cc.FpoOrg, cc.RoleCEO, cc.RoleMember); err != nil {
		return err
	}
	var f Farmer
	found, err := cc.GetJSON(ctx, farmerKeyPrefix+farmerToken, &f)
	if err != nil {
		return err
	}
	if !found {
		return cc.Errf(cc.ErrNotFound, "farmer %s is not registered", farmerToken)
	}
	if f.Erased {
		return cc.Errf(cc.ErrInvalidState, "farmer %s is already erased", farmerToken)
	}
	it, err := ctx.GetStub().GetStateByPartialCompositeKey(farmerLotIndex, []string{farmerToken})
	if err != nil {
		return err
	}
	defer it.Close()
	var affected []string
	for it.HasNext() {
		kv, err := it.Next()
		if err != nil {
			return err
		}
		_, parts, err := ctx.GetStub().SplitCompositeKey(kv.Key)
		if err != nil || len(parts) != 2 {
			return cc.Errf(cc.ErrValidation, "bad lot index entry")
		}
		l, err := c.load(ctx, parts[1])
		if err != nil {
			return err
		}
		l.OriginStatus = OriginBroken
		if l.Status == StCommissioned || l.Status == StGraded || l.Status == StInStorage {
			l.Status = StUnverifiable
		}
		if err := c.save(ctx, l); err != nil {
			return err
		}
		affected = append(affected, l.SSCC)
	}
	f.Erased, f.DevicePubKeyHex, f.PlotIDs, f.PolygonHashes, f.ConsentHash = true, "", []string{}, []string{}, "" // empty slices, not nil: a JSON null fails contractapi validation
	if err := cc.PutJSON(ctx, farmerKeyPrefix+farmerToken, &f); err != nil {
		return err
	}
	return cc.Emit(ctx, "PersonalDataErased", "urn:fposetu:bizstep:erasure", "inactive", affected, "", map[string]any{"farmerToken": farmerToken, "lotsAffected": len(affected)})
}

// ---------------------------------------------------------------- queries

func (c *LotContract) GetLot(ctx contractapi.TransactionContextInterface, sscc string) (*Lot, error) {
	return c.load(ctx, sscc)
}

func (c *LotContract) GetFarmer(ctx contractapi.TransactionContextInterface, farmerToken string) (*Farmer, error) {
	var f Farmer
	found, err := cc.GetJSON(ctx, farmerKeyPrefix+farmerToken, &f)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, cc.Errf(cc.ErrNotFound, "farmer %s is not registered", farmerToken)
	}
	return &f, nil
}

func (c *LotContract) GetDevice(ctx contractapi.TransactionContextInterface, deviceID string) (*Device, error) {
	var d Device
	found, err := cc.GetJSON(ctx, deviceKeyPrefix+deviceID, &d)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, cc.Errf(cc.ErrNotFound, "device %s is not registered", deviceID)
	}
	return &d, nil
}

func (c *LotContract) GetPatronageRun(ctx contractapi.TransactionContextInterface, runID string) (*PatronageRun, error) {
	var r PatronageRun
	found, err := cc.GetJSON(ctx, patronagePrefix+runID, &r)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, cc.Errf(cc.ErrNotFound, "patronage run %s does not exist", runID)
	}
	return &r, nil
}

// ListLotsByFarmer returns the SSCCs of a farmer's lots (the index survives erasure; the lots stay, flagged unverifiable).
func (c *LotContract) ListLotsByFarmer(ctx contractapi.TransactionContextInterface, farmerToken string) ([]string, error) {
	it, err := ctx.GetStub().GetStateByPartialCompositeKey(farmerLotIndex, []string{farmerToken})
	if err != nil {
		return nil, err
	}
	defer it.Close()
	out := []string{}
	for it.HasNext() {
		kv, err := it.Next()
		if err != nil {
			return nil, err
		}
		_, parts, err := ctx.GetStub().SplitCompositeKey(kv.Key)
		if err != nil || len(parts) != 2 {
			return nil, fmt.Errorf("bad lot index entry")
		}
		out = append(out, parts[1])
	}
	return out, nil
}

// GetLotHistory returns every committed version of a lot (transaction, time, status).
func (c *LotContract) GetLotHistory(ctx contractapi.TransactionContextInterface, sscc string) ([]HistoryEntry, error) {
	it, err := ctx.GetStub().GetHistoryForKey(sscc)
	if err != nil {
		return nil, err
	}
	defer it.Close()
	out := []HistoryEntry{}
	for it.HasNext() {
		m, err := it.Next()
		if err != nil {
			return nil, err
		}
		e := HistoryEntry{TxID: m.TxId, IsDelete: m.IsDelete}
		if m.Timestamp != nil {
			e.Timestamp = m.Timestamp.AsTime().UTC().Format("2006-01-02T15:04:05Z")
		}
		var l Lot
		if !m.IsDelete && json.Unmarshal(m.Value, &l) == nil {
			e.Status = l.Status
		}
		out = append(out, e)
	}
	return out, nil
}
