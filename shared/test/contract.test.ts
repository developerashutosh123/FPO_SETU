import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalJson, ssccCheckDigit, isValidSscc, formatINR, formatDateIST, shortHash, CONTRACT_VERSION, LEDGER_EVENTS, ERROR_HTTP_STATUS } from '../contract.ts';
import { vectors } from '../scripts/gen-testvectors.ts';

// independent GS1 implementation: weights 3,1,3,1,... from the left over 17 digits
const refCheck = (d17: string) => { let s = 0; for (let i = 0; i < 17; i++) s += Number(d17[i]) * (i % 2 === 0 ? 3 : 1); return (10 - (s % 10)) % 10; };

test('ssccCheckDigit: contract example 089012340000004517 is valid', () => {
  assert.equal(ssccCheckDigit('08901234000000451'), 7);
  assert.ok(isValidSscc('089012340000004517'));
});
test('ssccCheckDigit: matches an independent implementation on 500 values', () => {
  for (let i = 0; i < 500; i++) {
    const body = '08901234' + String(i * 7919).padStart(9, '0');
    assert.equal(ssccCheckDigit(body), refCheck(body), body);
  }
});
test('ssccCheckDigit: rejects bad input; isValidSscc rejects a wrong digit and wrong length', () => {
  assert.throws(() => ssccCheckDigit('123'));
  assert.throws(() => ssccCheckDigit('0890123400000045a'));
  assert.equal(isValidSscc('089012340000004518'), false);
  assert.equal(isValidSscc('08901234000000451'), false);
});

test('canonicalJson: sorts keys recursively, no whitespace', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [3, 2, 1], c: 'x' } }), '{"a":{"c":"x","d":[3,2,1]},"b":1}');
});
test('canonicalJson: key insertion order does not matter', () => {
  assert.equal(canonicalJson({ x: 1, y: 2 }), canonicalJson({ y: 2, x: 1 }));
});
test('canonicalJson: drops undefined properties, keeps null', () => {
  assert.equal(canonicalJson({ a: undefined, b: null }), '{"b":null}');
});
test('canonicalJson: Bengali text is raw UTF-8, not \\u escaped', () => {
  assert.equal(canonicalJson({ n: 'অনিমা' }), '{"n":"অনিমা"}');
});
test('canonicalJson: rejects values that would sign different bytes than a verifier sees', () => {
  assert.throws(() => canonicalJson({ a: NaN }));
  assert.throws(() => canonicalJson({ a: Infinity }));
  assert.throws(() => canonicalJson([1, undefined]));
  assert.throws(() => canonicalJson(undefined));
  assert.throws(() => canonicalJson({ d: new Date() }));
  assert.throws(() => canonicalJson({ b: 1n }));
  assert.throws(() => canonicalJson({ f: () => 1 }));
});
test('canonicalJson: committed test vectors are current (Go verifier reads testvectors/canonical-json.json)', () => {
  const committed = JSON.parse(readFileSync(new URL('../testvectors/canonical-json.json', import.meta.url), 'utf8'));
  assert.deepEqual(committed, vectors(), 'run: pnpm exec node --experimental-strip-types scripts/gen-testvectors.ts');
});

test('helpers: formatINR uses lakh grouping; formatDateIST converts to IST', () => {
  assert.equal(formatINR(120450).replace(/\s/g, ''), '₹1,20,450');
  assert.equal(formatDateIST('2026-11-14T20:00:00Z'), '15-11-2026');
  assert.equal(shortHash('3f2a91c4d5e6f7a8b9c0d1e2f3a4b5c6', 4), '3f2a…b5c6');
});
test('contract: version, event list and error status map are consistent', () => {
  assert.equal(CONTRACT_VERSION, '1.0.1');
  assert.equal(new Set(LEDGER_EVENTS).size, LEDGER_EVENTS.length);
  assert.ok(LEDGER_EVENTS.includes('LotStatusChanged'));
  assert.equal(ERROR_HTTP_STATUS.ERR_LEDGER_UNAVAILABLE, 503);
  const md = readFileSync(new URL('../CONTRACT.md', import.meta.url), 'utf8');
  assert.ok(md.startsWith(`# FPO-SETU Shared Contract (v${CONTRACT_VERSION})`), 'CONTRACT.md title must carry the contract version');
  assert.match(md, new RegExp(`- ${CONTRACT_VERSION.replace(/\./g, '\\.')}\\b`), 'changelog must have a line for this version');
});
