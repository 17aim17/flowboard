import { z } from 'zod';
import { Color, ContainerType, Id, Key, StatusCategory } from './common.ts';

/**
 * A status row stored on one container. Either an origin (defines a new key, all columns set)
 * or an override of an inherited key (only the changed columns set, category always null).
 */
export const StatusDefinition = z.object({
  id: Id,
  containerId: Id,
  key: Key,
  name: z.string().nullable(),
  category: StatusCategory.nullable(),
  color: z.string().nullable(),
  position: z.string().nullable(),
  hidden: z.boolean(),
});
export type StatusDefinition = z.infer<typeof StatusDefinition>;

/** A status as a list actually sees it, after merging every level of its path. */
export const ResolvedStatus = z.object({
  id: Id,
  key: Key,
  name: z.string(),
  category: StatusCategory,
  color: z.string(),
  position: z.string(),
  ownerType: ContainerType,
  ownerId: Id,
  overriddenBy: Id.nullable(),
});
export type ResolvedStatus = z.infer<typeof ResolvedStatus>;

export const ContainerStatuses = z.object({
  local: z.array(StatusDefinition),
  resolved: z.array(ResolvedStatus),
});

/**
 * Set this container's definition for a key. For a new key, name, category and color are required.
 * For an inherited key, only name, color, hidden and placement may be set; category stays inherited.
 * Placement (beforeKey/afterKey) keeps the current position when omitted.
 */
export const PutStatusBody = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  category: StatusCategory.optional(),
  color: Color.optional(),
  hidden: z.boolean().default(false),
  beforeKey: Key.nullish(),
  afterKey: Key.nullish(),
});
export type PutStatusBody = z.infer<typeof PutStatusBody>;
