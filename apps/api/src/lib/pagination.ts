import type { z } from 'zod';
import { invalid } from './errors.ts';

/** Cursors are opaque to clients: base64url JSON of the last row's sort values. */
export const encodeCursor = (values: unknown): string =>
  Buffer.from(JSON.stringify(values)).toString('base64url');

export function decodeCursor<T>(cursor: string, schema: z.ZodType<T>): T {
  try {
    return schema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString()));
  } catch {
    throw invalid('query.cursor', 'invalid_cursor', 'Invalid cursor');
  }
}

/** Callers fetch limit + 1 rows; the extra row only tells us whether another page exists. */
export function toPage<T>(rows: T[], limit: number, cursorOf: (row: T) => unknown) {
  const data = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  return {
    data,
    page: { limit, hasMore, nextCursor: hasMore ? encodeCursor(cursorOf(data.at(-1)!)) : null },
  };
}
