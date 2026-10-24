import { notifications } from '@mantine/notifications';
import { ApiError } from '../api/client.ts';

export function notifyError(error: unknown, title: string) {
  // Both mean the board was out of date: someone changed the task, or the cards around it, first.
  const conflict = error instanceof ApiError && ['VERSION_CONFLICT', 'STALE_PLACEMENT'].includes(error.code);
  notifications.show({
    color: 'red',
    title: conflict ? 'Someone else just changed this task' : title,
    message: conflict ? 'The board was reloaded with their changes. Try again.' : describeError(error),
  });
}

export function describeError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Network error. Check your connection and try again.';
  return error.requestId ? `${error.message} (request ${error.requestId.slice(0, 8)})` : error.message;
}
