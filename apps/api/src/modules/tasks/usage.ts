import { sql } from 'kysely';
import type { Db } from '../../db/db.ts';

// Read-only questions other modules ask about tasks before changing config.

/** Tasks per (list, status), with up to 20 task ids each, for the given lists. */
export async function statusUsage(db: Db, listIds: string[]) {
  if (listIds.length === 0) return [];
  return db
    .selectFrom('tasks')
    .select([
      'list_id as listId',
      'status_key as statusKey',
      sql<number>`count(*)::int`.as('taskCount'),
      sql<string[]>`(array_agg(id ORDER BY id))[1:20]`.as('taskIds'),
    ])
    .where('list_id', 'in', listIds)
    .groupBy(['list_id', 'status_key'])
    .execute();
}

/** How many tasks have any value for a custom field key. */
export async function countTasksWithField(db: Db, key: string): Promise<number> {
  const row = await db
    .selectFrom('tasks')
    .select(sql<number>`count(*)::int`.as('count'))
    .where(sql<boolean>`custom_fields ? ${key}`)
    .executeTakeFirstOrThrow();
  return row.count;
}

/** How many tasks use each of the given select options. Only options in use are returned. */
export async function optionUsage(db: Db, key: string, optionIds: string[]) {
  if (optionIds.length === 0) return [];
  // Works for single_select (a string) and multi_select (an array): normalize both to a set of strings.
  const { rows } = await sql<{ optionId: string; taskCount: number }>`
    SELECT option AS "optionId", count(*)::int AS "taskCount"
    FROM tasks,
      jsonb_array_elements_text(
        CASE jsonb_typeof(custom_fields -> ${key})
          WHEN 'array' THEN custom_fields -> ${key}
          ELSE jsonb_build_array(custom_fields -> ${key})
        END
      ) AS option
    WHERE custom_fields ? ${key} AND option = ANY(${optionIds})
    GROUP BY option
  `.execute(db);
  return rows;
}
