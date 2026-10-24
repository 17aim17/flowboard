import {
  CreateTaskBody,
  Id,
  ListTasksQuery,
  MoveTaskBody,
  paginated,
  Task,
  UpdateTaskBody,
} from '@flowboard/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createTask, deleteTask, getTask, listTasks, moveTask, updateTask } from './service.ts';

const Params = z.object({ id: Id });
const schema = { tags: ['tasks'] };

export const taskRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/lists/:id/tasks',
    {
      schema: { ...schema, params: Params, querystring: ListTasksQuery, response: { 200: paginated(Task) } },
    },
    (request) => listTasks(app.db, request.params.id, request.query),
  );

  app.post(
    '/lists/:id/tasks',
    { schema: { ...schema, params: Params, body: CreateTaskBody, response: { 201: Task } } },
    async (request, reply) =>
      reply.status(201).send(await createTask(app.db, request.user.id, request.params.id, request.body)),
  );

  app.get('/tasks/:id', { schema: { ...schema, params: Params, response: { 200: Task } } }, (request) =>
    getTask(app.db, request.params.id),
  );

  app.patch(
    '/tasks/:id',
    { schema: { ...schema, params: Params, body: UpdateTaskBody, response: { 200: Task } } },
    (request) => updateTask(app.db, request.params.id, request.body),
  );

  app.post(
    '/tasks/:id/move',
    { schema: { ...schema, params: Params, body: MoveTaskBody, response: { 200: Task } } },
    (request) => moveTask(app.db, request.params.id, request.body),
  );

  app.delete('/tasks/:id', { schema: { ...schema, params: Params } }, async (request, reply) => {
    await deleteTask(app.db, request.params.id);
    return reply.status(204).send();
  });
};
