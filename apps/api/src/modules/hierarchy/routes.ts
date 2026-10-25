import {
  Container,
  CreateContainerBody,
  Id,
  MoveContainerBody,
  UpdateContainerBody,
} from '@flowboard/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { adminOnly, assertCanView, filterVisible, loadGrants } from '../permissions/service.ts';
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
  // A flat list in sibling order, only what the caller can see; the client nests it by parentId.
  app.get(
    '/tree',
    { schema: { ...schema, response: { 200: z.object({ data: z.array(Container) }) } } },
    async (request) => {
      const [rows, grants] = await Promise.all([
        listActiveContainers(app.db),
        loadGrants(app.db, request.user.id),
      ]);
      return { data: filterVisible(request.user, rows, grants).map(toContainer) };
    },
  );

  app.post(
    '/containers',
    {
      preValidation: adminOnly,
      schema: { ...schema, body: CreateContainerBody, response: { 201: Container } },
    },
    async (request, reply) => {
      return reply.status(201).send(await createContainer(app.db, request.body));
    },
  );

  app.get(
    '/containers/:id',
    { schema: { ...schema, params: Params, response: { 200: Container } } },
    async (request) => {
      await assertCanView(app.db, request.user, request.params.id);
      return getContainer(app.db, request.params.id);
    },
  );

  app.patch(
    '/containers/:id',
    {
      preValidation: adminOnly,
      schema: { ...schema, params: Params, body: UpdateContainerBody, response: { 200: Container } },
    },
    (request) => updateContainer(app.db, request.params.id, request.body),
  );

  app.delete(
    '/containers/:id',
    { preValidation: adminOnly, schema: { ...schema, params: Params } },
    async (request, reply) => {
      await archiveContainer(app.db, request.params.id);
      return reply.status(204).send();
    },
  );

  app.post(
    '/containers/:id/move',
    {
      preValidation: adminOnly,
      schema: { ...schema, params: Params, body: MoveContainerBody, response: { 200: Container } },
    },
    (request) => moveContainer(app.db, request.params.id, request.body),
  );
};
