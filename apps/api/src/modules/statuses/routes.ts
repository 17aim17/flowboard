import { ContainerStatuses, Id, Key, PutStatusBody, ResolvedStatus } from '@flowboard/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { assertAdmin, assertCanView } from '../permissions/service.ts';
import { deleteStatus, getContainerStatuses, getResolvedStatusesForList, putStatus } from './service.ts';

const Params = z.object({ id: Id });
const KeyParams = Params.extend({ key: Key });
const schema = { tags: ['statuses'] };

export const statusRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/containers/:id/statuses',
    { schema: { ...schema, params: Params, response: { 200: ContainerStatuses } } },
    async (request) => {
      await assertCanView(app.db, request.user, request.params.id);
      return getContainerStatuses(app.db, request.params.id);
    },
  );

  app.put(
    '/containers/:id/statuses/:key',
    { schema: { ...schema, params: KeyParams, body: PutStatusBody, response: { 200: ContainerStatuses } } },
    (request) => {
      assertAdmin(request.user);
      return putStatus(app.db, request.params.id, request.params.key, request.body);
    },
  );

  app.delete(
    '/containers/:id/statuses/:key',
    { schema: { ...schema, params: KeyParams, response: { 200: ContainerStatuses } } },
    (request) => {
      assertAdmin(request.user);
      return deleteStatus(app.db, request.params.id, request.params.key);
    },
  );

  app.get(
    '/lists/:id/resolved-statuses',
    { schema: { ...schema, params: Params, response: { 200: z.object({ data: z.array(ResolvedStatus) }) } } },
    async (request) => {
      await assertCanView(app.db, request.user, request.params.id);
      return { data: await getResolvedStatusesForList(app.db, request.params.id) };
    },
  );
};
