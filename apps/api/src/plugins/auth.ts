import type { User } from '@flowboard/contracts';
import type { FastifyInstance } from 'fastify';
import { unauthenticated } from '../lib/errors.ts';
import { findUserByHandle } from '../modules/identity/service.ts';

declare module 'fastify' {
  interface FastifyRequest {
    /** The caller, resolved from the database. Set on every /v1 request; never taken from the body. */
    user: User;
  }
}

/**
 * Mock identity: the X-User-Id header names a seeded user (alice, bob, carol). The role comes from
 * the users table. To move to real login, replace this hook with one that verifies an OIDC token
 * and maps its subject to a user row; nothing downstream changes.
 */
export function registerAuth(app: FastifyInstance): void {
  app.decorateRequest('user', null as unknown as User);
  app.addHook('onRequest', async (request, reply) => {
    const handle = request.headers['x-user-id'];
    if (typeof handle !== 'string' || handle === '') {
      throw unauthenticated('Send an X-User-Id header: alice, bob or carol');
    }
    const user = await findUserByHandle(app.db, handle);
    if (!user) throw unauthenticated(`Unknown user "${handle}"`);
    request.user = user;
    request.log = reply.log = request.log.child({ userId: user.handle });
  });
}
