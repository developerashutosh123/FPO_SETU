package testkit

import "crypto/sha256"

func sha256Bytes(b []byte) []byte { h := sha256.Sum256(b); return h[:] }
