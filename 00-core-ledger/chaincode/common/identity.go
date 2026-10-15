package common

import (
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// Org MSP IDs and role attribute values (CONTRACT.md Sections 5 and 7).
const (
	FpoOrg       = "FpoOrgMSP"
	BankOrg      = "BankOrgMSP"
	BuyerOrg     = "BuyerOrgMSP"
	RegulatorOrg = "RegulatorOrgMSP"

	RoleMember        = "member"
	RoleVLE           = "vle"
	RoleCEO           = "ceo"
	RoleOperator      = "operator"
	RoleWarehouse     = "warehouse"
	RoleBoard         = "board"
	RoleCreditOfficer = "credit_officer"
	RoleBuyerManager  = "buyer_manager"
	RoleObserver      = "observer"
	RoleDevice        = "device"
)

// Caller is the identity that signed the proposal.
type Caller struct{ MSP, Role string }

// GetCaller reads the MSP ID and the `role` attribute of the submitter's enrolment certificate.
func GetCaller(ctx contractapi.TransactionContextInterface) (Caller, error) {
	id := ctx.GetClientIdentity()
	msp, err := id.GetMSPID()
	if err != nil {
		return Caller{}, Errf(ErrValidation, "cannot read caller MSP: %v", err)
	}
	role, found, err := id.GetAttributeValue("role")
	if err != nil {
		return Caller{}, Errf(ErrValidation, "cannot read caller role: %v", err)
	}
	if !found {
		role = ""
	}
	return Caller{MSP: msp, Role: role}, nil
}

// Require checks that the caller belongs to `msp` and holds one of `roles`.
// Wrong org gives ERR_FORBIDDEN_ORG, right org with a wrong role gives ERR_FORBIDDEN_ROLE.
func Require(ctx contractapi.TransactionContextInterface, msp string, roles ...string) (Caller, error) {
	c, err := GetCaller(ctx)
	if err != nil {
		return c, err
	}
	if c.MSP != msp {
		return c, Errf(ErrForbiddenOrg, "%s cannot call this function (needs %s)", c.MSP, msp)
	}
	for _, r := range roles {
		if c.Role == r {
			return c, nil
		}
	}
	return c, Errf(ErrForbiddenRole, "role %q cannot call this function (needs one of %v)", c.Role, roles)
}

// RequireCollectionMember is the chaincode-side twin of the peer's memberOnlyRead/memberOnlyWrite: the caller's org must be listed.
func RequireCollectionMember(ctx contractapi.TransactionContextInterface, collection string, members ...string) (Caller, error) {
	c, err := GetCaller(ctx)
	if err != nil {
		return c, err
	}
	for _, m := range members {
		if c.MSP == m {
			return c, nil
		}
	}
	return c, Errf(ErrForbiddenOrg, "%s is not a member of %s", c.MSP, collection)
}
