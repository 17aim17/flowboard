import type {
  Container,
  ContainerType,
  CreateContainerBody,
  MoveContainerBody,
  UpdateContainerBody,
} from '@flowboard/contracts';
import { sql } from 'kysely';
import type { Db } from '../../db/db.ts';
import type { ContainerRow } from '../../db/types.ts';
import { invalid } from '../../lib/errors.ts';
import { placeAmong } from '../../lib/position.ts';
import { getPath, lockPath } from './paths.ts';

export const toContainer = (row: ContainerRow): Container => ({
  id: row.id,
  type: row.type,
  parentId: row.parent_id,
  name: row.name,
  position: row.position,
  visibility: row.visibility,
  archivedAt: row.archived_at?.toISOString() ?? null,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

const parentTypeOf: Record<Exclude<ContainerType, 'workspace'>, ContainerType> = {
  space: 'workspace',
  folder: 'space',
  list: 'folder',
};

/** Every container that isn't archived and has no archived ancestor, in tree order (depth first). */
export async function listActiveContainers(db: Db): Promise<ContainerRow[]> {
  return depthFirst(await activeContainers(db));
}

function depthFirst(rows: ContainerRow[]): ContainerRow[] {
  const children = Map.groupBy(rows, (row) => row.parent_id); // rows arrive in sibling order
  const ordered: ContainerRow[] = [];
  const visit = (parentId: string | null) => {
    for (const child of children.get(parentId) ?? []) {
      ordered.push(child);
      visit(child.id);
    }
  };
  visit(null);
  return ordered;
}

async function activeContainers(db: Db): Promise<ContainerRow[]> {
  const { rows } = await sql<ContainerRow>`
    WITH RECURSIVE tree AS (
      SELECT * FROM containers WHERE parent_id IS NULL AND archived_at IS NULL
      UNION ALL
      SELECT child.* FROM containers child JOIN tree ON child.parent_id = tree.id
      WHERE child.archived_at IS NULL
    )
    SELECT * FROM tree ORDER BY position, id
  `.execute(db);
  return rows;
}

export async function getContainer(db: Db, id: string): Promise<Container> {
  return toContainer((await getPath(db, id)).at(-1)!);
}

/** Active siblings under a parent in order, optionally leaving out the item being placed. */
function siblings(db: Db, parentId: string, excludeId?: string) {
  let query = db
    .selectFrom('containers')
    .select(['id', 'position'])
    .where('parent_id', '=', parentId)
    .where('archived_at', 'is', null)
    .orderBy('position')
    .orderBy('id');
  if (excludeId) query = query.where('id', '!=', excludeId);
  return query.execute();
}

function assertParentType(type: ContainerType, parent: ContainerRow) {
  if (type === 'workspace' || parent.type !== parentTypeOf[type]) {
    throw invalid(
      'parentId',
      'invalid_parent',
      `A ${type} must be inside a ${parentTypeOf[type as 'space']}`,
    );
  }
}

export function createContainer(db: Db, body: CreateContainerBody): Promise<Container> {
  return db.transaction().execute(async (tx) => {
    const parentPath = await getPath(tx, body.parentId, 'Parent');
    const parent = parentPath.at(-1)!;
    assertParentType(body.type, parent);
    await lockPath(tx, parentPath);
    const row = await tx
      .insertInto('containers')
      .values({
        type: body.type,
        parent_id: parent.id,
        parent_type: parent.type,
        name: body.name,
        visibility: body.visibility,
        position: placeAmong(await siblings(tx, parent.id), {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toContainer(row);
  });
}

export async function updateContainer(db: Db, id: string, body: UpdateContainerBody): Promise<Container> {
  const target = (await getPath(db, id)).at(-1)!;
  if (target.type === 'workspace' && body.visibility) {
    throw invalid('visibility', 'not_allowed', 'The workspace is always visible to its members');
  }
  const row = await db
    .updateTable('containers')
    .set({ ...body, updated_at: new Date() })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();
  return toContainer(row);
}

/** Soft delete: the container and everything under it disappear; the rows stay (decision D-11). */
export async function archiveContainer(db: Db, id: string): Promise<void> {
  const target = (await getPath(db, id)).at(-1)!;
  if (target.type === 'workspace') throw invalid('id', 'not_allowed', "The workspace can't be archived");
  await db
    .updateTable('containers')
    .set({ archived_at: new Date(), updated_at: new Date() })
    .where('id', '=', id)
    .execute();
}

/** Reorders a container among its siblings. */
export function moveContainer(db: Db, id: string, body: MoveContainerBody): Promise<Container> {
  return db.transaction().execute(async (tx) => {
    const path = await getPath(tx, id);
    const target = path.at(-1)!;
    if (target.type === 'workspace') throw invalid('id', 'not_allowed', "The workspace can't be moved");
    await lockPath(tx, path.slice(0, -1)); // the parent, so concurrent reorders take turns

    const row = await tx
      .updateTable('containers')
      .set({ position: placeAmong(await siblings(tx, target.parent_id!, id), body), updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toContainer(row);
  });
}
