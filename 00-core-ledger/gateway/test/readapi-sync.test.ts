// read-api/src/gateway/ is a generated copy of this source (the read-only API runs the same routes and the same role filters).
// If a source file changes and the copy is not regenerated, the read-only API would serve old logic: fail here instead.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { copyOf, sourceFiles } from '../../read-api/scripts/sync-gateway.mjs';

const gw = join(__dirname, '..');
const copy = join(__dirname, '..', '..', 'read-api', 'src', 'gateway');

describe.skipIf(!existsSync(copy))('read-api/src/gateway is in sync with gateway/src', () => {
  for (const rel of sourceFiles() as string[]) {
    it(rel, () => { expect(readFileSync(join(copy, rel), 'utf8')).toBe(copyOf(rel, readFileSync(join(gw, 'src', rel), 'utf8'))); });
  }
  it('rates.json equals gateway/config/rates.json', () => { expect(readFileSync(join(copy, 'rates.json'), 'utf8')).toBe(readFileSync(join(gw, 'config', 'rates.json'), 'utf8')); });
});
