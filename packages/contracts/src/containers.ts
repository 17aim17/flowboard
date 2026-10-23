import { z } from 'zod';
import { ContainerType, Id, Placement, Visibility } from './common.ts';

export const Container = z.object({
  id: Id,
  type: ContainerType,
  parentId: Id.nullable(),
  name: z.string(),
  position: z.string(),
  visibility: Visibility,
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Container = z.infer<typeof Container>;

const Name = z.string().trim().min(1).max(200);

export const CreateContainerBody = z.object({
  type: z.enum(['space', 'folder', 'list']),
  parentId: Id,
  name: Name,
  visibility: Visibility.default('public'),
});
export type CreateContainerBody = z.infer<typeof CreateContainerBody>;

export const UpdateContainerBody = z
  .object({ name: Name, visibility: Visibility })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Send at least one field');
export type UpdateContainerBody = z.infer<typeof UpdateContainerBody>;

/** Reorder among siblings, and optionally move under a new parent of the right type. */
export const MoveContainerBody = Placement.extend({ parentId: Id.optional() });
export type MoveContainerBody = z.infer<typeof MoveContainerBody>;
