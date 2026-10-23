import { afterAll, beforeAll, beforeEach, expect } from 'vitest';
import { buildApp } from '../src/app.ts';
import { createDb, type Db } from '../src/db/db.ts';
import { resetDatabase, seed } from '../src/db/seed.ts';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://flowboard:flowboard@localhost:5432/flowboard_test';

type Handle = 'alice' | 'bob' | 'carol';
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Starts the app against the test database and reloads the seed data (docs/DESIGN.md section 4)
 * before every test, so each test starts from the same known state.
 */
export function useTestApp() {
  const ctx = {} as { app: Awaited<ReturnType<typeof buildApp>>; db: Db };

  beforeAll(async () => {
    ctx.db = createDb(TEST_DATABASE_URL);
    ctx.app = await buildApp({ db: ctx.db, logger: false });
  });
  beforeEach(async () => {
    await resetDatabase(ctx.db);
    await seed(ctx.db);
  });
  afterAll(async () => {
    await ctx.app.close();
    await ctx.db.destroy();
  });

  /** Calls the API as a seeded user and returns the status and parsed body. */
  const as = (user: Handle | null) => async (method: Method, url: string, body?: unknown) => {
    const response = await ctx.app.inject({
      method,
      url: `/v1${url}`,
      headers: user ? { 'x-user-id': user } : {},
      ...(body !== undefined && { payload: body as object }),
    });
    const json: unknown = response.body ? JSON.parse(response.body) : undefined;
    if (response.statusCode >= 400)
      expect(json).toMatchObject({ error: { code: expect.any(String), message: expect.any(String) } });
    return { status: response.statusCode, body: json as any };
  };

  /** Id of a seeded container by its (unique) name. */
  const idOf = async (name: string) =>
    (await ctx.db.selectFrom('containers').select('id').where('name', '=', name).executeTakeFirstOrThrow())
      .id;

  return { ctx, alice: as('alice'), bob: as('bob'), carol: as('carol'), anonymous: as(null), idOf };
}
