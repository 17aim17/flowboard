import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { attachClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/attach-closest-edge';
import { extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/extract-closest-edge';
import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/types';
import type { FieldDefinition, ResolvedStatus, Task, User } from '@flowboard/contracts';
import { ActionIcon, Badge, Card, Group, Menu, Stack, Text } from '@mantine/core';
import { IconDots } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { Assignees, DueDate, PriorityBadge } from '../shared/badges.tsx';
import classes from './board.module.css';

export type MoveCommand = { kind: 'up' } | { kind: 'down' } | { kind: 'column'; statusKey: string };

type Props = {
  task: Task;
  users: User[];
  chipField: FieldDefinition | undefined;
  otherStatuses: ResolvedStatus[];
  onOpen: () => void;
  onMove: (command: MoveCommand) => void;
};

/** A draggable card. Keyboard users move it with the "..." menu instead of dragging. */
export function TaskCard({ task, users, chipField, otherStatuses, onOpen, onMove }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [edge, setEdge] = useState<Edge | null>(null);

  useEffect(() => {
    const element = ref.current!;
    const data = { type: 'card', taskId: task.id, statusKey: task.statusKey };
    return combine(
      draggable({
        element,
        getInitialData: () => data,
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => source.data.type === 'card' && source.data.taskId !== task.id,
        getData: ({ input }) => attachClosestEdge(data, { element, input, allowedEdges: ['top', 'bottom'] }),
        onDrag: ({ self }) => setEdge(extractClosestEdge(self.data)),
        onDragLeave: () => setEdge(null),
        onDrop: () => setEdge(null),
      }),
    );
  }, [task.id, task.statusKey]);

  const chip = chipField && chipLabel(chipField, task.customFields[chipField.key]);

  return (
    <div ref={ref} className={classes.cardWrapper} data-dragging={dragging || undefined}>
      {edge && <div className={classes.dropLine} data-edge={edge} />}
      <Card
        withBorder
        padding="sm"
        radius="md"
        className={classes.card}
        role="button"
        tabIndex={0}
        aria-label={`Open ${task.title}`}
        onClick={onOpen}
        onKeyDown={(event) => event.key === 'Enter' && onOpen()}
      >
        <Stack gap={6}>
          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <Text size="sm" fw={500} lineClamp={3}>
              {task.title}
            </Text>
            <CardMenu title={task.title} otherStatuses={otherStatuses} onMove={onMove} />
          </Group>
          <Group gap={6}>
            <PriorityBadge priority={task.priority} />
            <DueDate value={task.dueDate} />
            {chip && (
              <Badge
                size="xs"
                variant="dot"
                color={chip.color ?? 'gray'}
                styles={{ label: { textTransform: 'none' } }}
              >
                {chip.label}
              </Badge>
            )}
          </Group>
          <Assignees ids={task.assigneeIds} users={users} />
        </Stack>
      </Card>
    </div>
  );
}

function CardMenu({
  title,
  otherStatuses,
  onMove,
}: Pick<Props, 'otherStatuses' | 'onMove'> & { title: string }) {
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          size="sm"
          color="gray"
          aria-label={`Move ${title}`}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <IconDots size={14} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
        <Menu.Item onClick={() => onMove({ kind: 'up' })}>Move up</Menu.Item>
        <Menu.Item onClick={() => onMove({ kind: 'down' })}>Move down</Menu.Item>
        <Menu.Divider />
        <Menu.Label>Move to</Menu.Label>
        {otherStatuses.map((status) => (
          <Menu.Item key={status.key} onClick={() => onMove({ kind: 'column', statusKey: status.key })}>
            {status.name}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

/** The card shows the first select field as a chip, e.g. "Severity: High". */
function chipLabel(field: FieldDefinition, value: unknown) {
  const option = field.options.find((o) => o.id === value);
  return option && { label: `${field.name}: ${option.label}`, color: option.color };
}
