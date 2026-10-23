import type { User } from '@flowboard/contracts';
import { forbidden } from '../../lib/errors.ts';

/** Containers, statuses, fields and grants are admin-only (decision D-13). */
export function assertAdmin(user: User): void {
  if (user.role !== 'admin')
    throw forbidden('Only admins can change containers, statuses, fields and grants');
}
