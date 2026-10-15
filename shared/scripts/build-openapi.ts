// Builds shared/openapi.yaml from mock/endpoints.mjs (paths) and contract.ts (schemas, via ts-json-schema-generator).
// Run: pnpm build:openapi. A test fails if the committed openapi.yaml is stale.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGenerator } from 'ts-json-schema-generator';
import { stringify } from 'yaml';
import { CONTRACT_VERSION, ERROR_HTTP_STATUS } from '../contract.ts';
import { ENDPOINTS } from '../mock/endpoints.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isIdent = (t: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(t);
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

type Ep = (typeof ENDPOINTS)[number];

export function aliasSource(): { source: string; reqName: (e: Ep) => string | undefined; resName: (e: Ep) => string | undefined } {
  const lines = ["export * from '../contract.ts';", "import type { Receipted, Page } from '../contract.ts';", "import type * as C from '../contract.ts';"];
  const qualify = (expr: string) => expr.replace(/\b([A-Z][A-Za-z0-9]*)\b/g, (m) => (m === 'Receipted' || m === 'Page' ? m : `C.${m}`));
  const reqName = (e: Ep) => (e.req ? (isIdent(e.req) ? e.req : `${cap(e.id)}Request`) : undefined);
  const resName = (e: Ep) => (e.res ? (isIdent(e.res) ? e.res : `${cap(e.id)}Response`) : undefined);
  for (const e of ENDPOINTS) {
    if (e.req && !isIdent(e.req)) lines.push(`export type ${reqName(e)} = ${qualify(e.req)};`);
    if (e.res && !isIdent(e.res)) lines.push(`export type ${resName(e)} = ${qualify(e.res)};`);
  }
  return { source: lines.join('\n') + '\n', reqName, resName };
}

export function generateSchemas(): Record<string, unknown> {
  const { source } = aliasSource();
  mkdirSync(join(root, '.tmp'), { recursive: true });
  const file = join(root, '.tmp', 'aliases.ts');
  writeFileSync(file, source);
  // Generic exports (Page<T>, Receipted<T>, SignedReading<T>) cannot be roots; they are instantiated through the aliases above.
  const decl = [...(readFileSync(join(root, 'contract.ts'), 'utf8') + source).matchAll(/export (?:interface|type) (\w+)(<)?/g)];
  const names = [...new Set(decl.filter((m) => !m[2]).map((m) => m[1]!))];
  const gen = createGenerator({ path: file, tsconfig: join(root, 'tsconfig.json'), expose: "export", topRef: true, additionalProperties: false });
  const defs: Record<string, unknown> = {};
  for (const n of names) Object.assign(defs, gen.createSchema(n).definitions ?? {});
  const sorted = Object.fromEntries(Object.entries(defs).sort(([a], [b]) => a.localeCompare(b)));
  let text = JSON.stringify(sorted).replaceAll('#/definitions/', '#/components/schemas/');
  // Generic instantiations such as Receipted<FarmerPrivate> are not legal OpenAPI component names: Receipted_FarmerPrivate.
  for (const key of Object.keys(sorted).filter((k) => /[<>,\s]/.test(k))) {
    const safe = key.replace(/[<>,\s]+/g, '_').replace(/_$/, '');
    text = text.replaceAll(encodeURIComponent(key), safe).replaceAll(key, safe);
  }
  return JSON.parse(text);
}

export function buildOpenApi(): Record<string, unknown> {
  const schemas = generateSchemas();
  const { reqName, resName } = aliasSource();
  const ref = (n: string) => ({ $ref: `#/components/schemas/${n}` });
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of ENDPOINTS) {
    const params: unknown[] = [];
    for (const m of e.path.matchAll(/\{(\w+)\}/g)) {
      const name = m[1]!;
      params.push({ name, in: 'path', required: true, schema: name === 'channel' ? ref('Channel') : name === 'number' ? { type: 'integer', minimum: 0 } : { type: 'string' } });
    }
    for (const q of e.query ?? []) params.push({ name: q, in: 'query', required: false, schema: q === 'limit' ? { type: 'integer', minimum: 1, maximum: 200 } : q === 'minQtl' ? { type: 'number' } : { type: 'string' } });
    const ok = e.status ?? 200;
    const headers = { 'X-Ledger-Mode': { $ref: '#/components/headers/XLedgerMode' } };
    const okContent = e.content === 'application/pdf'
      ? { 'application/pdf': { schema: { type: 'string', format: 'binary' } } }
      : e.content === 'text/event-stream'
        ? { 'text/event-stream': { schema: { type: 'string', description: 'Each `data:` line is a JSON StreamEvent.' }, example: 'data: {"event":"LotGraded"}' } }
        : resName(e) ? { 'application/json': { schema: ref(resName(e)!) } } : undefined;
    const isPublic = e.roles.includes('public');
    const writes = e.method !== 'GET';
    const codes = new Set<string>(e.errors ?? []);
    if (!isPublic) codes.add('ERR_UNAUTHENTICATED'), codes.add('ERR_FORBIDDEN_ROLE');
    if (writes) codes.add('ERR_LEDGER_UNAVAILABLE');
    const byStatus = new Map<number, string[]>();
    for (const c of [...codes].sort()) { const st = ERROR_HTTP_STATUS[c as keyof typeof ERROR_HTTP_STATUS]; byStatus.set(st, [...(byStatus.get(st) ?? []), c]); }
    const responses: Record<string, unknown> = { [String(ok)]: { description: 'Success', headers, ...(okContent ? { content: okContent } : {}) } };
    for (const [st, list] of [...byStatus.entries()].sort((a, b) => a[0] - b[0])) {
      responses[String(st)] = { description: list.join(' | '), headers, content: { 'application/json': { schema: ref('ApiError') } } };
    }
    const op: Record<string, unknown> = {
      operationId: e.id, tags: [e.tag], summary: e.summary,
      description: `Roles: ${e.roles.join(', ')}.${writes ? ' Every successful write returns a LedgerReceipt plus the resource.' : ''}`,
      'x-roles': e.roles,
      ...(isPublic ? { security: [] } : {}),
      ...(params.length ? { parameters: params } : {}),
      ...(e.req ? { requestBody: { required: true, content: { 'application/json': { schema: ref(reqName(e)!) } } } } : {}),
      responses,
    };
    (paths[e.path] ??= {})[e.method.toLowerCase()] = op;
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'FPO-SETU Gateway API', version: CONTRACT_VERSION,
      description: 'Generated by shared/scripts/build-openapi.ts from shared/mock/endpoints.mjs and shared/contract.ts. Do not edit by hand. Academic prototype, RD61003, CRDIST, IIT Kharagpur, Group 7.',
    },
    servers: [{ url: 'http://localhost:8080', description: 'Local gateway' }, { url: 'http://localhost:4010', description: 'Mock server (development only)' }],
    tags: [...new Set(ENDPOINTS.map((e) => e.tag))].map((name) => ({ name })),
    security: [{ bearerAuth: [] }],
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Claims: {sub, username, role, org, displayName, portal}' } },
      headers: { XLedgerMode: { description: 'live, or index-only when served by the read-only fallback API.', schema: { type: 'string', enum: ['live', 'index-only'] } } },
      schemas,
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = stringify(buildOpenApi(), { lineWidth: 0 });
  writeFileSync(join(root, 'openapi.yaml'), out);
  console.log(`openapi.yaml written (${out.length} bytes, contract ${CONTRACT_VERSION})`);
  void readFileSync;
}
