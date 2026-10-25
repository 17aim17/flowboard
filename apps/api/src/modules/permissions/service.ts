import type { GrantMode, User } from '@flowboard/contracts';
import type { Db } from '../../db/db.ts';
import type { ContainerRow } from '../../db/types.ts';
import { forbidden } from '../../lib/errors.ts';
import { getPath } from '../hierarchy/paths.ts';

/** Containers, statuses, fields and grants are admin-only (decision D-13). */
export function assertAdmin(user: User): void {
  if (user.role !== 'admin')
    throw forbidden('Only admins can change containers, statuses, fields and grants');
}

type Grants = Map<string, GrantMode>; // container id -> allow | deny, for one user

export async function loadGrants(db: Db, userId: string): Promise<Grants> {
  const rows = await db
    .selectFrom('grants')
    .select(['container_id', 'mode'])
    .where('user_id', '=', userId)
    .execute();
  return new Map(rows.map((row) => [row.container_id, row.mode]));
}

/** One step of the path: a grant decides; without one, public passes and private doesn't. */
const passes = (container: ContainerRow, grants: Grants) =>
  (grants.get(container.id) ?? (container.visibility === 'public' ? 'allow' : 'deny')) === 'allow';

/**
 * A user sees a container only if every container on its path (root first) passes, so a deny or a
 * private container higher up hides everything below it. Admins see everything (decision D-15).
 */
export function canView(user: User, path: ContainerRow[], grants: Grants): boolean {
  return user.role === 'admin' || path.every((container) => passes(container, grants));
}

/** The visible part of a tree. `rows` must list every parent before its children. */
export function filterVisible(user: User, rows: ContainerRow[], grants: Grants): ContainerRow[] {
  if (user.role === 'admin') return rows;
  const visible = new Set<string>();
  return rows.filter((row) => {
    const ok = (row.parent_id === null || visible.has(row.parent_id)) && passes(row, grants);
    if (ok) visible.add(row.id);
    return ok;
  });
}

/** 404 if the container is missing or archived, 403 if the user can't see it. */
export async function assertCanView(db: Db, user: User, containerId: string): Promise<void> {
  const path = await getPath(db, containerId);
  if (!canView(user, path, await loadGrants(db, user.id)))
    throw forbidden("You don't have access to this container");
}
