import { z } from 'zod';
import { Id, Key, PageQuery, Placement, Priority } from './common.ts';

export const Task = z.object({
  id: Id,
  listId: Id,
  title: z.string(),
  description: z.string(),
  statusKey: Key,
  priority: Priority,
  assigneeIds: z.array(Id),
  dueDate: z.iso.datetime({ offset: true }).nullable(),
  /** Only fields in the list's resolved schema; values of deleted or foreign fields are left out. */
  customFields: z.record(z.string(), z.unknown()),
  position: z.string(),
  version: z.number().int(),
  createdBy: Id,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Task = z.infer<typeof Task>;

const Title = z.string().trim().min(1).max(500);
const Description = z.string().max(20_000);
const AssigneeIds = z.array(Id).refine((ids) => new Set(ids).size === ids.length, 'Assignees repeat');
const DueDate = z.iso.datetime({ offset: true }).nullable();
const CustomFieldsInput = z.record(z.string(), z.unknown());

// Task bodies are strict: an unknown key (say statusKey on PATCH, or a typo) is a 400, not silently dropped.

/** New tasks go to the end of their column unless beforeId/afterId place them. */
export const CreateTaskBody = Placement.extend({
  title: Title,
  description: Description.default(''),
  statusKey: Key,
  priority: Priority.default('none'),
  assigneeIds: AssigneeIds.default([]),
  dueDate: DueDate.default(null),
  customFields: CustomFieldsInput.default({}),
}).strict();
export type CreateTaskBody = z.infer<typeof CreateTaskBody>;

/**
 * Edits plain fields. `version` must be the version the client last saw (409 if someone saved since).
 * customFields merge into existing values; null clears one. Status, list and position change via move.
 */
export const UpdateTaskBody = z.strictObject({
  version: z.number().int(),
  title: Title.optional(),
  description: Description.optional(),
  priority: Priority.optional(),
  assigneeIds: AssigneeIds.optional(),
  dueDate: DueDate.optional(),
  customFields: CustomFieldsInput.optional(),
});
export type UpdateTaskBody = z.infer<typeof UpdateTaskBody>;

/**
 * Everything that changes where a task sits: its column (statusKey), its order (beforeId/afterId)
 * and its list (listId). Moving lists maps the status by key or category (docs/DESIGN.md section 7);
 * customFields supplies values the new list requires.
 */
export const MoveTaskBody = Placement.extend({
  version: z.number().int(),
  listId: Id.optional(),
  statusKey: Key.optional(),
  customFields: CustomFieldsInput.optional(),
}).strict();
export type MoveTaskBody = z.infer<typeof MoveTaskBody>;

export const TaskSort = z.enum(['position', 'dueDate', 'priority']);
export type TaskSort = z.infer<typeof TaskSort>;

export const ListTasksQuery = PageQuery.extend({
  sort: TaskSort.default('position'),
  /** Load one board column at a time on very large lists. */
  statusKey: Key.optional(),
});
export type ListTasksQuery = z.infer<typeof ListTasksQuery>;
