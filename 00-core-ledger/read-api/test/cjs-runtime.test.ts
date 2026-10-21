// Vercel's Node 22 Lambda has no require(esm). fastify.inject() loads light-my-request, which require()s `cookie`; cookie 2.x is ESM-only,
// so every request was a 500 (ERR_REQUIRE_ESM) on Vercel while it worked locally (Node 22.12+ can require ESM). This runs inject in a
// child Node with require(esm) switched off, so the same failure shows up here. Fix: pnpm override cookie 1.1.1 (pnpm-workspace.yaml).
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const script = `
const Fastify = require('fastify');
(async () => {
  const app = Fastify();
  app.get('/x', async (req, rep) => { rep.header('set-cookie', 'a=1; Path=/; HttpOnly'); return { cookie: req.headers.cookie ?? null }; });
  await app.ready();
  const r = await app.inject({ method: 'GET', url: '/x', cookies: { sid: 'abc', theme: 'dark' } });
  console.log(JSON.stringify({ status: r.statusCode, body: r.json(), setCookie: r.cookies }));
})().catch((e) => { console.error(e.code, e.message); process.exit(1); });
`;

describe('runtime without require(esm) (as on Vercel)', () => {
  it('fastify.inject works, including request cookies and parsed Set-Cookie', () => {
    const r = spawnSync(process.execPath, ['--no-experimental-require-module', '-e', script], { cwd: join(__dirname, '..'), encoding: 'utf8' });
    expect(r.stderr, r.stderr).not.toMatch(/ERR_REQUIRE_ESM/);
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ status: 200, body: { cookie: 'sid=abc; theme=dark' }, setCookie: [{ name: 'a', value: '1', path: '/', httpOnly: true }] });
  });
});
