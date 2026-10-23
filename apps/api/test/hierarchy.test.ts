import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers.ts';

const { alice, idOf } = useTestApp();

const treeNames = async () => (await alice('GET', '/tree')).body.data.map((c: { name: string }) => c.name);

describe('hierarchy', () => {
  it('returns the tree flat, in depth-first order', async () => {
    expect(await treeNames()).toEqual([
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

  it('creates a list at the end of its folder', async () => {
    const res = await alice('POST', '/containers', {
      type: 'list',
      parentId: await idOf('Q4 Launch'),
      name: 'Sprint 13',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: 'list', name: 'Sprint 13', visibility: 'public' });
    const names = await treeNames();
    expect(names.indexOf('Sprint 13')).toBe(names.indexOf('Sprint 12') + 1);
  });

  it('rejects a container under the wrong parent type', async () => {
    const res = await alice('POST', '/containers', {
      type: 'folder',
      parentId: await idOf('Q4 Launch'),
      name: 'Nested',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      expect.objectContaining({ path: 'parentId', code: 'invalid_parent' }),
    ]);
  });

  it('reorders siblings', async () => {
    const res = await alice('POST', `/containers/${await idOf('Sprint 12')}/move`, {
      afterId: await idOf('Backlog'),
    });
    expect(res.status).toBe(200);
    const names = await treeNames();
    expect(names.indexOf('Sprint 12')).toBeLessThan(names.indexOf('Backlog'));
  });

  it('refuses a placement next to a container that is not a sibling', async () => {
    const res = await alice('POST', `/containers/${await idOf('Sprint 12')}/move`, {
      beforeId: await idOf('On-call'),
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STALE_PLACEMENT');
  });

  it('archives a folder: it and its lists disappear and read as 404', async () => {
    const backlog = await idOf('Backlog');
    expect((await alice('DELETE', `/containers/${await idOf('Q4 Launch')}`)).status).toBe(204);
    const names = await treeNames();
    expect(names).not.toContain('Q4 Launch');
    expect(names).not.toContain('Backlog');
    expect((await alice('GET', `/lists/${backlog}/resolved-statuses`)).status).toBe(404);
  });
});
