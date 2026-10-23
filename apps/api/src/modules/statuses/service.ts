import type { PutStatusBody, StatusDefinition, ValidationIssue } from '@flowboard/contracts';
import type { Db } from '../../db/db.ts';
import type { ContainerRow, StatusRow } from '../../db/types.ts';
import { conflict, invalid, notFound, validationFailed } from '../../lib/errors.ts';
import { placeAmong } from '../../lib/position.ts';
import { getListPath, getPath, getSubtree, lockPath } from '../hierarchy/paths.ts';
import { statusUsage } from '../tasks/usage.ts';
import { mergeStatuses, missingCategories, resolveStatuses, type StatusLevel } from './resolve.ts';

const toDefinition = (row: StatusRow): StatusDefinition => ({
  id: row.id,
  containerId: row.container_id,
  key: row.key,
  name: row.name,
  category: row.category,
  color: row.color,
  position: row.position,
  hidden: row.hidden,
});

function loadRows(db: Db, containerIds: string[]): Promise<StatusRow[]> {
  return db.selectFrom('status_definitions').selectAll().where('container_id', 'in', containerIds).execute();
}

const levelsFor = (path: ContainerRow[], rows: StatusRow[]): StatusLevel[] =>
  path.map((container) => ({ container, rows: rows.filter((row) => row.container_id === container.id) }));

/** The statuses a container shows after merging its whole path. For a list: its board columns. */
export async function resolveForPath(db: Db, path: ContainerRow[]) {
  return resolveStatuses(
    levelsFor(
      path,
      await loadRows(
        db,
        path.map((c) => c.id),
      ),
    ),
  );
}

export async function getResolvedStatusesForList(db: Db, listId: string) {
  return resolveForPath(db, await getListPath(db, listId));
}

/** What the settings page shows: this container's own rows, and the merged result at this level. */
export async function getContainerStatuses(db: Db, containerId: string) {
  const path = await getPath(db, containerId);
  const rows = await loadRows(
    db,
    path.map((c) => c.id),
  );
  return {
    local: rows.filter((row) => row.container_id === containerId).map(toDefinition),
    resolved: resolveStatuses(levelsFor(path, rows)),
  };
}

/**
 * Adds, overrides or hides one status key on a container, then checks every list below still
 * has a valid board. Any problem rolls the whole change back (docs/DESIGN.md section 5).
 */
export function putStatus(db: Db, containerId: string, key: string, body: PutStatusBody) {
  return db.transaction().execute(async (tx) => {
    const path = await getPath(tx, containerId);
    await lockPath(tx, path);
    const rows = await loadRows(
      tx,
      path.map((c) => c.id),
    );
    const inherited = mergeStatuses(levelsFor(path.slice(0, -1), rows)).get(key);
    const current = rows.find((row) => row.container_id === containerId && row.key === key);

    let values: Pick<StatusRow, 'name' | 'category' | 'color' | 'hidden'>;
    if (inherited) {
      if (body.category && body.category !== inherited.category) {
        throw invalid(
          'category',
          'category_locked',
          `"${key}" is inherited as ${inherited.category}; its category can't change`,
        );
      }
      values = body.hidden
        ? { name: null, category: null, color: null, hidden: true }
        : { name: body.name ?? null, category: null, color: body.color ?? null, hidden: false };
    } else {
      if (body.hidden) throw invalid('hidden', 'nothing_to_hide', `No inherited status "${key}" to hide`);
      const { name, category, color } = body;
      if (!name || !category || !color) {
        const missing = (['name', 'category', 'color'] as const).filter((field) => !body[field]);
        const issues: ValidationIssue[] = missing.map((field) => ({
          path: field,
          code: 'required',
          message: 'Required for a new status',
        }));
        throw validationFailed(issues, 'A new status needs a name, category and color');
      }
      await assertKeyUnusedBelow(tx, containerId, key);
      values = { name, category, color, hidden: false };
    }

    let position = current?.position ?? null;
    if (values.hidden) position = null;
    else if (body.beforeKey || body.afterKey || (!inherited && !position)) {
      const siblings = resolveStatuses(levelsFor(path, rows))
        .filter((status) => status.key !== key)
        .map((status) => ({ id: status.key, position: status.position }));
      position = placeAmong(siblings, { beforeId: body.beforeKey, afterId: body.afterKey });
    }

    await tx
      .insertInto('status_definitions')
      .values({ container_id: containerId, key, ...values, position })
      .onConflict((oc) =>
        oc.columns(['container_id', 'key']).doUpdateSet({ ...values, position, updated_at: new Date() }),
      )
      .execute();

    await verifySubtree(tx, containerId);
    return getContainerStatuses(tx, containerId);
  });
}

/** Removes this container's row for a key: an override goes back to inherited, an origin disappears. */
export function deleteStatus(db: Db, containerId: string, key: string) {
  return db.transaction().execute(async (tx) => {
    const path = await getPath(tx, containerId);
    await lockPath(tx, path);
    const rows = await loadRows(
      tx,
      path.map((c) => c.id),
    );
    const current = rows.find((row) => row.container_id === containerId && row.key === key);
    if (!current) throw notFound(`Status "${key}" on this container`);
    const isOrigin = !mergeStatuses(levelsFor(path.slice(0, -1), rows)).has(key);
    if (isOrigin) await assertKeyUnusedBelow(tx, containerId, key);

    await tx.deleteFrom('status_definitions').where('id', '=', current.id).execute();
    await verifySubtree(tx, containerId);
    return getContainerStatuses(tx, containerId);
  });
}

/** A key may be defined only once per branch; lower levels can only override it. */
async function assertKeyUnusedBelow(tx: Db, containerId: string, key: string) {
  const below = (await getSubtree(tx, containerId)).filter((c) => c.id !== containerId);
  if (below.length === 0) return;
  const clashes = await tx
    .selectFrom('status_definitions')
    .select('container_id as containerId')
    .where('key', '=', key)
    .where(
      'container_id',
      'in',
      below.map((c) => c.id),
    )
    .execute();
  if (clashes.length > 0) {
    throw conflict(
      'STATUS_KEY_CONFLICT',
      `"${key}" is also set on containers below this one. Remove those first.`,
      clashes,
    );
  }
}

/**
 * Checks every list under a container (archived ones too): each must still have a not started,
 * an active and a done status, and every task's status must still be one of its list's statuses.
 */
export async function verifySubtree(tx: Db, containerId: string): Promise<void> {
  const ancestors = (await getPath(tx, containerId)).slice(0, -1);
  const subtree = await getSubtree(tx, containerId);
  const rows = await loadRows(
    tx,
    [...ancestors, ...subtree].map((c) => c.id),
  );
  const byId = new Map(subtree.map((c) => [c.id, c]));
  const pathTo = (container: ContainerRow): ContainerRow[] => {
    const parent = container.parent_id ? byId.get(container.parent_id) : undefined;
    return parent ? [...pathTo(parent), container] : [...ancestors, container];
  };

  const lists = subtree.filter((c) => c.type === 'list');
  const resolved = new Map(lists.map((list) => [list.id, resolveStatuses(levelsFor(pathTo(list), rows))]));

  const incomplete = lists.flatMap((list) => {
    const missing = missingCategories(resolved.get(list.id)!);
    return missing.length > 0 ? [{ listId: list.id, listName: list.name, missingCategories: missing }] : [];
  });
  if (incomplete.length > 0) {
    throw conflict(
      'STATUS_SET_INCOMPLETE',
      'Every list needs at least one not started, one active and one done status',
      incomplete,
    );
  }

  const orphaned = (
    await statusUsage(
      tx,
      lists.map((l) => l.id),
    )
  )
    .filter((usage) => !resolved.get(usage.listId)!.some((status) => status.key === usage.statusKey))
    .map((usage) => ({ ...usage, listName: byId.get(usage.listId)!.name }));
  if (orphaned.length > 0) {
    throw conflict(
      'STATUS_IN_USE',
      'Tasks still use this status. Move them to another status first.',
      orphaned,
    );
  }
}
