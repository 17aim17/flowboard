import type { Priority, ResolvedStatus, User } from '@flowboard/contracts';
import { Avatar, Badge, Tooltip } from '@mantine/core';
import dayjs from 'dayjs';

const priorityColor: Record<Priority, string> = {
  urgent: 'red',
  high: 'orange',
  normal: 'blue',
  low: 'gray',
  none: 'gray',
};

export const priorityLabel: Record<Priority, string> = {
  urgent: 'Urgent',
  high: 'High',
  normal: 'Normal',
  low: 'Low',
  none: 'No priority',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === 'none') return null;
  return (
    <Badge size="xs" variant="light" color={priorityColor[priority]}>
      {priorityLabel[priority]}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: ResolvedStatus | undefined }) {
  if (!status) return null;
  return (
    <Badge size="sm" variant="light" color={status.color} styles={{ label: { textTransform: 'none' } }}>
      {status.name}
    </Badge>
  );
}

export function Assignees({ ids, users }: { ids: string[]; users: User[] }) {
  if (ids.length === 0) return null;
  const assigned = users.filter((u) => ids.includes(u.id));
  return (
    <Avatar.Group spacing="xs">
      {assigned.map((user) => (
        <Tooltip key={user.id} label={user.name} withArrow>
          <Avatar size="sm" radius="xl" color="initials" name={user.name} />
        </Tooltip>
      ))}
    </Avatar.Group>
  );
}

/** Due date as "Oct 30", red when it has passed. */
export function DueDate({ value }: { value: string | null }) {
  if (!value) return null;
  const due = dayjs(value);
  const overdue = due.isBefore(dayjs());
  return (
    <Badge size="xs" variant="outline" color={overdue ? 'red' : 'gray'}>
      {due.format('MMM D')}
    </Badge>
  );
}
