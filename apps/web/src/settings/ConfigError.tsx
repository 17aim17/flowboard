import { Alert, Anchor, List, Text } from '@mantine/core';
import { Link } from 'react-router';
import { ApiError } from '../api/client.ts';
import { describeError } from '../shared/notify.ts';

type Detail = Record<string, unknown>;

/**
 * Shows why the server refused a config change, with the details it sent: which lists would break,
 * how many tasks use a status or option, or which input is wrong.
 */
export function ConfigError({
  error,
  nameOf,
  onClose,
}: {
  error: unknown;
  nameOf: (containerId: string) => string;
  onClose?: () => void;
}) {
  const details = error instanceof ApiError ? error.details : [];
  return (
    <Alert
      color="red"
      title={error instanceof ApiError ? error.message : 'Request failed'}
      withCloseButton={onClose !== undefined}
      onClose={onClose}
    >
      {!(error instanceof ApiError) ? (
        <Text size="sm">{describeError(error)}</Text>
      ) : details.length === 0 ? (
        error.requestId && (
          <Text size="xs" c="dimmed">
            Request {error.requestId.slice(0, 8)}
          </Text>
        )
      ) : (
        <List size="sm">
          {details.map((detail, index) => (
            <List.Item key={index}>
              <DetailLine detail={detail} nameOf={nameOf} />
            </List.Item>
          ))}
        </List>
      )}
    </Alert>
  );
}

function DetailLine({ detail, nameOf }: { detail: Detail; nameOf: (containerId: string) => string }) {
  const str = (key: string) => String(detail[key]);
  const listLink = typeof detail.listId === 'string' && (
    <Anchor component={Link} to={`/lists/${detail.listId}`} size="sm">
      {str('listName')}
    </Anchor>
  );

  if (typeof detail.path === 'string') return <>{`${str('path')}: ${str('message')}`}</>;
  if (Array.isArray(detail.missingCategories))
    return (
      <>
        {listLink}: would have no {detail.missingCategories.join(', ').replaceAll('_', ' ')} status
      </>
    );
  if (typeof detail.statusKey === 'string')
    return (
      <>
        {listLink}: {str('taskCount')} task(s) in “{str('statusKey')}”
      </>
    );
  if (typeof detail.optionId === 'string')
    return <>{`Option “${str('optionId')}” is used by ${str('taskCount')} task(s)`}</>;
  if (typeof detail.containerId === 'string') return <>Also set on {nameOf(detail.containerId)}</>;
  if (typeof detail.taskCount === 'number') return <>{`${str('taskCount')} task(s) have a value`}</>;
  return <>{JSON.stringify(detail)}</>;
}
