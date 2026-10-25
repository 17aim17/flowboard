import { ContainerFields, CreateFieldBody, FieldDefinition, Id, UpdateFieldBody } from '@flowboard/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { adminOnly, assertCanView } from '../permissions/service.ts';
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
    async (request) => {
      await assertCanView(app.db, request.user, request.params.id);
      return getContainerFields(app.db, request.params.id);
    },
  );

  app.post(
    '/containers/:id/fields',
    {
      preValidation: adminOnly,
      schema: { ...schema, params: Params, body: CreateFieldBody, response: { 201: FieldDefinition } },
    },
    async (request, reply) => {
      return reply.status(201).send(await createField(app.db, request.params.id, request.body));
    },
  );

  app.patch(
    '/fields/:id',
    {
      preValidation: adminOnly,
      schema: { ...schema, params: Params, body: UpdateFieldBody, response: { 200: FieldDefinition } },
    },
    (request) => updateField(app.db, request.params.id, request.body),
  );

  app.delete(
    '/fields/:id',
    { preValidation: adminOnly, schema: { ...schema, params: Params } },
    async (request, reply) => {
      await deleteField(app.db, request.params.id);
      return reply.status(204).send();
    },
  );

  app.get(
    '/lists/:id/resolved-fields',
    {
      schema: { ...schema, params: Params, response: { 200: z.object({ data: z.array(FieldDefinition) }) } },
    },
    async (request) => {
      await assertCanView(app.db, request.user, request.params.id);
      return { data: await getResolvedFieldsForList(app.db, request.params.id) };
    },
  );
};
