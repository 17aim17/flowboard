import {
  CreateTaskBody,
  Id,
  ListTasksQuery,
  MoveTaskBody,
  paginated,
  Task,
  UpdateTaskBody,
  type User,
} from '@flowboard/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { assertCanView } from '../permissions/service.ts';
import {
  createTask,
  deleteTask,
  getTask,
  getTaskListId,
  listTasks,
  moveTask,
  updateTask,
} from './service.ts';

const Params = z.object({ id: Id });
const schema = { tags: ['tasks'] };

// Members read and write tasks in any list they can see (docs/DESIGN.md section 8).

export const taskRoutes: FastifyPluginAsyncZod = async (app) => {
  const assertCanViewTask = async (user: User, taskId: string) =>
    assertCanView(app.db, user, await getTaskListId(app.db, taskId));

  app.get(
    '/lists/:id/tasks',
    {
      schema: { ...schema, params: Params, querystring: ListTasksQuery, response: { 200: paginated(Task) } },
    },
    async (request) => {
      await assertCanView(app.db, request.user, request.params.id);
      return listTasks(app.db, request.params.id, request.query);
    },
  );

  app.post(
    '/lists/:id/tasks',
    { schema: { ...schema, params: Params, body: CreateTaskBody, response: { 201: Task } } },
    async (request, reply) => {
      await assertCanView(app.db, request.user, request.params.id);
      return reply
        .status(201)
        .send(await createTask(app.db, request.user.id, request.params.id, request.body));
    },
  );

  app.get(
    '/tasks/:id',
    { schema: { ...schema, params: Params, response: { 200: Task } } },
    async (request) => {
      await assertCanViewTask(request.user, request.params.id);
      return getTask(app.db, request.params.id);
    },
  );

  app.patch(
    '/tasks/:id',
    { schema: { ...schema, params: Params, body: UpdateTaskBody, response: { 200: Task } } },
    async (request) => {
      await assertCanViewTask(request.user, request.params.id);
      return updateTask(app.db, request.params.id, request.body);
    },
  );

  app.post(
    '/tasks/:id/move',
    { schema: { ...schema, params: Params, body: MoveTaskBody, response: { 200: Task } } },
    async (request) => {
      await assertCanViewTask(request.user, request.params.id);
      if (request.body.listId) await assertCanView(app.db, request.user, request.body.listId);
      return moveTask(app.db, request.params.id, request.body);
    },
  );

  app.delete('/tasks/:id', { schema: { ...schema, params: Params } }, async (request, reply) => {
    await assertCanViewTask(request.user, request.params.id);
    await deleteTask(app.db, request.params.id);
    return reply.status(204).send();
  });
};
