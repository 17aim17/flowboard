import {
  type CreateTaskBody,
  type FieldDefinition,
  type ListTasksQuery,
  type MoveTaskBody,
  type ResolvedStatus,
  type Task,
  type TaskSort,
  type UpdateTaskBody,
  type ValidationIssue,
  validateCustomFields,
} from '@flowboard/contracts';
import { sql } from 'kysely';
import { z } from 'zod';
import type { Db } from '../../db/db.ts';
import type { ContainerRow, TaskRow } from '../../db/types.ts';
import { conflict, notFound, validationFailed } from '../../lib/errors.ts';
import { decodeCursor, toPage } from '../../lib/pagination.ts';
import { placeAmong, type Placement } from '../../lib/position.ts';
import { resolveFieldsForPath } from '../fields/service.ts';
import { getListPath, lockPath } from '../hierarchy/paths.ts';
import { resolveForPath } from '../statuses/service.ts';

// ---------- reading ----------

function toTask(row: TaskRow, assigneeIds: string[], fields: FieldDefinition[]): Task {
  const known = new Set(fields.map((f) => f.key));
  return {
    id: row.id,
    listId: row.list_id,
    title: row.title,
    description: row.description,
    statusKey: row.status_key,
    priority: row.priority,
    assigneeIds,
    dueDate: row.due_date?.toISOString() ?? null,
    // Values of deleted fields, or fields of a list the task moved away from, stay stored but hidden.
    customFields: Object.fromEntries(Object.entries(row.custom_fields).filter(([key]) => known.has(key))),
    position: row.position,
    version: row.version,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function assigneesOf(db: Db, taskIds: string[]): Promise<Map<string, string[]>> {
  if (taskIds.length === 0) return new Map();
  const rows = await db
    .selectFrom('task_assignees')
    .select(['task_id', 'user_id'])
    .where('task_id', 'in', taskIds)
    .orderBy('user_id')
    .execute();
  const byTask = new Map<string, string[]>();
  for (const row of rows) byTask.set(row.task_id, [...(byTask.get(row.task_id) ?? []), row.user_id]);
  return byTask;
}

async function toTasks(db: Db, rows: TaskRow[], fields: FieldDefinition[]): Promise<Task[]> {
  const assignees = await assigneesOf(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((row) => toTask(row, assignees.get(row.id) ?? [], fields));
}

/**
 * Sort orders for the list endpoint. Each sorts by one value, then id, and pages with a keyset
 * cursor holding the last row's [value, id]. Tasks without a due date sort last.
 */
const sortValue = {
  position: {
    column: sql`position`,
    param: (v: string) => sql`${v} COLLATE "C"`,
    of: (r: TaskRow) => r.position,
  },
  dueDate: {
    column: sql`coalesce(due_date, 'infinity'::timestamptz)`,
    param: (v: string) => sql`${v}::timestamptz`,
    of: (r: TaskRow) => r.due_date?.toISOString() ?? 'infinity',
  },
  priority: {
    column: sql`priority`,
    param: (v: string) => sql`${v}::task_priority`,
    of: (r: TaskRow) => r.priority,
  },
} satisfies Record<TaskSort, unknown>;

const TaskCursor = z.tuple([z.string(), z.uuid()]);

export async function listTasks(db: Db, listId: string, query: ListTasksQuery) {
  const path = await getListPath(db, listId);
  const sort = sortValue[query.sort];
  let select = db
    .selectFrom('tasks')
    .selectAll()
    .where('list_id', '=', listId)
    .orderBy(sort.column)
    .orderBy('id')
    .limit(query.limit + 1);
  if (query.statusKey) select = select.where('status_key', '=', query.statusKey);
  if (query.cursor) {
    const [value, id] = decodeCursor(query.cursor, TaskCursor);
    select = select.where(sql<boolean>`(${sort.column}, id) > (${sort.param(value)}, ${id})`);
  }
  const { data, page } = toPage(await select.execute(), query.limit, (row) => [sort.of(row), row.id]);
  return { data: await toTasks(db, data, await resolveFieldsForPath(db, path)), page };
}

export async function getTask(db: Db, taskId: string): Promise<Task> {
  const row = await getTaskRow(db, taskId);
  const path = await getListPath(db, row.list_id);
  return (await toTasks(db, [row], await resolveFieldsForPath(db, path)))[0]!;
}

/** The list a task is in, for permission checks. 404 if the task doesn't exist. */
export async function getTaskListId(db: Db, taskId: string): Promise<string> {
  return (await getTaskRow(db, taskId)).list_id;
}

async function getTaskRow(db: Db, taskId: string): Promise<TaskRow> {
  const row = await db.selectFrom('tasks').selectAll().where('id', '=', taskId).executeTakeFirst();
  if (!row) throw notFound('Task');
  return row;
}

// ---------- writing ----------

/** What a task write is validated against: the list's merged statuses and fields, read under lock. */
type ListConfig = { path: ContainerRow[]; statuses: ResolvedStatus[]; fields: FieldDefinition[] };

async function loadConfig(tx: Db, path: ContainerRow[]): Promise<ListConfig> {
  return { path, statuses: await resolveForPath(tx, path), fields: await resolveFieldsForPath(tx, path) };
}

const unknownStatus = (key: string): ValidationIssue => ({
  path: 'statusKey',
  code: 'unknown_status',
  message: `"${key}" isn't a status of this list`,
});

async function unknownAssignees(tx: Db, ids: string[]): Promise<ValidationIssue[]> {
  if (ids.length === 0) return [];
  const found = new Set(
    (await tx.selectFrom('users').select('id').where('id', 'in', ids).execute()).map((u) => u.id),
  );
  const missing = ids.filter((id) => !found.has(id));
  return missing.length > 0
    ? [{ path: 'assigneeIds', code: 'unknown_user', message: `Unknown users: ${missing.join(', ')}` }]
    : [];
}

const toDate = (iso: string | null) => (iso ? new Date(iso) : null);

function throwIfInvalid(issues: ValidationIssue[]) {
  if (issues.length > 0) throw validationFailed(issues, 'Invalid task');
}

/** Tasks in one board column, in order, optionally leaving out the task being placed. */
function columnSiblings(tx: Db, listId: string, statusKey: string, excludeId?: string) {
  let query = tx
    .selectFrom('tasks')
    .select(['id', 'position'])
    .where('list_id', '=', listId)
    .where('status_key', '=', statusKey)
    .orderBy('position')
    .orderBy('id');
  if (excludeId) query = query.where('id', '!=', excludeId);
  return query.execute();
}

async function placeInColumn(
  tx: Db,
  listId: string,
  statusKey: string,
  placement: Placement,
  excludeId?: string,
) {
  return placeAmong(await columnSiblings(tx, listId, statusKey, excludeId), placement);
}

async function setAssignees(tx: Db, taskId: string, userIds: string[]) {
  await tx.deleteFrom('task_assignees').where('task_id', '=', taskId).execute();
  if (userIds.length > 0) {
    await tx
      .insertInto('task_assignees')
      .values(userIds.map((user_id) => ({ task_id: taskId, user_id })))
      .execute();
  }
}

export function createTask(db: Db, userId: string, listId: string, body: CreateTaskBody): Promise<Task> {
  return db.transaction().execute(async (tx) => {
    const path = await getListPath(tx, listId);
    await lockPath(tx, path); // config changes on this branch wait until we commit
    const config = await loadConfig(tx, path);

    const { values, issues } = validateCustomFields(config.fields, body.customFields, 'create');
    if (!config.statuses.some((s) => s.key === body.statusKey)) issues.unshift(unknownStatus(body.statusKey));
    issues.push(...(await unknownAssignees(tx, body.assigneeIds)));
    throwIfInvalid(issues);

    const row = await tx
      .insertInto('tasks')
      .values({
        list_id: listId,
        title: body.title,
        description: body.description,
        status_key: body.statusKey,
        priority: body.priority,
        due_date: toDate(body.dueDate),
        custom_fields: JSON.stringify(values),
        position: await placeInColumn(tx, listId, body.statusKey, body),
        created_by: userId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await setAssignees(tx, row.id, body.assigneeIds);
    return toTask(row, body.assigneeIds, config.fields);
  });
}

/**
 * Locks the task's list (and any other lists given), then re-reads the task and checks the version
 * the client sent. Locking first means no other write to these lists can slip in between.
 */
async function lockTask(tx: Db, taskId: string, version: number, otherListIds: string[] = []) {
  const before = await getTaskRow(tx, taskId);
  const listIds = [...new Set([before.list_id, ...otherListIds])].sort(); // same order everywhere: no deadlocks
  const paths = new Map<string, ContainerRow[]>();
  for (const id of listIds) {
    const path = await getListPath(tx, id);
    await lockPath(tx, path);
    paths.set(id, path);
  }
  const row = await getTaskRow(tx, taskId);
  if (row.version !== version) {
    throw conflict(
      'VERSION_CONFLICT',
      'Someone changed this task since you loaded it. Reload and try again.',
      [{ currentVersion: row.version }],
    );
  }
  return { row, pathOf: (listId: string) => paths.get(listId) ?? getListPath(tx, listId) };
}

export function updateTask(db: Db, taskId: string, body: UpdateTaskBody): Promise<Task> {
  return db.transaction().execute(async (tx) => {
    const { row, pathOf } = await lockTask(tx, taskId, body.version);
    const config = await loadConfig(tx, await pathOf(row.list_id));

    const { values, issues } = validateCustomFields(
      config.fields,
      body.customFields ?? {},
      'update',
      row.custom_fields,
    );
    if (body.assigneeIds) issues.push(...(await unknownAssignees(tx, body.assigneeIds)));
    throwIfInvalid(issues);

    const updated = await tx
      .updateTable('tasks')
      .set({
        title: body.title ?? row.title,
        description: body.description ?? row.description,
        priority: body.priority ?? row.priority,
        due_date: body.dueDate === undefined ? row.due_date : toDate(body.dueDate),
        custom_fields: JSON.stringify(values),
        version: row.version + 1,
        updated_at: new Date(),
      })
      .where('id', '=', taskId)
      .returningAll()
      .executeTakeFirstOrThrow();
    if (body.assigneeIds) await setAssignees(tx, taskId, body.assigneeIds);
    return (await toTasks(tx, [updated], config.fields))[0]!;
  });
}

/**
 * Status for a task moving to another list (decision D-10): the client's explicit choice, else the
 * same key with the same category, else the first status of the same category. Undefined: no match.
 */
export function mapStatus(current: ResolvedStatus | undefined, destination: ResolvedStatus[]) {
  if (!current) return undefined;
  return (
    destination.find((s) => s.key === current.key && s.category === current.category) ??
    destination.find((s) => s.category === current.category)
  );
}

export function moveTask(db: Db, taskId: string, body: MoveTaskBody): Promise<Task> {
  return db.transaction().execute(async (tx) => {
    const { row, pathOf } = await lockTask(tx, taskId, body.version, body.listId ? [body.listId] : []);
    const destinationId = body.listId ?? row.list_id;
    const crossList = destinationId !== row.list_id;
    const destination = await loadConfig(tx, await pathOf(destinationId));

    let statusKey = row.status_key;
    if (body.statusKey) {
      if (!destination.statuses.some((s) => s.key === body.statusKey))
        throwIfInvalid([unknownStatus(body.statusKey)]);
      statusKey = body.statusKey;
    } else if (crossList) {
      const current = (await resolveForPath(tx, await pathOf(row.list_id))).find(
        (s) => s.key === row.status_key,
      );
      const match = mapStatus(current, destination.statuses);
      if (!match) {
        throw conflict(
          'STATUS_UNMAPPABLE',
          `"${destination.path.at(-1)!.name}" has no ${current?.category ?? ''} status. Choose one with statusKey.`,
          destination.statuses.map((s) => ({ key: s.key, name: s.name, category: s.category })),
        );
      }
      statusKey = match.key;
    }

    const mode = crossList ? 'move' : 'update';
    const { values, issues } = validateCustomFields(
      destination.fields,
      body.customFields ?? {},
      mode,
      row.custom_fields,
    );
    throwIfInvalid(issues);

    const updated = await tx
      .updateTable('tasks')
      .set({
        list_id: destinationId,
        status_key: statusKey,
        position: await placeInColumn(tx, destinationId, statusKey, body, taskId),
        custom_fields: JSON.stringify(values),
        version: row.version + 1,
        updated_at: new Date(),
      })
      .where('id', '=', taskId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return (await toTasks(tx, [updated], destination.fields))[0]!;
  });
}

export async function deleteTask(db: Db, taskId: string): Promise<void> {
  const { numDeletedRows } = await db.deleteFrom('tasks').where('id', '=', taskId).executeTakeFirst();
  if (numDeletedRows === 0n) throw notFound('Task');
}
