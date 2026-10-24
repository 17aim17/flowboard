import type { Task } from '@flowboard/contracts';
import { generateKeyBetween } from 'fractional-indexing';

/**
 * Where a card lands when dropped at `index` in a column (index counted without the card itself):
 * the cards that end up directly above and below it, and a provisional position for the optimistic
 * update. The server computes the real position from the same neighbors.
 */
export function placementAt(column: Task[], taskId: string, index: number) {
  const others = column.filter((t) => t.id !== taskId);
  const above = others[index - 1];
  const below = others[index];
  return {
    beforeId: above?.id,
    afterId: below?.id,
    position: generateKeyBetween(above?.position ?? null, below?.position ?? null),
  };
}
