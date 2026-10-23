import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers.ts';

const { ctx, alice, idOf } = useTestApp();

type Status = { key: string; name: string; category: string; ownerType: string };

const columns = async (list: string): Promise<Status[]> =>
  (await alice('GET', `/lists/${await idOf(list)}/resolved-statuses`)).body.data;
const keys = async (list: string) => (await columns(list)).map((s) => s.key);
const put = async (container: string, key: string, body: object) =>
  alice('PUT', `/containers/${await idOf(container)}/statuses/${key}`, body);

/** Tasks whose status isn't a column of their list's board. Must always be empty. */
async function orphanedTasks() {
  const tasks = await ctx.db
    .selectFrom('tasks')
    .innerJoin('containers', 'containers.id', 'tasks.list_id')
    .select(['tasks.title', 'tasks.status_key', 'containers.name as list'])
    .execute();
  const orphans: string[] = [];
  for (const task of tasks) {
    if (!(await keys(task.list)).includes(task.status_key)) orphans.push(task.title);
  }
  return orphans;
}

describe('status resolution (T2)', () => {
  it('gives sibling lists in the same folder different columns', async () => {
    expect(await keys('Backlog')).toEqual(['todo', 'in_progress', 'done', 'closed']);
    expect(await keys('Sprint 12')).toEqual(['todo', 'in_progress', 'in_review', 'done']);
    expect((await columns('Sprint 12')).find((s) => s.key === 'done')).toMatchObject({
      name: 'Shipped',
      category: 'done',
    });
  });

  it('inherits from folder and space levels', async () => {
    expect(await keys('On-call')).toEqual(['todo', 'in_progress', 'blocked', 'done', 'closed']);
    expect((await columns('On-call')).find((s) => s.key === 'blocked')).toMatchObject({
      ownerType: 'folder',
    });
    expect(await keys('Launch Content')).toEqual(['idea', 'drafting', 'scheduled', 'published']);
  });

  it('shows a container its own rows and its merged result', async () => {
    const res = await alice('GET', `/containers/${await idOf('Sprint 12')}/statuses`);
    expect(res.body.local.map((s: Status) => s.key).sort()).toEqual(['closed', 'done', 'in_review']);
    expect(res.body.resolved.map((s: Status) => s.key)).toEqual(['todo', 'in_progress', 'in_review', 'done']);
  });
});

describe('editing statuses', () => {
  it('adds a status at a folder, placed between two inherited ones, for every list below', async () => {
    const res = await put('Q4 Launch', 'qa', {
      name: 'QA',
      category: 'active',
      color: '#F97316',
      beforeKey: 'in_progress',
      afterKey: 'done',
    });
    expect(res.status).toBe(200);
    expect(await keys('Backlog')).toEqual(['todo', 'in_progress', 'qa', 'done', 'closed']);
    expect(await keys('Sprint 12')).toContain('qa');
    expect(await keys('On-call')).not.toContain('qa');
  });

  it('renames an inherited status for one list only', async () => {
    await put('Backlog', 'todo', { name: 'Ideas' });
    expect((await columns('Backlog'))[0]!.name).toBe('Ideas');
    expect((await columns('Sprint 12'))[0]!.name).toBe('To Do');
  });

  it("refuses to change an inherited status's category", async () => {
    const res = await put('Backlog', 'done', { category: 'active' });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0]).toMatchObject({ path: 'category', code: 'category_locked' });
  });

  it('requires name, category and color for a new key', async () => {
    const res = await put('Backlog', 'qa', { name: 'QA' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual(['category', 'color']);
  });

  it('refuses to define a key above a container that already defines it', async () => {
    const res = await put('Q4 Launch', 'in_review', { name: 'Review', category: 'active', color: '#8B5CF6' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STATUS_KEY_CONFLICT');
  });

  it('removing an override goes back to the inherited status', async () => {
    const res = await alice('DELETE', `/containers/${await idOf('Sprint 12')}/statuses/done`);
    expect(res.status).toBe(200);
    expect((await columns('Sprint 12')).find((s) => s.key === 'done')!.name).toBe('Done');
  });
});

describe('config safety (T7): in-use statuses are blocked, never orphaned', () => {
  it('refuses to hide a status that tasks use, and changes nothing', async () => {
    const closedTask = await ctx.db
      .selectFrom('tasks')
      .select('id')
      .where('status_key', '=', 'closed')
      .where('list_id', '=', await idOf('Backlog'))
      .executeTakeFirstOrThrow();

    const res = await put('Q4 Launch', 'closed', { hidden: true });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'STATUS_IN_USE',
      details: [{ listName: 'Backlog', statusKey: 'closed', taskCount: 1, taskIds: [closedTask.id] }],
    });
    expect(await keys('Backlog')).toContain('closed');
    expect(await orphanedTasks()).toEqual([]);
  });

  it('allows the change once no task uses the status', async () => {
    await ctx.db
      .updateTable('tasks')
      .set({ status_key: 'done' })
      .where('status_key', '=', 'closed')
      .where('list_id', '=', await idOf('Backlog'))
      .execute();

    expect((await put('Q4 Launch', 'closed', { hidden: true })).status).toBe(200);
    expect(await keys('Backlog')).toEqual(['todo', 'in_progress', 'done']);
    expect(await orphanedTasks()).toEqual([]);
  });

  it('refuses to delete a status that tasks in lists below use', async () => {
    const res = await alice('DELETE', `/containers/${await idOf('Sprint 12')}/statuses/in_review`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STATUS_IN_USE');
    expect(await orphanedTasks()).toEqual([]);
  });

  it('refuses a change that leaves a list without a done status', async () => {
    const res = await put('Platform', 'done', { hidden: true });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'STATUS_SET_INCOMPLETE',
      details: [{ listName: 'On-call', missingCategories: ['done'] }],
    });
  });

  it('refuses to delete a default that lower levels still override', async () => {
    const workspace = (
      await ctx.db
        .selectFrom('containers')
        .select('id')
        .where('type', '=', 'workspace')
        .executeTakeFirstOrThrow()
    ).id;
    const res = await alice('DELETE', `/containers/${workspace}/statuses/closed`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STATUS_KEY_CONFLICT');
  });
});
