import { sql } from 'kysely';
import { createDb } from '../src/db/db.ts';
import { migrateToLatest } from '../src/db/migrate.ts';
import { TEST_DATABASE_URL } from './helpers.ts';

/** Rebuilds the test database schema from the migrations once per run. */
export async function setup() {
  const db = createDb(TEST_DATABASE_URL);
  try {
    await sql`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`.execute(db);
    await migrateToLatest(db);
  } finally {
    await db.destroy();
  }
}
