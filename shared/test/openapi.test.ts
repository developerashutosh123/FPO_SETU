import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, stringify } from 'yaml';
import SwaggerParser from '@apidevtools/swagger-parser';
import { ENDPOINTS, ROLES } from '../mock/endpoints.mjs';
import { buildOpenApi } from '../scripts/build-openapi.ts';
import { CONTRACT_VERSION } from '../contract.ts';

const file = new URL('../openapi.yaml', import.meta.url);

test('openapi.yaml is current: regenerate with pnpm build:openapi', () => {
  assert.equal(readFileSync(file, 'utf8'), stringify(buildOpenApi(), { lineWidth: 0 }));
});
test('openapi.yaml is valid OpenAPI 3.1 and carries the contract version', async () => {
  const api = (await SwaggerParser.validate(file.pathname)) as { openapi: string; info: { version: string } };
  assert.equal(api.openapi, '3.1.0');
  assert.equal(api.info.version, CONTRACT_VERSION);
});
test('endpoint table: unique ids, valid roles, every method+path unique', () => {
  const valid = new Set([...ROLES, 'public', 'authenticated']);
  assert.equal(new Set(ENDPOINTS.map((e) => e.id)).size, ENDPOINTS.length);
  assert.equal(new Set(ENDPOINTS.map((e) => `${e.method} ${e.path}`)).size, ENDPOINTS.length);
  for (const e of ENDPOINTS) for (const r of e.roles) assert.ok(valid.has(r), `${e.id}: unknown role ${r}`);
});
test('every endpoint in CONTRACT.md Section 8 is in the endpoint table, and the table has nothing extra', () => {
  const md = readFileSync(new URL('../CONTRACT.md', import.meta.url), 'utf8');
  const sec = md.slice(md.indexOf('## 8. Gateway API'), md.indexOf('## 9. Cross-portal'));
  const fromDoc = new Set<string>();
  for (const m of sec.matchAll(/`(GET|POST|DELETE) (\/[^\s`?]*)/g)) fromDoc.add(`${m[1]} ${m[2]}`);
  const fromTable = new Set(ENDPOINTS.map((e) => `${e.method} ${e.path.replace(/\{(\w+)\}/g, ':$1')}`));
  // the doc names path params differently in places (:id vs :orderId); compare after normalising param names
  const norm = (s: string) => s.replace(/:\w+/g, ':p').replace(/\{\w+\}/g, ':p');
  const a = new Set([...fromDoc].map(norm)), b = new Set([...fromTable].map(norm));
  assert.deepEqual([...a].filter((x) => !b.has(x)), [], 'in CONTRACT.md but not in endpoints.mjs');
  assert.deepEqual([...b].filter((x) => !a.has(x)), [], 'in endpoints.mjs but not in CONTRACT.md');
});
test('every request and response type resolves to a schema', () => {
  const api = parse(readFileSync(file, 'utf8')) as { components: { schemas: Record<string, unknown> }; paths: Record<string, Record<string, { responses: Record<string, { content?: Record<string, { schema?: { $ref: string } }> }> }>> };
  const names = new Set(Object.keys(api.components.schemas));
  const refs = JSON.stringify(api).match(/#\/components\/schemas\/[A-Za-z0-9_]+/g) ?? [];
  for (const r of refs) assert.ok(names.has(r.split('/').pop()!), `dangling ${r}`);
  assert.ok(names.has('LedgerReceipt') && names.has('ApiError'));
});
