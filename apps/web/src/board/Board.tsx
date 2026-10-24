import { dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/extract-closest-edge';
import type { FieldDefinition, ResolvedStatus, Task, User } from '@flowboard/contracts';
import { Badge, Button, ColorSwatch, Group, Skeleton, Stack, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBoardTasks, useMoveTask } from '../api/queries.ts';
import { ErrorState } from '../shared/states.tsx';
import classes from './board.module.css';
import { placementAt } from './placement.ts';
import { type MoveCommand, TaskCard } from './TaskCard.tsx';

type Props = {
  listId: string;
  statuses: ResolvedStatus[];
  fields: FieldDefinition[];
  users: User[];
  onOpenTask: (taskId: string) => void;
  onAddTask: (statusKey: string) => void;
};

const byPosition = (a: Task, b: Task) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0);

/** Kanban board: one column per resolved status of the list, cards in position order. */
export function Board({ listId, statuses, fields, users, onOpenTask, onAddTask }: Props) {
  const tasks = useBoardTasks(listId);
  const { mutate: move } = useMoveTask(listId);

  const columns = useMemo(() => {
    const byStatus = new Map(statuses.map((s) => [s.key, [] as Task[]]));
    for (const task of tasks.data ?? []) byStatus.get(task.statusKey)?.push(task);
    for (const column of byStatus.values()) column.sort(byPosition);
    return byStatus;
  }, [statuses, tasks.data]);

  /** Puts a task at `index` of a column (counted without the task). One code path for drag and menu. */
  const moveTo = useCallback(
    (task: Task, statusKey: string, index: number) => {
      const current = columns.get(task.statusKey)!.findIndex((t) => t.id === task.id);
      if (statusKey === task.statusKey && index === current) return;
      const { beforeId, afterId, position } = placementAt(columns.get(statusKey) ?? [], task.id, index);
      move({
        task,
        body: { ...(statusKey !== task.statusKey && { statusKey }), beforeId, afterId },
        optimistic: { statusKey, position },
      });
    },
    [columns, move],
  );

  useEffect(
    () =>
      monitorForElements({
        canMonitor: ({ source }) => source.data.type === 'card',
        onDrop: ({ source, location }) => {
          const target = location.current.dropTargets[0]; // the innermost: a card, or a column's empty space
          const task = tasks.data?.find((t) => t.id === source.data.taskId);
          if (!target || !task) return;
          const statusKey = target.data.statusKey as string;
          const others = (columns.get(statusKey) ?? []).filter((t) => t.id !== task.id);
          let index = others.length;
          if (target.data.type === 'card') {
            const at = others.findIndex((t) => t.id === target.data.taskId);
            index = extractClosestEdge(target.data) === 'bottom' ? at + 1 : at;
          }
          moveTo(task, statusKey, index);
        },
      }),
    [columns, moveTo, tasks.data],
  );

  const runCommand = (task: Task, command: MoveCommand) => {
    const column = columns.get(task.statusKey)!;
    const index = column.findIndex((t) => t.id === task.id);
    if (command.kind === 'column')
      moveTo(task, command.statusKey, columns.get(command.statusKey)?.length ?? 0);
    else if (command.kind === 'up' && index > 0) moveTo(task, task.statusKey, index - 1);
    else if (command.kind === 'down' && index < column.length - 1) moveTo(task, task.statusKey, index + 1);
  };

  if (tasks.isError) return <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />;

  const chipField = fields.find((f) => f.type === 'single_select');
  return (
    <div className={classes.board}>
      {statuses.map((status) => {
        const column = columns.get(status.key) ?? [];
        return (
          <Column key={status.key} status={status} count={column.length} onAdd={() => onAddTask(status.key)}>
            {tasks.isPending ? (
              <Skeleton height={72} radius="md" />
            ) : column.length === 0 ? (
              <Text size="xs" c="dimmed" ta="center" py="md">
                No tasks
              </Text>
            ) : (
              column.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  users={users}
                  chipField={chipField}
                  otherStatuses={statuses.filter((s) => s.key !== task.statusKey)}
                  onOpen={() => onOpenTask(task.id)}
                  onMove={(command) => runCommand(task, command)}
                />
              ))
            )}
          </Column>
        );
      })}
    </div>
  );
}

type ColumnProps = { status: ResolvedStatus; count: number; onAdd: () => void; children: ReactNode };

function Column({ status, count, onAdd, children }: ColumnProps) {
  const ref = useRef<HTMLElement>(null);
  const [over, setOver] = useState(false);

  useEffect(
    () =>
      dropTargetForElements({
        element: ref.current!,
        canDrop: ({ source }) => source.data.type === 'card',
        getData: () => ({ type: 'column', statusKey: status.key }),
        onDragEnter: () => setOver(true),
        onDragLeave: () => setOver(false),
        onDrop: () => setOver(false),
      }),
    [status.key],
  );

  return (
    <section ref={ref} className={classes.column} data-over={over || undefined} aria-label={status.name}>
      <Group justify="space-between" px={4} pb="xs">
        <Group gap={6}>
          <ColorSwatch color={status.color} size={10} withShadow={false} />
          <Text size="sm" fw={600}>
            {status.name}
          </Text>
        </Group>
        <Badge size="xs" variant="light" color="gray">
          {count}
        </Badge>
      </Group>
      <Stack gap="xs">{children}</Stack>
      <Button
        variant="subtle"
        color="gray"
        size="xs"
        fullWidth
        mt="xs"
        leftSection={<IconPlus size={14} />}
        onClick={onAdd}
      >
        Add task
      </Button>
    </section>
  );
}
