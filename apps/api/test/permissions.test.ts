import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers.ts';

const { ctx, alice, bob, carol, idOf } = useTestApp();

const treeNames = async (as: typeof alice) =>
  (await as('GET', '/tree')).body.data.map((c: { name: string }) => c.name);
const taskIn = async (list: string) =>
  ctx.db
    .selectFrom('tasks')
    .select(['id', 'version'])
    .where('list_id', '=', await idOf(list))
    .executeTakeFirstOrThrow();

describe('tree visibility (T1)', () => {
  it('shows Alice everything', async () => {
    expect(await treeNames(alice)).toEqual([
      'Flowboard',
      'Engineering',
      'Q4 Launch',
      'Backlog',
      'Sprint 12',
      'Platform',
      'On-call',
      'Marketing',
      'Campaigns',
      'Launch Content',
    ]);
  });

  it('hides the private space and the denied list from Bob', async () => {
    expect(await treeNames(bob)).toEqual([
      'Flowboard',
      'Engineering',
      'Q4 Launch',
      'Backlog',
      'Sprint 12',
      'Platform',
    ]);
  });

  it('shows Carol the private space she is allowed on', async () => {
    expect(await treeNames(carol)).toContain('Launch Content');
  });
});

describe('direct access (T1)', () => {
  it('returns 403 when Bob reads tasks in a denied list', async () => {
    const res = await bob('GET', `/lists/${await idOf('On-call')}/tasks`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 403 for a task in a private space, by id', async () => {
    const task = await taskIn('Launch Content');
    expect((await bob('GET', `/tasks/${task.id}`)).status).toBe(403);
    expect((await carol('GET', `/tasks/${task.id}`)).status).toBe(200);
  });

  it('blocks writes to tasks Bob cannot see, and changes nothing', async () => {
    const task = await taskIn('On-call');
    const edit = await bob('PATCH', `/tasks/${task.id}`, { version: task.version, title: 'Mine now' });
    const remove = await bob('DELETE', `/tasks/${task.id}`);
    expect([edit.status, remove.status]).toEqual([403, 403]);
    expect(await taskIn('On-call')).toEqual(task);
  });

  it('blocks moving a task into a list Bob cannot see', async () => {
    const task = await taskIn('Backlog');
    const res = await bob('POST', `/tasks/${task.id}/move`, {
      version: task.version,
      listId: await idOf('On-call'),
    });
    expect(res.status).toBe(403);
  });

  it('blocks reading status and field config under a hidden container', async () => {
    const marketing = await idOf('Marketing');
    const list = await idOf('Launch Content');
    const statuses = await bob('GET', `/containers/${marketing}/statuses`);
    const fields = await bob('GET', `/lists/${list}/resolved-fields`);
    const container = await bob('GET', `/containers/${list}`);
    expect([statuses.status, fields.status, container.status]).toEqual([403, 403, 403]);
  });

  it('returns 404, not 403, for a list that does not exist', async () => {
    const res = await bob('GET', '/lists/01a16a09-0000-7000-8000-000000000000/tasks');
    expect(res.status).toBe(404);
  });
});
