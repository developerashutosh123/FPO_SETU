import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const shared = join(__dirname, '..', '..', '..', 'shared');
const local = join(__dirname, '..', 'src', 'contract');
const strip = (s: string) => s.split('\n').slice(1).join('\n');

describe.skipIf(!existsSync(shared))('villages copy', () => {
  it('villages.json equals the villages example of shared/fixtures/villages.json', () => {
    const fx = JSON.parse(readFileSync(join(shared, 'fixtures', 'villages.json'), 'utf8'));
    expect(JSON.parse(readFileSync(join(local, 'villages.json'), 'utf8'))).toEqual(fx.examples.find((e: { endpoint: string }) => e.endpoint === 'villages').body);
  });
});

describe.skipIf(!existsSync(shared))('contract copies', () => {
  for (const [from, to] of [['contract.ts', 'contract.ts'], ['mock/endpoints.mjs', 'endpoints.mjs'], ['openapi.yaml', 'openapi.yaml']] as const) {
    it(`${to} equals shared/${from}`, () => {
      expect(strip(readFileSync(join(local, to), 'utf8'))).toBe(readFileSync(join(shared, from), 'utf8'));
    });
  }
});
