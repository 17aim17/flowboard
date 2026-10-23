import { describe, expect, it } from 'vitest';
import { missingCategories, resolveStatuses, type StatusLevel } from './resolve.ts';

let nextId = 0;
const origin = (key: string, category: 'not_started' | 'active' | 'done' | 'closed', position: string) => ({
  id: `row-${nextId++}`,
  key,
  name: key.toUpperCase(),
  category,
  color: '#000000',
  position,
  hidden: false,
});
const override = (key: string, changes: { name?: string; color?: string; position?: string; hidden?: boolean }) => ({
  id: `row-${nextId++}`,
  key,
  name: changes.name ?? null,
  category: null,
  color: changes.color ?? null,
  position: changes.position ?? null,
  hidden: changes.hidden ?? false,
});

const workspace: StatusLevel = {
  container: { id: 'w', type: 'workspace' },
  rows: [origin('todo', 'not_started', 'a0'), origin('doing', 'active', 'a1'), origin('done', 'done', 'a2')],
};
const level = (id: string, type: 'space' | 'folder' | 'list', rows: StatusLevel['rows']): StatusLevel => ({
  container: { id, type },
  rows,
});
const keys = (levels: StatusLevel[]) => resolveStatuses(levels).map((s) => s.key);

describe('resolveStatuses', () => {
  it('inherits the workspace defaults when nothing below changes them', () => {
    expect(keys([workspace, level('s', 'space', []), level('l', 'list', [])])).toEqual(['todo', 'doing', 'done']);
  });

  it('adds a new key in position order', () => {
    expect(keys([workspace, level('l', 'list', [origin('review', 'active', 'a1V')])])).toEqual([
      'todo',
      'doing',
      'review',
      'done',
    ]);
  });

  it('overrides name and position but keeps category and origin', () => {
    const [done] = resolveStatuses([
      workspace,
      level('l', 'list', [override('done', { name: 'Shipped', position: 'Zz' })]),
    ]);
    expect(done).toMatchObject({ key: 'done', name: 'Shipped', category: 'done', ownerId: 'w', overriddenBy: 'l' });
  });

  it('hides an inherited key, and a lower level can show it again', () => {
    const folder = level('f', 'folder', [override('doing', { hidden: true })]);
    expect(keys([workspace, folder])).toEqual(['todo', 'done']);
    expect(keys([workspace, folder, level('l', 'list', [override('doing', {})])])).toEqual(['todo', 'doing', 'done']);
  });

  it('gives sibling lists different sets from the same parents', () => {
    const folder = level('f', 'folder', []);
    expect(keys([workspace, folder, level('a', 'list', [])])).toEqual(['todo', 'doing', 'done']);
    expect(keys([workspace, folder, level('b', 'list', [origin('qa', 'active', 'a1V')])])).toEqual([
      'todo',
      'doing',
      'qa',
      'done',
    ]);
  });

  it('reports which required categories a set is missing', () => {
    const resolved = resolveStatuses([workspace, level('l', 'list', [override('done', { hidden: true })])]);
    expect(missingCategories(resolved)).toEqual(['done']);
  });

  it('refuses an override row with nothing above it', () => {
    expect(() => resolveStatuses([level('l', 'list', [override('ghost', { name: 'Ghost' })])])).toThrow(/ghost/);
  });
});
