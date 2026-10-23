import type { User } from '@flowboard/contracts';
import type { Db } from '../../db/db.ts';
import type { UserRow } from '../../db/types.ts';
import { decodeCursor, toPage } from '../../lib/pagination.ts';
import { z } from 'zod';

export const toUser = (row: UserRow): User => ({
  id: row.id,
  handle: row.handle,
  name: row.name,
  role: row.role,
});

export async function findUserByHandle(db: Db, handle: string): Promise<User | undefined> {
  const row = await db.selectFrom('users').selectAll().where('handle', '=', handle).executeTakeFirst();
  return row && toUser(row);
}

const UserCursor = z.object({ id: z.uuid() });

/** Workspace members, oldest first (ids are time-ordered UUIDv7). */
export async function listUsers(db: Db, { limit, cursor }: { limit: number; cursor?: string | undefined }) {
  let query = db
    .selectFrom('users')
    .selectAll()
    .orderBy('id')
    .limit(limit + 1);
  if (cursor) query = query.where('id', '>', decodeCursor(cursor, UserCursor).id);
  const { data, page } = toPage(await query.execute(), limit, (row) => ({ id: row.id }));
  return { data: data.map(toUser), page };
}
