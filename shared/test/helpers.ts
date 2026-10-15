import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { createRequire } from 'node:module';
import { ENDPOINTS } from '../mock/endpoints.mjs';

export const api = parse(readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8')) as any;
const req = createRequire(import.meta.url);
const Ajv = req('ajv') as new (o: object) => any;
const addFormats = { default: req('ajv-formats') as (a: unknown) => void };
export const ajv = new Ajv({ strict: false, allErrors: true });
addFormats.default(ajv);
ajv.addSchema({ $id: 'https://setu.invalid/openapi', components: { schemas: api.components.schemas } });
export const validatorFor = (name: string) => ajv.compile({ $ref: `https://setu.invalid/openapi#/components/schemas/${name}` });
export const resName = (id: string) => { const e = ENDPOINTS.find((x) => x.id === id)!; return /^[A-Za-z_]\w*$/.test(e.res ?? '') ? e.res! : `${id[0]!.toUpperCase()}${id.slice(1)}Response`; };
