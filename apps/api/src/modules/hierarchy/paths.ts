import { sql } from 'kysely';
import type { Db } from '../../db/db.ts';
import type { ContainerRow } from '../../db/types.ts';
import { notFound } from '../../lib/errors.ts';

/** The container and its ancestors, root first. Empty if the id doesn't exist. Archived rows included. */
export async function findPath(db: Db, id: string): Promise<ContainerRow[]> {
  const { rows } = await sql<ContainerRow>`
    WITH RECURSIVE path AS (
      SELECT containers.*, 0 AS depth FROM containers WHERE id = ${id}
      UNION ALL
      SELECT parent.*, path.depth + 1 FROM containers parent JOIN path ON parent.id = path.parent_id
    )
    SELECT * FROM path ORDER BY depth DESC
  `.execute(db);
  return rows;
}

/** Like findPath, but 404 when the container is missing or it or an ancestor is archived. */
export async function getPath(db: Db, id: string, what = 'Container'): Promise<ContainerRow[]> {
  const path = await findPath(db, id);
  if (path.length === 0 || path.some((c) => c.archived_at)) throw notFound(what);
  return path;
}

export async function getListPath(db: Db, id: string): Promise<ContainerRow[]> {
  const path = await getPath(db, id, 'List');
  if (path.at(-1)!.type !== 'list') throw notFound('List');
  return path;
}

/** The container and everything under it, archived rows included. */
export async function getSubtree(db: Db, id: string): Promise<ContainerRow[]> {
  const { rows } = await sql<ContainerRow>`
    WITH RECURSIVE subtree AS (
      SELECT * FROM containers WHERE id = ${id}
      UNION ALL
      SELECT child.* FROM containers child JOIN subtree ON child.parent_id = subtree.id
    )
    SELECT * FROM subtree
  `.execute(db);
  return rows;
}

/**
 * Locks a path for the rest of the transaction: ancestors FOR SHARE (root first), the last one FOR UPDATE.
 * Task writes and config changes both lock their path this way, so a config change and a task write on
 * the same branch take turns instead of interleaving (decision D-14).
 */
export async function lockPath(tx: Db, path: ContainerRow[]): Promise<void> {
  for (const [index, container] of path.entries()) {
    const query = tx.selectFrom('containers').select('id').where('id', '=', container.id);
    await (index === path.length - 1 ? query.forUpdate() : query.forShare()).execute();
  }
}
