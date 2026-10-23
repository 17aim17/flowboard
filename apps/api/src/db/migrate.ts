import { promises as fs } from 'node:fs';
import path from 'node:path';
import { FileMigrationProvider, type Kysely, Migrator } from 'kysely';
import { loadConfig } from '../config.ts';
import { createDb } from './db.ts';

export async function migrateToLatest(db: Kysely<unknown>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({ fs, path, migrationFolder: path.join(import.meta.dirname, 'migrations') }),
  });
  const { error, results } = await migrator.migrateToLatest();
  for (const result of results ?? []) console.log(`migration ${result.migrationName}: ${result.status}`);
  if (error) throw error instanceof Error ? error : new Error(String(error));
}

if (import.meta.main) {
  const db = createDb(loadConfig().DATABASE_URL);
  try {
    await migrateToLatest(db);
  } finally {
    await db.destroy();
  }
}
