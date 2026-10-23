import { PageQuery, paginated, User } from '@flowboard/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { listUsers } from './service.ts';

export const identityRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/me', { schema: { tags: ['identity'], response: { 200: User } } }, (request) => request.user);

  app.get(
    '/users',
    {
      schema: {
        tags: ['identity'],
        querystring: PageQuery,
        response: { 200: paginated(User) },
      },
    },
    (request) => listUsers(app.db, request.query),
  );
};
