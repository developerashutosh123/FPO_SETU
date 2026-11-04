import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const shared = join(root, '..', 'shared');

// Skipped where ../shared is absent (Vercel builds use only the committed copies).
describe.skipIf(!existsSync(shared))('contract copies match ../shared', () => {
  for (const [from, to] of [['contract.ts', 'src/contract/contract.ts'], ['design/tokens.css', 'src/styles/tokens.css']] as const) {
    it(`${to} is the generated copy of shared/${from}`, () => {
      const body = readFileSync(join(shared, from), 'utf8');
      expect(readFileSync(join(root, to), 'utf8').endsWith(body)).toBe(true);
    });
  }
});
