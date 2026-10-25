import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers.ts';

const { ctx, alice, bob, idOf } = useTestApp();

const taskRow = (title: string) =>
  ctx.db.selectFrom('tasks').selectAll().where('title', '=', title).executeTakeFirstOrThrow();
const create = async (list: string, body: object) => alice('POST', `/lists/${await idOf(list)}/tasks`, body);
const move = async (title: string, body: object) => {
  const task = await taskRow(title);
  return alice('POST', `/tasks/${task.id}/move`, { version: task.version, ...body });
};
const columnTitles = async (list: string, statusKey: string) =>
  (await alice('GET', `/lists/${await idOf(list)}/tasks?statusKey=${statusKey}`)).body.data.map(
    (t: { title: string }) => t.title,
  );

describe('creating tasks', () => {
  it('creates a task at the end of its column, with validated custom fields', async () => {
    const res = await create('Sprint 12', {
      title: 'Write release notes',
      statusKey: 'todo',
      priority: 'high',
      dueDate: '2026-11-01T09:00:00Z',
      customFields: { severity: 'low', estimate: 2 },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'Write release notes',
      statusKey: 'todo',
      priority: 'high',
      dueDate: '2026-11-01T09:00:00.000Z',
      customFields: { severity: 'low', estimate: 2 },
      version: 1,
    });
    expect((await columnTitles('Sprint 12', 'todo')).at(-1)).toBe('Write release notes');
  });

  it('rejects unknown assignees', async () => {
    const res = await create('Backlog', {
      title: 'x',
      statusKey: 'todo',
      assigneeIds: ['01a16a09-0000-7000-8000-000000000000'],
      customFields: { severity: 'low' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0]).toMatchObject({ path: 'assigneeIds', code: 'unknown_user' });
  });

  it('lets members create tasks', async () => {
    const res = await bob('POST', `/lists/${await idOf('Backlog')}/tasks`, {
      title: 'From Bob',
      statusKey: 'todo',
      customFields: { severity: 'low' },
    });
    expect(res.status).toBe(201);
  });
});

describe('status validation (T3)', () => {
  it('rejects a status that is not in the list', async () => {
    const res = await create('Backlog', { title: 'x', statusKey: 'nope', customFields: { severity: 'low' } });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      expect.objectContaining({ path: 'statusKey', code: 'unknown_status' }),
    ]);
  });

  it('accepts a status only in the list that has it', async () => {
    const body = { title: 'x', statusKey: 'in_review', customFields: { severity: 'low' } };
    expect((await create('Backlog', body)).status).toBe(400);
    expect((await create('Sprint 12', body)).status).toBe(201);
  });

  it('rejects a status sent to PATCH: status changes go through /move', async () => {
    const task = await taskRow('Fix login redirect loop');
    for (const body of [{ statusKey: 'nope' }, { statusId: 'nope' }, { statusKey: 'done' }]) {
      const res = await alice('PATCH', `/tasks/${task.id}`, { version: task.version, ...body });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    }
    expect(await taskRow('Fix login redirect loop')).toEqual(task);
  });

  it('rejects changing to an unknown status', async () => {
    const res = await move('Fix login redirect loop', { statusKey: 'closed' }); // hidden in Sprint 12
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('statusKey');
  });
});

describe('moving between lists (T4)', () => {
  it('keeps the status when the new list has the same one', async () => {
    const res = await move('Order history API', { listId: await idOf('Backlog') });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ listId: await idOf('Backlog'), statusKey: 'in_progress', version: 2 });
  });

  it('maps to the first status of the same category when the status is missing', async () => {
    const res = await move('Search by order number', { listId: await idOf('Backlog') }); // in_review (active)
    expect(res.status).toBe(200);
    expect(res.body.statusKey).toBe('in_progress');
  });

  it('refuses when the new list has no status of that category, and changes nothing', async () => {
    const before = await taskRow('Dark mode'); // closed, in Backlog; Sprint 12 hides closed
    const res = await move('Dark mode', { listId: await idOf('Sprint 12') });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STATUS_UNMAPPABLE');
    expect(res.body.error.details.map((s: { key: string }) => s.key)).toEqual([
      'todo',
      'in_progress',
      'in_review',
      'done',
    ]);
    expect(await taskRow('Dark mode')).toEqual(before);
  });

  it('moves when the client picks a status explicitly', async () => {
    const res = await move('Dark mode', { listId: await idOf('Sprint 12'), statusKey: 'done' });
    expect(res.status).toBe(200);
    expect(res.body.statusKey).toBe('done');
  });

  it('requires the new list’s required fields in the move payload', async () => {
    const refused = await move('Launch announcement post', { listId: await idOf('Backlog') });
    expect(refused.status).toBe(400);
    expect(refused.body.error.details).toEqual([
      expect.objectContaining({ path: 'customFields.severity', code: 'required' }),
    ]);

    const moved = await move('Launch announcement post', {
      listId: await idOf('Backlog'),
      customFields: { severity: 'high' },
    });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ statusKey: 'in_progress', customFields: { severity: 'high' } }); // drafting -> active
    expect(moved.body.customFields).not.toHaveProperty('channel');
  });

  it('keeps values of fields the new list lacks, so moving back restores them', async () => {
    await move('Launch announcement post', {
      listId: await idOf('Backlog'),
      customFields: { severity: 'high' },
    });
    const back = await move('Launch announcement post', { listId: await idOf('Launch Content') });
    expect(back.status).toBe(200);
    expect(back.body).toMatchObject({
      statusKey: 'drafting',
      customFields: { channel: 'blog', publish_date: '2026-11-02' },
    });
  });
});

describe('custom field values (T5) and required fields (T6)', () => {
  it('rejects a string for a number, with the field path', async () => {
    const res = await create('Backlog', {
      title: 'x',
      statusKey: 'todo',
      customFields: { severity: 'low', estimate: '5' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      expect.objectContaining({ path: 'customFields.estimate', code: 'invalid_type' }),
    ]);
  });

  it('rejects a select value that is not an option', async () => {
    const res = await create('Backlog', {
      title: 'x',
      statusKey: 'todo',
      customFields: { severity: 'urgent' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0]).toMatchObject({
      path: 'customFields.severity',
      code: 'invalid_option',
    });
  });

  it('accepts and round-trips a valid value of each type', async () => {
    const values = { estimate: 3, severity: 'high', component: ['api', 'web'], needs_qa: true };
    const created = await create('Sprint 12', { title: 'Typed', statusKey: 'todo', customFields: values });
    expect(created.status).toBe(201);
    expect((await alice('GET', `/tasks/${created.body.id}`)).body.customFields).toEqual(values);

    const onCall = await create('On-call', {
      title: 'Typed',
      statusKey: 'todo',
      customFields: { runbook: 'https://x.test' },
    });
    const content = await create('Launch Content', {
      title: 'Typed',
      statusKey: 'idea',
      customFields: { channel: 'video', publish_date: '2026-12-01' },
    });
    expect([onCall.status, content.status]).toEqual([201, 201]);
  });

  it('rejects creating a task without a required field', async () => {
    const res = await create('Backlog', { title: 'x', statusKey: 'todo' });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      expect.objectContaining({ path: 'customFields.severity', code: 'required' }),
    ]);
  });

  it('rejects clearing a required field, allows clearing an optional one', async () => {
    const task = await taskRow('Add SSO login');
    const cleared = await alice('PATCH', `/tasks/${task.id}`, {
      version: task.version,
      customFields: { severity: null },
    });
    expect(cleared.status).toBe(400);

    const ok = await alice('PATCH', `/tasks/${task.id}`, {
      version: task.version,
      customFields: { estimate: null },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.customFields).not.toHaveProperty('estimate');
  });
});

describe('editing and concurrency (T9)', () => {
  it('updates plain fields and bumps the version', async () => {
    const task = await taskRow('Add SSO login');
    const res = await alice('PATCH', `/tasks/${task.id}`, {
      version: 1,
      title: 'Add SAML login',
      dueDate: null,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: 'Add SAML login', dueDate: null, version: 2 });
  });

  it('refuses an edit based on a stale version', async () => {
    const task = await taskRow('Add SSO login');
    await alice('PATCH', `/tasks/${task.id}`, { version: 1, title: 'First save' });
    const stale = await alice('PATCH', `/tasks/${task.id}`, { version: 1, title: 'Second save' });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({ code: 'VERSION_CONFLICT', details: [{ currentVersion: 2 }] });
    const saved = await ctx.db
      .selectFrom('tasks')
      .select('title')
      .where('id', '=', task.id)
      .executeTakeFirstOrThrow();
    expect(saved.title).toBe('First save');
  });

  it('refuses a move based on a stale version', async () => {
    const task = await taskRow('Fix login redirect loop');
    const res = await alice('POST', `/tasks/${task.id}/move`, { version: 99, statusKey: 'done' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VERSION_CONFLICT');
  });

  it('deletes a task', async () => {
    const task = await taskRow('Dark mode');
    expect((await alice('DELETE', `/tasks/${task.id}`)).status).toBe(204);
    expect((await alice('GET', `/tasks/${task.id}`)).status).toBe(404);
  });
});

describe('board ordering', () => {
  it('reorders within a column', async () => {
    expect(await columnTitles('Sprint 12', 'in_progress')).toEqual([
      'Fix login redirect loop',
      'Order history API',
    ]);
    const fix = await taskRow('Fix login redirect loop');
    const res = await move('Order history API', { afterId: fix.id }); // drop above "Fix login"
    expect(res.status).toBe(200);
    expect(await columnTitles('Sprint 12', 'in_progress')).toEqual([
      'Order history API',
      'Fix login redirect loop',
    ]);
  });

  it('drags a card into another column between two cards', async () => {
    const search = await taskRow('Search by order number');
    const res = await move('Fix login redirect loop', { statusKey: 'in_review', beforeId: search.id });
    expect(res.status).toBe(200);
    expect(await columnTitles('Sprint 12', 'in_review')).toEqual([
      'Search by order number',
      'Fix login redirect loop',
      'Email receipts',
    ]);
  });
});

describe('stale board state', () => {
  it('refuses neighbors that are no longer next to each other, and changes nothing', async () => {
    // Backlog's To Do column: Design password reset flow, Audit API rate limits, Add SSO login.
    expect(await columnTitles('Backlog', 'todo')).toEqual([
      'Design password reset flow',
      'Audit API rate limits',
      'Add SSO login',
    ]);
    const before = await taskRow('Migrate image storage');
    const res = await move('Migrate image storage', {
      statusKey: 'todo',
      beforeId: (await taskRow('Design password reset flow')).id,
      afterId: (await taskRow('Add SSO login')).id, // a client that missed "Audit API rate limits"
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STALE_PLACEMENT');
    expect(await taskRow('Migrate image storage')).toEqual(before);
  });
});

describe('listing tasks', () => {
  const allPages = async (url: string) => {
    const titles: string[] = [];
    let cursor: string | null = null;
    do {
      const res: { body: { data: { title: string }[]; page: { nextCursor: string | null } } } = await alice(
        'GET',
        `${url}&limit=3${cursor ? `&cursor=${cursor}` : ''}`,
      );
      titles.push(...res.body.data.map((t) => t.title));
      cursor = res.body.page.nextCursor;
    } while (cursor);
    return titles;
  };

  it('pages by due date, soonest first and undated last, without gaps or repeats', async () => {
    const titles = await allPages(`/lists/${await idOf('Sprint 12')}/tasks?sort=dueDate`);
    expect(titles).toHaveLength(7);
    expect(new Set(titles).size).toBe(7);
    expect(titles.slice(0, 4)).toEqual([
      'Fix login redirect loop',
      'Email receipts',
      'Order history API',
      'Checkout page redesign',
    ]);
  });

  it('sorts by priority, most urgent first', async () => {
    const res = await alice('GET', `/lists/${await idOf('Sprint 12')}/tasks?sort=priority`);
    expect(res.body.data.map((t: { priority: string }) => t.priority)).toEqual([
      'urgent',
      'urgent',
      'high',
      'high',
      'normal',
      'normal',
      'normal',
    ]);
  });

  it('returns 404 for a list that does not exist', async () => {
    const res = await alice('GET', '/lists/01a16a09-0000-7000-8000-000000000000/tasks');
    expect(res.status).toBe(404);
  });
});
