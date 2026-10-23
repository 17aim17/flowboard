import { ContainerFields, CreateFieldBody, FieldDefinition, Id, UpdateFieldBody } from '@flowboard/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { assertAdmin } from '../permissions/service.ts';
import {
  createField,
  deleteField,
  getContainerFields,
  getResolvedFieldsForList,
  updateField,
} from './service.ts';

const Params = z.object({ id: Id });
const schema = { tags: ['custom fields'] };

export const fieldRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/containers/:id/fields',
    { schema: { ...schema, params: Params, response: { 200: ContainerFields } } },
    (request) => getContainerFields(app.db, request.params.id),
  );

  app.post(
    '/containers/:id/fields',
    { schema: { ...schema, params: Params, body: CreateFieldBody, response: { 201: FieldDefinition } } },
    async (request, reply) => {
      assertAdmin(request.user);
      return reply.status(201).send(await createField(app.db, request.params.id, request.body));
    },
  );

  app.patch(
    '/fields/:id',
    { schema: { ...schema, params: Params, body: UpdateFieldBody, response: { 200: FieldDefinition } } },
    (request) => {
      assertAdmin(request.user);
      return updateField(app.db, request.params.id, request.body);
    },
  );

  app.delete('/fields/:id', { schema: { ...schema, params: Params } }, async (request, reply) => {
    assertAdmin(request.user);
    await deleteField(app.db, request.params.id);
    return reply.status(204).send();
  });

  app.get(
    '/lists/:id/resolved-fields',
    {
      schema: { ...schema, params: Params, response: { 200: z.object({ data: z.array(FieldDefinition) }) } },
    },
    async (request) => ({ data: await getResolvedFieldsForList(app.db, request.params.id) }),
  );
};
