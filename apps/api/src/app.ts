import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyServerOptions } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { Db } from './db/db.ts';
import { fieldRoutes } from './modules/fields/routes.ts';
import { hierarchyRoutes } from './modules/hierarchy/routes.ts';
import { identityRoutes } from './modules/identity/routes.ts';
import { statusRoutes } from './modules/statuses/routes.ts';
import { registerAuth } from './plugins/auth.ts';
import { registerErrorHandler } from './plugins/errors.ts';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}

export async function buildApp({ db, logger }: { db: Db; logger: FastifyServerOptions['logger'] }) {
  const app = Fastify({
    logger,
    // Reuse a request id set by a proxy, otherwise make one. It is echoed back and included in every log line.
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('db', db);
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });
  registerErrorHandler(app);

  await app.register(swagger, {
    openapi: {
      info: { title: 'Flowboard API', version: '1.0.0' },
      components: { securitySchemes: { userId: { type: 'apiKey', in: 'header', name: 'X-User-Id' } } },
      security: [{ userId: [] }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.get('/health', { schema: { hide: true } }, () => ({ status: 'ok' }));
  app.get('/ready', { schema: { hide: true } }, async (_request, reply) => {
    try {
      await sql`select 1`.execute(db);
      return { status: 'ok' };
    } catch {
      return reply.status(503).send({ error: { code: 'NOT_READY', message: 'Database is unreachable' } });
    }
  });

  await app.register(
    async (v1) => {
      registerAuth(v1);
      await v1.register(identityRoutes);
      await v1.register(hierarchyRoutes);
      await v1.register(statusRoutes);
      await v1.register(fieldRoutes);
    },
    { prefix: '/v1' },
  );

  return app;
}
