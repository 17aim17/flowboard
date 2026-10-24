import { Alert, Button, Center, Skeleton, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { ApiError } from '../api/client.ts';
import { describeError } from './notify.ts';

export function LoadingState({ rows = 4 }: { rows?: number }) {
  return (
    <Stack gap="xs" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={36} radius="sm" />
      ))}
    </Stack>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Center py="xl">
      <Stack align="center" gap={4}>
        <Text fw={500}>{title}</Text>
        {children && (
          <Text size="sm" c="dimmed">
            {children}
          </Text>
        )}
      </Stack>
    </Center>
  );
}

/** Explains a failed request. 403 and 404 get their own wording; other errors offer a retry. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (error instanceof ApiError && error.status === 403) {
    return <EmptyState title="You don't have access to this">Ask an admin to share it with you.</EmptyState>;
  }
  if (error instanceof ApiError && error.status === 404) {
    return <EmptyState title="Not found">It may have been archived or deleted.</EmptyState>;
  }
  return (
    <Alert color="red" title="Something went wrong">
      <Stack gap="xs" align="flex-start">
        <Text size="sm">{describeError(error)}</Text>
        {onRetry && (
          <Button size="xs" variant="light" color="red" onClick={onRetry}>
            Try again
          </Button>
        )}
      </Stack>
    </Alert>
  );
}
