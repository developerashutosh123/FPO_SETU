// Writes shared/testvectors/canonical-json.json: inputs, expected canonical bytes and SHA-256, for the Go verifier in chaincode/ (phase C3).
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, CONTRACT_VERSION } from '../contract.ts';

export const CASES: { name: string; input: unknown; note?: string }[] = [
  { name: 'sorted keys, nested', input: { b: 1, a: { d: [3, 2, 1], c: 'x' } } },
  { name: 'f2 lot commission payload', input: { sscc: '089012340000004517', farmerToken: 'FT-9c2e41a07b55d3f1', plotId: 'PL-7Q2M9X4K1A', commodity: 'POTATO', bagCount: 40, estWeightKg: 2000, harvestOrUnloadDate: '2026-11-02' } },
  { name: 'bengali text stays raw UTF-8', input: { name: 'অনিমা দাস', note: 'আমি নিশ্চিত করছি' } },
  { name: 'html characters are not escaped', input: { s: '<a href="x">&</a>' }, note: 'Go json.Marshal escapes < > & by default; the verifier must not.' },
  { name: 'line and paragraph separators stay raw', input: { s: 'a b c' }, note: 'Go json.Marshal escapes U+2028 and U+2029; the verifier must not.' },
  { name: 'control characters and quotes are escaped', input: { s: 'line1\nline2\t"q"\\' } },
  { name: 'booleans and null', input: { t: true, f: false, n: null } },
  { name: 'integers only, no exponent', input: { a: 0, b: -7, c: 2000, d: 1234567890123 } },
  { name: 'empty containers', input: { a: [], o: {} } },
  { name: 'array order is preserved', input: ['b', 'a', { z: 1, y: 2 }] },
];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export function vectors() {
  return {
    contractVersion: CONTRACT_VERSION,
    rules: 'keys sorted by UTF-16 code unit (use ASCII keys), no whitespace, UTF-8 bytes, no HTML escaping, undefined properties dropped, NaN/Infinity/undefined array items rejected',
    cases: CASES.map((c) => { const canonical = canonicalJson(c.input); return { name: c.name, ...(c.note ? { note: c.note } : {}), input: c.input, canonical, sha256: createHash('sha256').update(canonical, 'utf8').digest('hex') }; }),
  };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(join(root, 'testvectors', 'canonical-json.json'), JSON.stringify(vectors(), null, 2) + '\n');
  console.log('testvectors/canonical-json.json written');
}
