import {
  Container,
  CreateContainerBody,
  Id,
  MoveContainerBody,
  UpdateContainerBody,
} from '@flowboard/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { assertAdmin } from '../permissions/service.ts';
import {
  archiveContainer,
  createContainer,
  getContainer,
  listActiveContainers,
  moveContainer,
  toContainer,
  updateContainer,
} from './service.ts';

const Params = z.object({ id: Id });
const schema = { tags: ['hierarchy'] };

export const hierarchyRoutes: FastifyPluginAsyncZod = async (app) => {
  // A flat list in sibling order; the client nests it by parentId.
  app.get(
    '/tree',
    { schema: { ...schema, response: { 200: z.object({ data: z.array(Container) }) } } },
    async () => ({ data: (await listActiveContainers(app.db)).map(toContainer) }),
  );

  app.post(
    '/containers',
    { schema: { ...schema, body: CreateContainerBody, response: { 201: Container } } },
    async (request, reply) => {
      assertAdmin(request.user);
      return reply.status(201).send(await createContainer(app.db, request.body));
    },
  );

  app.get(
    '/containers/:id',
    { schema: { ...schema, params: Params, response: { 200: Container } } },
    (request) => getContainer(app.db, request.params.id),
  );

  app.patch(
    '/containers/:id',
    { schema: { ...schema, params: Params, body: UpdateContainerBody, response: { 200: Container } } },
    (request) => {
      assertAdmin(request.user);
      return updateContainer(app.db, request.params.id, request.body);
    },
  );

  app.delete('/containers/:id', { schema: { ...schema, params: Params } }, async (request, reply) => {
    assertAdmin(request.user);
    await archiveContainer(app.db, request.params.id);
    return reply.status(204).send();
  });

  app.post(
    '/containers/:id/move',
    { schema: { ...schema, params: Params, body: MoveContainerBody, response: { 200: Container } } },
    (request) => {
      assertAdmin(request.user);
      return moveContainer(app.db, request.params.id, request.body);
    },
  );
};
