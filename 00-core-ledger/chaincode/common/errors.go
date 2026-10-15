// Package common holds the rule helpers shared by the three FPO-SETU chaincodes:
// error codes, identity checks, canonical JSON, signature verification, SSCC check digits and event emission.
package common

import (
	"fmt"
	"strings"
)

// Error codes (CONTRACT.md Section 8). Every chaincode error message starts with "<CODE>: ", which the gateway maps to the API error.
const (
	ErrForbiddenRole       = "ERR_FORBIDDEN_ROLE"
	ErrForbiddenOrg        = "ERR_FORBIDDEN_ORG"
	ErrValidation          = "ERR_VALIDATION"
	ErrNotFound            = "ERR_NOT_FOUND"
	ErrInvalidState        = "ERR_INVALID_STATE"
	ErrBadFarmerSignature  = "ERR_BAD_FARMER_SIGNATURE"
	ErrBadDeviceSignature  = "ERR_BAD_DEVICE_SIGNATURE"
	ErrDoubleFinancing     = "ERR_DOUBLE_FINANCING"
	ErrLotPledged          = "ERR_LOT_PLEDGED"
	ErrUnilateralCustody   = "ERR_UNILATERAL_CUSTODY"
	ErrPriceHashMismatch   = "ERR_PRICE_HASH_MISMATCH"
	ErrPatronageUnbalanced = "ERR_PATRONAGE_UNBALANCED"
)

// Errf builds an error whose message starts with the code.
func Errf(code, format string, a ...any) error {
	return fmt.Errorf("%s: %s", code, fmt.Sprintf(format, a...))
}

// CodeOf returns the error code at the start of err's message, or "" if there is none.
func CodeOf(err error) string {
	if err == nil {
		return ""
	}
	msg := err.Error()
	if i := strings.Index(msg, ": "); i > 0 && strings.HasPrefix(msg, "ERR_") {
		return msg[:i]
	}
	return ""
}
