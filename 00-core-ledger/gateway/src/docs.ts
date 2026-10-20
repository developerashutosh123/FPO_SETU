// OpenAPI: the contract's openapi.yaml, served as the API documentation at /docs. The read-only API does not serve it.
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';

export async function registerDocs(app: FastifyInstance): Promise<void> {
  await app.register(swagger, { mode: 'static', specification: { path: fileURLToPath(new URL('./contract/openapi.yaml', import.meta.url)), baseDir: fileURLToPath(new URL('./contract/', import.meta.url)) } });
  await app.register(swaggerUi, { routePrefix: '/docs' });
}
