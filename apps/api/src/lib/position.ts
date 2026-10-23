import { generateKeyBetween } from 'fractional-indexing';
import { conflict } from './errors.ts';

type Sibling = { id: string; position: string };
export type Placement = { beforeId?: string | null | undefined; afterId?: string | null | undefined };

/**
 * Returns a position string for an item placed among `siblings` (sorted, not including the item).
 * beforeId is the sibling that ends up directly above the item, afterId the one directly below.
 * Send either or both; send neither to append at the end.
 */
export function placeAmong(siblings: Sibling[], { beforeId, afterId }: Placement): string {
  const indexOf = (id: string) => {
    const index = siblings.findIndex((s) => s.id === id);
    if (index === -1) throw stale(`${id} is not a sibling here`);
    return index;
  };

  if (beforeId) {
    const index = indexOf(beforeId);
    const below = siblings[index + 1];
    if (afterId && afterId !== below?.id) throw stale(`${beforeId} and ${afterId} are not next to each other`);
    return generateKeyBetween(siblings[index]!.position, below?.position ?? null);
  }
  if (afterId) {
    const index = indexOf(afterId);
    return generateKeyBetween(siblings[index - 1]?.position ?? null, siblings[index]!.position);
  }
  return generateKeyBetween(siblings.at(-1)?.position ?? null, null);
}

const stale = (reason: string) =>
  conflict('STALE_PLACEMENT', `Can't place the item there: ${reason}. Reload and try again.`);
