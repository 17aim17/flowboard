import { describe, expect, it } from 'vitest';
import { countTasksWithField } from '../src/modules/tasks/usage.ts';
import { useTestApp } from './helpers.ts';

const { ctx, alice, idOf } = useTestApp();

type Field = { id: string; key: string; type: string; options: { id: string; label: string }[] };

const resolvedKeys = async (list: string) =>
  (await alice('GET', `/lists/${await idOf(list)}/resolved-fields`)).body.data.map((f: Field) => f.key);
const field = async (key: string): Promise<Field> =>
  await ctx.db
    .selectFrom('field_definitions')
    .select(['id', 'key', 'type', 'options'])
    .where('key', '=', key)
    .executeTakeFirstOrThrow();

describe('custom field schema', () => {
  it('resolves space, then folder, then list fields', async () => {
    expect(await resolvedKeys('Sprint 12')).toEqual(['estimate', 'severity', 'component', 'needs_qa']);
    expect(await resolvedKeys('Backlog')).toEqual(['estimate', 'severity', 'component']);
    expect(await resolvedKeys('Launch Content')).toEqual(['channel', 'publish_date']);
  });

  it('creates a field that applies to its container only and lower', async () => {
    const res = await alice('POST', `/containers/${await idOf('Backlog')}/fields`, {
      key: 'risk',
      name: 'Risk',
      type: 'single_select',
      options: [{ label: 'Low' }, { id: 'high', label: 'High' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.options).toEqual([
      { id: expect.stringMatching(/^opt_/), label: 'Low' },
      { id: 'high', label: 'High' },
    ]);
    expect(await resolvedKeys('Backlog')).toContain('risk');
    expect(await resolvedKeys('Sprint 12')).not.toContain('risk');
  });

  it('refuses a key that already exists anywhere in the workspace', async () => {
    const res = await alice('POST', `/containers/${await idOf('Launch Content')}/fields`, {
      key: 'estimate',
      name: 'Estimate',
      type: 'text',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('FIELD_KEY_TAKEN');
  });

  it('refuses a select field without options', async () => {
    const res = await alice('POST', `/containers/${await idOf('Backlog')}/fields`, {
      key: 'risk',
      name: 'Risk',
      type: 'single_select',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('options');
  });
});

describe('changing fields that tasks use (T8)', () => {
  it('refuses a type change while tasks have values, allows it when unused', async () => {
    const inUse = await alice('PATCH', `/fields/${(await field('estimate')).id}`, { type: 'text' });
    expect(inUse.status).toBe(409);
    expect(inUse.body.error.code).toBe('FIELD_IN_USE');

    const created = await alice('POST', `/containers/${await idOf('Backlog')}/fields`, {
      key: 'notes',
      name: 'Notes',
      type: 'text',
    });
    const changed = await alice('PATCH', `/fields/${created.body.id}`, { type: 'number' });
    expect(changed.status).toBe(200);
    expect(changed.body.type).toBe('number');
  });

  it('refuses to remove a select option that tasks use, allows removing an unused one', async () => {
    const severity = await field('severity');
    const withoutCritical = severity.options.filter((o) => o.id !== 'critical');
    const refused = await alice('PATCH', `/fields/${severity.id}`, { options: withoutCritical });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatchObject({
      code: 'FIELD_OPTION_IN_USE',
      details: [{ optionId: 'critical', taskCount: 2 }],
    });

    await alice('PATCH', `/fields/${severity.id}`, {
      options: [...severity.options, { id: 'unused', label: 'Unused' }],
    });
    expect((await alice('PATCH', `/fields/${severity.id}`, { options: severity.options })).status).toBe(200);
  });

  it('deleting a field hides it but keeps task values, and the key stays reserved', async () => {
    const needsQa = await field('needs_qa');
    expect((await alice('DELETE', `/fields/${needsQa.id}`)).status).toBe(204);
    expect(await resolvedKeys('Sprint 12')).not.toContain('needs_qa');

    expect(await countTasksWithField(ctx.db, 'needs_qa')).toBeGreaterThan(0);

    const reuse = await alice('POST', `/containers/${await idOf('Sprint 12')}/fields`, {
      key: 'needs_qa',
      name: 'QA',
      type: 'text',
    });
    expect(reuse.status).toBe(409);
  });
});
