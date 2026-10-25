import { type Kysely, sql } from 'kysely';

// Sorting by due date orders by coalesce(due_date, 'infinity') so undated tasks come last, and pages
// with (that expression, id) > cursor. An index on the plain column can't serve that; this one can.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP INDEX tasks_by_due_date;
    CREATE INDEX tasks_by_due_date ON tasks (list_id, (coalesce(due_date, 'infinity'::timestamptz)), id);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP INDEX tasks_by_due_date;
    CREATE INDEX tasks_by_due_date ON tasks (list_id, due_date, id);
  `.execute(db);
}
