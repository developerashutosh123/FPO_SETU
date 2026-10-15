package common

import "regexp"

var ssccRe = regexp.MustCompile(`^\d{18}$`)

// SSCCCheckDigit is the GS1 mod-10 check digit for the first 17 digits (same algorithm as ssccCheckDigit in contract.ts).
func SSCCCheckDigit(first17 string) (int, bool) {
	if len(first17) != 17 {
		return 0, false
	}
	sum := 0
	for i := 0; i < 17; i++ {
		d := first17[i]
		if d < '0' || d > '9' {
			return 0, false
		}
		w := 1
		if i%2 == 0 {
			w = 3
		}
		sum += int(d-'0') * w
	}
	return (10 - sum%10) % 10, true
}

// ValidSSCC reports whether s is an 18-digit SSCC with a correct check digit.
func ValidSSCC(s string) bool {
	if !ssccRe.MatchString(s) {
		return false
	}
	cd, ok := SSCCCheckDigit(s[:17])
	return ok && int(s[17]-'0') == cd
}
