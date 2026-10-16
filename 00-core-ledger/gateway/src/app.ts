import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { fileURLToPath } from 'node:url';
import { ENDPOINTS } from './contract/endpoints.mjs';
import type { Ctx } from './context.js';
import { HttpError } from './errors.js';
import { verifySession } from './auth/jwt.js';
import type { Handler, Reply } from './routes/helpers.js';
import { systemRoutes } from './routes/system.js';
import { sseRoute } from './routes/events.js';

export interface AppOptions { ctx: Ctx; extraHandlers?: (ctx: Ctx) => Partial<Record<string, Handler>>[]; rateLimitMax?: number; logger?: boolean | object }

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const { ctx } = opts;
  const app = Fastify({ logger: opts.logger ?? { level: ctx.cfg.LOG_LEVEL }, trustProxy: true, bodyLimit: 1_048_576, disableRequestLogging: false });
  app.decorate('ctx', ctx);
  app.decorateRequest('user', undefined);
  app.decorateRequest('startedAt', 0);

  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } });
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || ctx.cfg.corsOrigins.includes(origin)),
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'], allowedHeaders: ['authorization', 'content-type', 'last-event-id'], exposedHeaders: ['X-Ledger-Mode'], maxAge: 600,
  });
  await app.register(rateLimit, { max: opts.rateLimitMax ?? 600, timeWindow: '1 minute' });

  // OpenAPI: the contract's openapi.yaml, served as the API documentation
  await app.register(swagger, { mode: 'static', specification: { path: fileURLToPath(new URL('./contract/openapi.yaml', import.meta.url)), baseDir: fileURLToPath(new URL('./contract/', import.meta.url)) } });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  // portals may send Content-Type: application/json with an empty body on action endpoints (POST /loans/:id/disburse): treat it as {}
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body || (typeof body === 'string' && body.trim() === '')) return done(null, {});
    try { done(null, JSON.parse(body as string)); } catch (e) { (e as { statusCode?: number }).statusCode = 400; done(e as Error, undefined); }
  });

  app.addHook('onRequest', async (req) => {
    req.startedAt = Date.now();
    const h = req.headers.authorization;
    if (h?.toLowerCase().startsWith('bearer ')) req.user = await verifySession(ctx.cfg.JWT_SECRET, h.slice(7).trim());
  });
  app.addHook('onSend', async (_req, reply) => { reply.header('X-Ledger-Mode', 'live'); });

  app.setErrorHandler((err: Error & { statusCode?: number; code?: string; validation?: unknown }, req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send(err.toBody());
    if (err.statusCode === 429) return reply.status(429).send({ error: { code: 'ERR_VALIDATION', message: 'Too many requests. Wait a minute and try again.' } });
    if (err.statusCode && err.statusCode < 500) return reply.status(400).send({ error: { code: 'ERR_VALIDATION', message: err.message } });
    req.log.error({ err }, 'unhandled error');
    return reply.status(500).send({ error: { code: 'ERR_INVALID_STATE', message: 'The server could not complete this request. It has been logged.' } });
  });
  app.setNotFoundHandler((req, reply) => reply.status(404).send({ error: { code: 'ERR_NOT_FOUND', message: `No route ${req.method} ${req.url.split('?')[0]}. See /docs.` } }));

  // every endpoint of the contract is registered from the shared endpoint table, so roles cannot drift from the contract
  const handlers: Record<string, Handler> = {};
  for (const set of [systemRoutes(ctx), ...(opts.extraHandlers?.(ctx) ?? [])]) Object.assign(handlers, set);
  for (const e of ENDPOINTS) {
    if (e.id === 'eventsStream') continue;
    const h = handlers[e.id];
    if (!h) throw new Error(`No handler for endpoint ${e.id} (${e.method} ${e.path}). Every contract endpoint must be implemented.`);
    const url = e.path.replace(/\{(\w+)\}/g, ':$1');
    const authRoute = e.id === 'login' || e.id === 'otpRequest' || e.id === 'otpVerify';
    app.route({
      method: e.method, url, config: authRoute ? { rateLimit: { max: 30, timeWindow: '1 minute' } } : undefined,
      handler: async (req: FastifyRequest, rep: FastifyReply) => {
        if (!e.roles.includes('public')) {
          if (!req.user) throw new HttpError('ERR_UNAUTHENTICATED', 'Sign in first. Send Authorization: Bearer <token> from POST /auth/login.');
          if (!e.roles.includes('authenticated') && !e.roles.includes(req.user.role)) {
            if (e.id === 'getOrderPrice') throw new HttpError('ERR_FORBIDDEN_ORG', 'Only the FPO and the Buyer can read this price.');
            throw new HttpError('ERR_FORBIDDEN_ROLE', `Role ${req.user.role} cannot call ${e.method} ${e.path}.`);
          }
        }
        const out = await h(req);
        const r = out as Reply | undefined;
        if (r && typeof r === 'object' && 'raw' in r && r.raw) {
          for (const [k, v] of Object.entries(r.headers ?? {})) rep.header(k, v);
          return rep.status(r.status ?? e.status ?? 200).send(r.body);
        }
        return rep.status(e.status ?? 200).send(out);
      },
    });
  }
  sseRoute(app, ctx);
  return app;
}
