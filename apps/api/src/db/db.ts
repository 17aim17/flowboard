import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './types.ts';

export type Db = Kysely<Database>;

export function createDb(connectionString: string): Db {
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString, max: 10 }) }),
  });
}
