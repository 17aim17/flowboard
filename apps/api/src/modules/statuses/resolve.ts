import type { ContainerType, ResolvedStatus, StatusCategory } from '@flowboard/contracts';
import type { StatusRow } from '../../db/types.ts';

export type StatusLevel = {
  container: { id: string; type: ContainerType };
  rows: Pick<StatusRow, 'id' | 'key' | 'name' | 'category' | 'color' | 'position' | 'hidden'>[];
};

type Entry = ResolvedStatus & { hidden: boolean };

export const REQUIRED_CATEGORIES: StatusCategory[] = ['not_started', 'active', 'done'];

/**
 * Merge by key, walking the path from the workspace down (docs/DESIGN.md section 5):
 * a key not seen above is added; a key seen above is overridden (name, color, position) or hidden.
 * Category always comes from the row that first defined the key. Hidden keys stay in the map so a
 * lower level can override them again (which shows them); `resolveStatuses` drops them.
 */
export function mergeStatuses(levels: StatusLevel[]): Map<string, Entry> {
  const merged = new Map<string, Entry>();
  for (const { container, rows } of levels) {
    for (const row of rows) {
      const inherited = merged.get(row.key);
      if (inherited) {
        merged.set(row.key, {
          ...inherited,
          name: row.name ?? inherited.name,
          color: row.color ?? inherited.color,
          position: row.position ?? inherited.position,
          hidden: row.hidden,
          overriddenBy: container.id,
        });
      } else if (row.name && row.category && row.color && row.position) {
        merged.set(row.key, {
          id: row.id,
          key: row.key,
          name: row.name,
          category: row.category,
          color: row.color,
          position: row.position,
          ownerType: container.type,
          ownerId: container.id,
          overriddenBy: null,
          hidden: row.hidden,
        });
      } else {
        // Writes never allow this (an override with nothing above it to override).
        throw new Error(`Status "${row.key}" on container ${container.id} overrides a key nothing above defines`);
      }
    }
  }
  return merged;
}

/** The statuses a container shows, in board order. For a list, these are its kanban columns. */
export function resolveStatuses(levels: StatusLevel[]): ResolvedStatus[] {
  return [...mergeStatuses(levels).values()]
    .filter((status) => !status.hidden)
    .sort((a, b) => compare(a.position, b.position) || compare(a.key, b.key))
    .map(({ hidden: _hidden, ...status }) => status);
}

// Byte order, matching the COLLATE "C" position columns in Postgres.
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export const missingCategories = (statuses: ResolvedStatus[]): StatusCategory[] =>
  REQUIRED_CATEGORIES.filter((category) => !statuses.some((s) => s.category === category));
