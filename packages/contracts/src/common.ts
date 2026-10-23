import { z } from 'zod';

export const ContainerType = z.enum(['workspace', 'space', 'folder', 'list']);
export type ContainerType = z.infer<typeof ContainerType>;

export const Visibility = z.enum(['public', 'private']);
export type Visibility = z.infer<typeof Visibility>;

export const UserRole = z.enum(['admin', 'member']);
export type UserRole = z.infer<typeof UserRole>;

export const GrantMode = z.enum(['allow', 'deny']);
export type GrantMode = z.infer<typeof GrantMode>;

export const StatusCategory = z.enum(['not_started', 'active', 'done', 'closed']);
export type StatusCategory = z.infer<typeof StatusCategory>;

export const FieldType = z.enum(['text', 'number', 'single_select', 'multi_select', 'date', 'checkbox']);
export type FieldType = z.infer<typeof FieldType>;

// Most to least urgent. The Postgres enum is declared in the same order, so ORDER BY priority sorts by urgency.
export const Priority = z.enum(['urgent', 'high', 'normal', 'low', 'none']);
export type Priority = z.infer<typeof Priority>;

export const Id = z.uuid();

/** Stable machine name for statuses and custom fields, e.g. "in_review". */
export const Key = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,39}$/, 'Use lowercase letters, digits and _, starting with a letter (max 40)');

export const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex color like #3B82F6');

/** Where to place an item among its siblings: between beforeId (above) and afterId (below). */
export const Placement = z.object({
  beforeId: Id.nullish(),
  afterId: Id.nullish(),
});

export const ErrorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.record(z.string(), z.unknown())).optional(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

/** One validation problem, pointing at the offending input, e.g. path "customFields.estimate". */
export type ValidationIssue = { path: string; code: string; message: string };

export const User = z.object({
  id: Id,
  handle: z.string(),
  name: z.string(),
  role: UserRole,
});
export type User = z.infer<typeof User>;
