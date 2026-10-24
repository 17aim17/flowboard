import type { FieldDefinition, ResolvedStatus, TaskSort, User } from '@flowboard/contracts';
import { Button, Center, Table, Text, UnstyledButton } from '@mantine/core';
import { IconArrowDown } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useTableTasks } from '../api/queries.ts';
import { Assignees, PriorityBadge, StatusBadge } from '../shared/badges.tsx';
import { formatFieldValue } from '../shared/field-format.ts';
import { EmptyState, ErrorState, LoadingState } from '../shared/states.tsx';

type Props = {
  listId: string;
  statuses: ResolvedStatus[];
  fields: FieldDefinition[];
  users: User[];
  sort: TaskSort;
  onSortChange: (sort: TaskSort) => void;
  onOpenTask: (taskId: string) => void;
};

/** List view: one row per task, custom fields as columns, sorted and paged by the server. */
export function TaskTable({ listId, statuses, fields, users, sort, onSortChange, onOpenTask }: Props) {
  const pages = useTableTasks(listId, sort);

  if (pages.isPending) return <LoadingState rows={8} />;
  if (pages.isError) return <ErrorState error={pages.error} onRetry={() => void pages.refetch()} />;

  const tasks = pages.data.pages.flatMap((page) => page.data);
  if (tasks.length === 0)
    return <EmptyState title="No tasks in this list yet">Add one from the board.</EmptyState>;

  // Clicking the active sort again goes back to board order.
  const toggle = (next: TaskSort) => onSortChange(sort === next ? 'position' : next);
  const statusOf = (key: string) => statuses.find((s) => s.key === key);

  return (
    <>
      <Table.ScrollContainer minWidth={900}>
        <Table highlightOnHover verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Title</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Assignees</Table.Th>
              <SortableHeader
                label="Priority"
                active={sort === 'priority'}
                onClick={() => toggle('priority')}
              />
              <SortableHeader
                label="Due date"
                active={sort === 'dueDate'}
                onClick={() => toggle('dueDate')}
              />
              {fields.map((field) => (
                <Table.Th key={field.key}>{field.name}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {tasks.map((task) => (
              <Table.Tr key={task.id} onClick={() => onOpenTask(task.id)} style={{ cursor: 'pointer' }}>
                <Table.Td>
                  <UnstyledButton onClick={() => onOpenTask(task.id)} fz="sm" fw={500}>
                    {task.title}
                  </UnstyledButton>
                </Table.Td>
                <Table.Td>
                  <StatusBadge status={statusOf(task.statusKey)} />
                </Table.Td>
                <Table.Td>
                  <Assignees ids={task.assigneeIds} users={users} />
                </Table.Td>
                <Table.Td>
                  <PriorityBadge priority={task.priority} />
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{task.dueDate ? dayjs(task.dueDate).format('MMM D, YYYY') : ''}</Text>
                </Table.Td>
                {fields.map((field) => (
                  <Table.Td key={field.key}>
                    <Text size="sm">{formatFieldValue(field, task.customFields[field.key])}</Text>
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {pages.hasNextPage && (
        <Center mt="md">
          <Button
            variant="light"
            loading={pages.isFetchingNextPage}
            onClick={() => void pages.fetchNextPage()}
          >
            Load more
          </Button>
        </Center>
      )}
    </>
  );
}

function SortableHeader({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <Table.Th aria-sort={active ? 'ascending' : 'none'}>
      <UnstyledButton onClick={onClick} fz="sm" fw={700}>
        {label} {active && <IconArrowDown size={12} aria-hidden />}
      </UnstyledButton>
    </Table.Th>
  );
}
