package common

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math/big"
)

// ValidatePublicKey checks that pubHex is a 130-hex-char uncompressed SEC1 point on the P-256 curve.
func ValidatePublicKey(pubHex string) error {
	pub, err := hex.DecodeString(pubHex)
	if err != nil || len(pub) != 65 || pub[0] != 0x04 {
		return fmt.Errorf("public key must be 130 hex chars (04||X||Y)")
	}
	if !elliptic.P256().IsOnCurve(new(big.Int).SetBytes(pub[1:33]), new(big.Int).SetBytes(pub[33:])) {
		return fmt.Errorf("public key is not on the P-256 curve")
	}
	return nil
}

// VerifyP256 checks an ECDSA P-256 / SHA-256 signature.
// pubHex: 130 hex chars, uncompressed SEC1 point 04||X||Y. sigHex: 128 hex chars, r||s (32 bytes each, big-endian), as Web Crypto produces.
func VerifyP256(pubHex, sigHex string, message []byte) error {
	pub, err := hex.DecodeString(pubHex)
	if err != nil || len(pub) != 65 || pub[0] != 0x04 {
		return fmt.Errorf("public key must be 130 hex chars (04||X||Y)")
	}
	sig, err := hex.DecodeString(sigHex)
	if err != nil || len(sig) != 64 {
		return fmt.Errorf("signature must be 128 hex chars (r||s)")
	}
	curve := elliptic.P256()
	x := new(big.Int).SetBytes(pub[1:33])
	y := new(big.Int).SetBytes(pub[33:])
	if !curve.IsOnCurve(x, y) {
		return fmt.Errorf("public key is not on the P-256 curve")
	}
	r := new(big.Int).SetBytes(sig[:32])
	s := new(big.Int).SetBytes(sig[32:])
	digest := sha256.Sum256(message)
	if !ecdsa.Verify(&ecdsa.PublicKey{Curve: curve, X: x, Y: y}, digest[:], r, s) {
		return fmt.Errorf("signature does not match")
	}
	return nil
}

// Sha256Hex returns the lowercase hex SHA-256 of data.
func Sha256Hex(data []byte) string {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:])
}
