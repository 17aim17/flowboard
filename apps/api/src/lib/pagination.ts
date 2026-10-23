import { z } from 'zod';
import { invalid } from './errors.ts';

export const PageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

/** Cursors are opaque to clients: base64url JSON of the last row's sort values. */
export const encodeCursor = (values: unknown): string =>
  Buffer.from(JSON.stringify(values)).toString('base64url');

export function decodeCursor<T>(cursor: string, schema: z.ZodType<T>): T {
  try {
    return schema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString()));
  } catch {
    throw invalid('cursor', 'invalid_cursor', 'Invalid cursor');
  }
}

/** Fetch limit + 1 rows; the extra row only tells us whether another page exists. */
export function toPage<T>(rows: T[], limit: number, cursorOf: (row: T) => unknown) {
  const data = rows.slice(0, limit);
  const last = data.at(-1);
  return { data, nextCursor: rows.length > limit && last ? encodeCursor(cursorOf(last)) : null };
}
