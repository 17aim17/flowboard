import type {
  CreateFieldBody,
  FieldDefinition,
  FieldOption,
  FieldType,
  UpdateFieldBody,
} from '@flowboard/contracts';
import { randomBytes } from 'node:crypto';
import type { Db } from '../../db/db.ts';
import type { ContainerRow, FieldRow } from '../../db/types.ts';
import { conflict, invalid, notFound } from '../../lib/errors.ts';
import { placeAmong } from '../../lib/position.ts';
import { getListPath, getPath, lockPath } from '../hierarchy/paths.ts';
import { countTasksWithField, optionUsage } from '../tasks/usage.ts';

const toField = (row: FieldRow): FieldDefinition => ({
  id: row.id,
  key: row.key,
  name: row.name,
  type: row.type,
  required: row.required,
  options: row.options,
  ownerType: row.container_type,
  ownerId: row.container_id,
  position: row.position,
});

const isSelect = (type: FieldType) => type === 'single_select' || type === 'multi_select';

const withOptionIds = (options: { id?: string | undefined; label: string; color?: string | undefined }[]) =>
  options.map((option): FieldOption => ({
    ...option,
    id: option.id ?? `opt_${randomBytes(4).toString('hex')}`,
  }));

function activeFields(db: Db, containerIds: string[]) {
  return db
    .selectFrom('field_definitions')
    .selectAll()
    .where('container_id', 'in', containerIds)
    .where('archived_at', 'is', null)
    .orderBy('position')
    .execute();
}

/** A list's fields: the space's, then the folder's, then its own. Keys are unique, so nothing merges. */
export async function resolveFieldsForPath(db: Db, path: ContainerRow[]): Promise<FieldDefinition[]> {
  const rows = await activeFields(
    db,
    path.map((c) => c.id),
  );
  const depth = new Map(path.map((c, index) => [c.id, index]));
  return rows.sort((a, b) => depth.get(a.container_id)! - depth.get(b.container_id)!).map(toField);
}

export async function getResolvedFieldsForList(db: Db, listId: string) {
  return resolveFieldsForPath(db, await getListPath(db, listId));
}

export async function getContainerFields(db: Db, containerId: string) {
  const path = await getPath(db, containerId);
  const resolved = await resolveFieldsForPath(db, path);
  return { local: resolved.filter((field) => field.ownerId === containerId), resolved };
}

export async function createField(
  db: Db,
  containerId: string,
  body: CreateFieldBody,
): Promise<FieldDefinition> {
  const owner = (await getPath(db, containerId)).at(-1)!;
  if (owner.type === 'workspace') {
    throw invalid('id', 'invalid_owner', 'Custom fields belong to a space, folder or list');
  }
  const taken = await db
    .selectFrom('field_definitions')
    .select('id')
    .where('key', '=', body.key)
    .executeTakeFirst();
  if (taken) throw keyTaken(body.key);

  const siblings = await activeFields(db, [owner.id]);
  const row = await db
    .insertInto('field_definitions')
    .values({
      container_id: owner.id,
      container_type: owner.type,
      key: body.key,
      name: body.name,
      type: body.type,
      required: body.required,
      options: JSON.stringify(withOptionIds(body.options)),
      position: placeAmong(siblings, {}),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return toField(row);
}

/**
 * Edits a field. Changes that would make stored values invalid are refused while tasks use them:
 * changing the type, or removing a select option (decision D-09).
 */
export function updateField(db: Db, fieldId: string, body: UpdateFieldBody): Promise<FieldDefinition> {
  return db.transaction().execute(async (tx) => {
    const row = await getActiveField(tx, fieldId);
    await lockPath(tx, await getPath(tx, row.container_id)); // task writes under this owner wait for us

    const type = body.type ?? row.type;
    const options = body.options ? withOptionIds(body.options) : isSelect(type) ? row.options : [];
    if (isSelect(type) && options.length === 0) {
      throw invalid('options', 'required', 'Select fields need at least one option');
    }
    if (!isSelect(type) && options.length > 0)
      throw invalid('options', 'not_allowed', 'Only select fields have options');

    if (type !== row.type) {
      const taskCount = await countTasksWithField(tx, row.key);
      if (taskCount > 0) {
        throw conflict(
          'FIELD_IN_USE',
          `${taskCount} task(s) have a value for "${row.key}", so its type can't change`,
          [{ key: row.key, taskCount }],
        );
      }
    } else if (isSelect(type)) {
      const kept = new Set(options.map((o) => o.id));
      const removed = row.options.filter((o) => !kept.has(o.id)).map((o) => o.id);
      const inUse = await optionUsage(tx, row.key, removed);
      if (inUse.length > 0)
        throw conflict('FIELD_OPTION_IN_USE', 'Tasks still use the options you removed', inUse);
    }

    const updated = await tx
      .updateTable('field_definitions')
      .set({
        name: body.name ?? row.name,
        type,
        required: body.required ?? row.required,
        options: JSON.stringify(options),
        updated_at: new Date(),
      })
      .where('id', '=', fieldId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toField(updated);
  });
}

/** Soft delete. Values stay on tasks but are no longer shown, and the key stays reserved (decision D-09). */
export async function deleteField(db: Db, fieldId: string): Promise<void> {
  await getActiveField(db, fieldId);
  await db
    .updateTable('field_definitions')
    .set({ archived_at: new Date(), updated_at: new Date() })
    .where('id', '=', fieldId)
    .execute();
}

async function getActiveField(db: Db, fieldId: string): Promise<FieldRow> {
  const row = await db
    .selectFrom('field_definitions')
    .selectAll()
    .where('id', '=', fieldId)
    .where('archived_at', 'is', null)
    .executeTakeFirst();
  if (!row) throw notFound('Field');
  return row;
}

const keyTaken = (key: string) =>
  conflict(
    'FIELD_KEY_TAKEN',
    `A field with key "${key}" already exists. Keys stay reserved after a field is deleted.`,
  );
