import { TaskSort } from '@flowboard/contracts';
import { Breadcrumbs, Group, SegmentedControl, Stack, Text, Title } from '@mantine/core';
import { useParams, useSearchParams } from 'react-router';
import { useFields, useStatuses, useTree, useUsers } from '../api/queries.ts';
import { Board } from '../board/Board.tsx';
import { pathTo } from '../sidebar/tree.ts';
import { ErrorState, LoadingState } from '../shared/states.tsx';
import { TaskTable } from '../table/TaskTable.tsx';
import { TaskDrawer } from '../task/TaskDrawer.tsx';

/**
 * One list, as a board or a table. The view, table sort and open task live in the URL
 * (?view=table&sort=dueDate&task=<id>), so refresh and shared links show the same thing.
 */
export function ListPage() {
  const { listId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tree = useTree();
  const statuses = useStatuses(listId);
  const fields = useFields(listId);
  const users = useUsers();

  const view = params.get('view') === 'table' ? 'table' : 'board';
  const sort = TaskSort.catch('position').parse(params.get('sort'));
  const update = (changes: Record<string, string | null>) =>
    setParams((current) => {
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) current.delete(key);
        else current.set(key, value);
      }
      return current;
    });

  const path = pathTo(tree.data ?? [], listId);
  const list = { listId, statuses: statuses.data, fields: fields.data, users: users.data };
  const error = statuses.error ?? fields.error ?? users.error;
  if (error) return <ErrorState error={error} onRetry={() => void statuses.refetch()} />;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Breadcrumbs separator="/">
            {path.slice(0, -1).map((c) => (
              <Text key={c.id} size="xs" c="dimmed">
                {c.name}
              </Text>
            ))}
          </Breadcrumbs>
          <Title order={2}>{path.at(-1)?.name ?? ''}</Title>
        </div>
        <SegmentedControl
          value={view}
          onChange={(next) => update({ view: next === 'table' ? 'table' : null })}
          data={[
            { value: 'board', label: 'Board' },
            { value: 'table', label: 'List' },
          ]}
        />
      </Group>

      {!list.statuses || !list.fields || !list.users ? (
        <LoadingState rows={6} />
      ) : (
        <>
          {view === 'board' ? (
            <Board
              listId={listId}
              statuses={list.statuses}
              fields={list.fields}
              users={list.users}
              onOpenTask={(id) => update({ task: id, new: null })}
              onAddTask={(statusKey) => update({ new: statusKey, task: null })}
            />
          ) : (
            <TaskTable
              listId={listId}
              statuses={list.statuses}
              fields={list.fields}
              users={list.users}
              sort={sort}
              onSortChange={(next) => update({ sort: next === 'position' ? null : next })}
              onOpenTask={(id) => update({ task: id, new: null })}
            />
          )}
          <TaskDrawer
            listId={listId}
            statuses={list.statuses}
            fields={list.fields}
            users={list.users}
            taskId={params.get('task')}
            newStatusKey={params.get('new')}
            onClose={() => update({ task: null, new: null })}
          />
        </>
      )}
    </Stack>
  );
}
