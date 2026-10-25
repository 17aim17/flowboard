import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers.ts';

const { ctx, alice, bob, anonymous } = useTestApp();

describe('auth boundary', () => {
  it('returns 401 without an X-User-Id header', async () => {
    const res = await anonymous('GET', '/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns 401 for an unknown user', async () => {
    const res = await ctx.app.inject({ url: '/v1/me', headers: { 'x-user-id': 'mallory' } });
    expect(res.statusCode).toBe(401);
  });

  it('resolves the caller and role from the database', async () => {
    expect((await alice('GET', '/me')).body).toMatchObject({ handle: 'alice', role: 'admin' });
    expect((await bob('GET', '/me')).body).toMatchObject({ handle: 'bob', role: 'member' });
  });

  it('returns 403 when a member changes config', async () => {
    const res = await bob('POST', '/containers', {
      type: 'space',
      parentId: await workspaceId(),
      name: 'Mine',
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('checks the role before the body: a member with a bad payload gets 403, not 400', async () => {
    const res = await bob('POST', '/containers', { type: 'nope', parentId: 'not-a-uuid' });
    expect(res.status).toBe(403);
  });
});

describe('API conventions', () => {
  it('uses the error shape for unknown routes', async () => {
    const res = await alice('GET', '/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('echoes the request id, or creates one', async () => {
    const given = await ctx.app.inject({ url: '/health', headers: { 'x-request-id': 'req-123' } });
    expect(given.headers['x-request-id']).toBe('req-123');
    const created = await ctx.app.inject({ url: '/health' });
    expect(created.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('pages users with a cursor', async () => {
    const first = await alice('GET', '/users?limit=2');
    expect(first.body.data.map((u: { handle: string }) => u.handle)).toEqual(['alice', 'bob']);
    expect(first.body.page).toMatchObject({ limit: 2, hasMore: true, nextCursor: expect.any(String) });

    const second = await alice('GET', `/users?limit=2&cursor=${first.body.page.nextCursor}`);
    expect(second.body.data.map((u: { handle: string }) => u.handle)).toEqual(['carol']);
    expect(second.body.page).toEqual({ limit: 2, hasMore: false, nextCursor: null });
  });

  it('rejects a malformed cursor with 400', async () => {
    const res = await alice('GET', '/users?cursor=garbage');
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('query.cursor');
  });
});

async function workspaceId() {
  return (
    await ctx.db
      .selectFrom('containers')
      .select('id')
      .where('type', '=', 'workspace')
      .executeTakeFirstOrThrow()
  ).id;
}
