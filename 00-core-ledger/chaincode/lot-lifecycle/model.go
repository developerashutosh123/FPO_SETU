package main

// Lot statuses (CONTRACT.md Section 3.2).
const (
	StCommissioned  = "COMMISSIONED"
	StGraded        = "GRADED"
	StInStorage     = "IN_STORAGE"
	StPledged       = "PLEDGED"
	StListed        = "LISTED"
	StSold          = "SOLD"
	StInTransit     = "IN_TRANSIT"
	StDelivered     = "DELIVERED"
	StSettled       = "SETTLED"
	StClosed        = "CLOSED"
	StTransformed   = "TRANSFORMED"
	StRejected      = "REJECTED"
	StUnverifiable  = "UNVERIFIABLE"
	OriginVerified  = "VERIFIED"
	OriginBroken    = "UNVERIFIABLE"
	deviceKeyPrefix = "DEVICE_"
	farmerKeyPrefix = "FARMER_"
	inputKeyPrefix  = "INPUT_"
	patronagePrefix = "PATRONAGE_"
	farmerLotIndex  = "farmerLot"
)

// Farmer holds only pseudonymous data: the token, the device public key, a consent hash and plot references.
type Farmer struct {
	Token           string   `json:"farmerToken"`
	DevicePubKeyHex string   `json:"devicePubKeyHex"`
	ConsentHash     string   `json:"consentHash"`
	PlotIDs         []string `json:"plotIds"`
	PolygonHashes   []string `json:"polygonHashes"`
	Erased          bool     `json:"erased"`
	RegisteredAt    string   `json:"registeredAt"`
}

// Device is a registered simulated weighbridge or quality meter.
type Device struct {
	DeviceID     string `json:"deviceId"`
	PubKeyHex    string `json:"pubKeyHex"`
	Kind         string `json:"kind"` // weighbridge | quality
	RegisteredAt string `json:"registeredAt"`
}

type CustodyHop struct {
	From        string `json:"from"`
	To          string `json:"to"`
	VehicleHash string `json:"vehicleHash"`
	LoggerID    string `json:"loggerId"`
	ProposedAt  string `json:"proposedAt"`
	AcceptedAt  string `json:"acceptedAt"`
}

type Digest struct {
	Window     string  `json:"window"`
	MinC       float64 `json:"minC"`
	MaxC       float64 `json:"maxC"`
	AvgC       float64 `json:"avgC"`
	Breaches   int     `json:"breaches"`
	DigestHash string  `json:"digestHash"`
	At         string  `json:"at"`
	TxID       string  `json:"txId"`
}

// Lot is stored under its SSCC.
type Lot struct {
	SSCC                string       `json:"sscc"`
	HumanRef            string       `json:"humanRef"`
	Commodity           string       `json:"commodity"`
	Variety             string       `json:"variety"`
	Village             string       `json:"village"`
	FarmerToken         string       `json:"farmerToken"`
	PlotID              string       `json:"plotId"`
	BagCount            int          `json:"bagCount"`
	EstWeightKg         int          `json:"estWeightKg"`
	HarvestOrUnloadDate string       `json:"harvestOrUnloadDate"`
	FarmerSignatureHex  string       `json:"farmerSignatureHex"`
	Status              string       `json:"status"`
	OriginStatus        string       `json:"originStatus"`
	Grade               string       `json:"grade"`
	NetKg               int          `json:"netKg"`
	WeighbridgeJSON     string       `json:"weighbridge"` // canonical JSON text of the signed reading
	WeighbridgeSigHex   string       `json:"weighbridgeSigHex"`
	QualityJSON         string       `json:"quality"` // canonical JSON text of the signed reading
	QualitySigHex       string       `json:"qualitySigHex"`
	Facility            string       `json:"facility"`
	FacilityRef         string       `json:"facilityRef"`
	LienRef             string       `json:"lienRef"`
	OrderID             string       `json:"orderId"`
	PriceHash           string       `json:"priceHash"`
	QualityOutcome      string       `json:"qualityOutcome"` // "", ACCEPTED or REJECTED
	Custody             []CustodyHop `json:"custody"`
	Digests             []Digest     `json:"digests"`
	PatronageRunID      string       `json:"patronageRunId"`
	TransformReason     string       `json:"transformReasonHash"`
	CreatedAt           string       `json:"createdAt"`
	UpdatedAt           string       `json:"updatedAt"`
	LastTxID            string       `json:"lastTxId"`
}

// PatronageLine is one member's payout in a run. It carries amounts but never a price per kilogram.
type PatronageLine struct {
	FarmerToken string      `json:"farmerToken"`
	SSCC        string      `json:"sscc"`
	Kg          int         `json:"kg"`
	Gross       int64       `json:"gross"`
	Deductions  []Deduction `json:"deductions"`
	Net         int64       `json:"net"`
}
type Deduction struct {
	Type   string `json:"type"`
	Amount int64  `json:"amount"`
}
type PatronageRun struct {
	RunID            string          `json:"runId"`
	OrderID          string          `json:"orderId"`
	SettlementAmount int64           `json:"settlementAmount"`
	FpoMargin        int64           `json:"fpoMargin"`
	Lines            []PatronageLine `json:"lines"`
	DistributedAt    string          `json:"distributedAt"`
	TxID             string          `json:"txId"`
}

// HistoryEntry is returned by GetLotHistory.
type HistoryEntry struct {
	TxID      string `json:"txId"`
	Timestamp string `json:"timestamp"`
	IsDelete  bool   `json:"isDelete"`
	Status    string `json:"status"`
}
