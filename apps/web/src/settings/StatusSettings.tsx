import type { PutStatusBody, ResolvedStatus, StatusCategory, StatusDefinition } from '@flowboard/contracts';
import {
  ActionIcon,
  Badge,
  Button,
  ColorInput,
  ColorSwatch,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  IconArrowDown,
  IconArrowUp,
  IconEye,
  IconEyeOff,
  IconPencil,
  IconRestore,
  IconTrash,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useContainerStatuses, useDeleteStatus, usePutStatus } from '../api/queries.ts';
import { ErrorState, LoadingState } from '../shared/states.tsx';
import { ConfigError } from './ConfigError.tsx';
import { toKey } from './key.ts';

export const categoryLabel: Record<StatusCategory, string> = {
  not_started: 'Not started',
  active: 'Active',
  done: 'Done',
  closed: 'Closed',
};
const categoryOptions = Object.entries(categoryLabel).map(([value, label]) => ({ value, label }));
const SWATCHES = ['#94A3B8', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#22C55E', '#14B8A6', '#64748B'];

type Props = { containerId: string; isList: boolean; nameOf: (containerId: string) => string };

/**
 * The statuses this level shows after inheritance, with where each comes from. Changes made here
 * apply to this container and everything below it (docs/DESIGN.md section 5).
 */
export function StatusSettings({ containerId, isList, nameOf }: Props) {
  const statuses = useContainerStatuses(containerId);
  const put = usePutStatus(containerId);
  const remove = useDeleteStatus(containerId);
  const [editing, setEditing] = useState<ResolvedStatus | 'new' | null>(null);
  const [error, setError] = useState<unknown>(null);

  if (statuses.isPending) return <LoadingState rows={5} />;
  if (statuses.isError) return <ErrorState error={statuses.error} onRetry={() => void statuses.refetch()} />;

  const { local, resolved } = statuses.data;
  const localRow = (key: string) => local.find((row) => row.key === key);
  const hiddenHere = local.filter((row) => row.hidden);
  const onError = { onError: setError, onSuccess: () => setError(null) };

  /** PUT replaces this level's row, so resend what it already sets along with the change. */
  const save = (status: ResolvedStatus, changes: Partial<PutStatusBody>) =>
    put.mutate(
      { key: status.key, body: { ...currentBody(status, localRow(status.key), containerId), ...changes } },
      onError,
    );

  const move = (index: number, offset: -1 | 1) => {
    const neighbor = resolved[index + offset]!;
    save(resolved[index]!, offset === -1 ? { afterKey: neighbor.key } : { beforeKey: neighbor.key });
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          Changes here apply to {nameOf(containerId)}
          {isList ? '' : ' and every list inside it'}.
        </Text>
        <Button size="xs" onClick={() => setEditing('new')}>
          Add status
        </Button>
      </Group>

      {error !== null && editing === null && (
        <ConfigError error={error} nameOf={nameOf} onClose={() => setError(null)} />
      )}

      <Table verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Status</Table.Th>
            <Table.Th>Category</Table.Th>
            <Table.Th>Comes from</Table.Th>
            <Table.Th w={190} aria-label="Actions" />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {resolved.map((status, index) => {
            const definedHere = status.ownerId === containerId;
            const changedHere = !definedHere && localRow(status.key) !== undefined;
            return (
              <Table.Tr key={status.key}>
                <Table.Td>
                  <Group gap="xs">
                    <ColorSwatch color={status.color} size={12} withShadow={false} />
                    <Text size="sm">{status.name}</Text>
                    <Text size="xs" c="dimmed">
                      {status.key}
                    </Text>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Badge size="sm" variant="light" color="gray">
                    {categoryLabel[status.category]}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {definedHere ? 'Defined here' : nameOf(status.ownerId)}
                    {changedHere && (
                      <Text span size="xs" c="blue" ml={6}>
                        changed here
                      </Text>
                    )}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap={4} justify="flex-end" wrap="nowrap">
                    <Action
                      label={`Move ${status.name} up`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <IconArrowUp size={16} />
                    </Action>
                    <Action
                      label={`Move ${status.name} down`}
                      disabled={index === resolved.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <IconArrowDown size={16} />
                    </Action>
                    <Action label={`Edit ${status.name}`} onClick={() => setEditing(status)}>
                      <IconPencil size={16} />
                    </Action>
                    {changedHere && (
                      <Action
                        label={`Undo changes to ${status.name}`}
                        onClick={() => remove.mutate(status.key, onError)}
                      >
                        <IconRestore size={16} />
                      </Action>
                    )}
                    {definedHere ? (
                      <Action
                        label={`Delete ${status.name}`}
                        color="red"
                        onClick={() => remove.mutate(status.key, onError)}
                      >
                        <IconTrash size={16} />
                      </Action>
                    ) : (
                      <Action label={`Hide ${status.name}`} onClick={() => save(status, { hidden: true })}>
                        <IconEyeOff size={16} />
                      </Action>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            );
          })}
          {hiddenHere.map((row) => (
            <Table.Tr key={row.key} c="dimmed">
              <Table.Td>
                <Text size="sm" td="line-through">
                  {row.key}
                </Text>
              </Table.Td>
              <Table.Td />
              <Table.Td>
                <Text size="sm">Hidden here</Text>
              </Table.Td>
              <Table.Td>
                <Group justify="flex-end">
                  <Action label={`Show ${row.key} again`} onClick={() => remove.mutate(row.key, onError)}>
                    <IconEye size={16} />
                  </Action>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <StatusModal
        key={editing === null ? 'closed' : editing === 'new' ? 'new' : editing.key}
        editing={editing}
        definedHere={editing !== null && editing !== 'new' && editing.ownerId === containerId}
        saving={put.isPending}
        error={error}
        nameOf={nameOf}
        onClose={() => {
          setError(null);
          setEditing(null);
        }}
        onSave={(key, body) =>
          put.mutate(
            {
              key,
              body:
                editing === 'new' || editing === null
                  ? { ...body, hidden: false }
                  : { ...currentBody(editing, localRow(editing.key), containerId), ...body },
            },
            {
              onError: setError,
              onSuccess: () => {
                setError(null);
                setEditing(null);
              },
            },
          )
        }
      />
    </Stack>
  );
}

/** What this level already sets for a status: everything for its own statuses, the overrides otherwise. */
function currentBody(
  status: ResolvedStatus,
  local: StatusDefinition | undefined,
  containerId: string,
): PutStatusBody {
  if (status.ownerId === containerId)
    return { name: status.name, category: status.category, color: status.color, hidden: false };
  return { name: local?.name ?? undefined, color: local?.color ?? undefined, hidden: false };
}

function Action({
  label,
  children,
  ...props
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  color?: string;
}) {
  return (
    <Tooltip label={label} withArrow>
      <ActionIcon variant="subtle" color="gray" aria-label={label} {...props}>
        {children}
      </ActionIcon>
    </Tooltip>
  );
}

type ModalProps = {
  editing: ResolvedStatus | 'new' | null;
  definedHere: boolean;
  saving: boolean;
  error: unknown;
  nameOf: (containerId: string) => string;
  onClose: () => void;
  onSave: (key: string, body: Partial<PutStatusBody>) => void;
};

/** Add a status, or rename/recolor one. The category of an inherited status is locked. */
function StatusModal({ editing, definedHere, saving, error, nameOf, onClose, onSave }: ModalProps) {
  const existing = editing === 'new' ? null : editing;
  const [name, setName] = useState(existing?.name ?? '');
  const [key, setKey] = useState(existing?.key ?? '');
  const [category, setCategory] = useState<StatusCategory>(existing?.category ?? 'active');
  const [color, setColor] = useState(existing?.color ?? SWATCHES[1]!);
  const canChangeCategory = editing === 'new' || definedHere;

  return (
    <Modal
      opened={editing !== null}
      onClose={onClose}
      title={existing ? `Edit “${existing.name}”` : 'Add status'}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          // Send only what changed, so renaming an inherited status doesn't also pin its color here.
          onSave(key, {
            ...(name !== existing?.name && { name }),
            ...(color !== existing?.color && { color }),
            ...(canChangeCategory && { category }),
          });
        }}
      >
        <Stack>
          {error !== null && <ConfigError error={error} nameOf={nameOf} />}
          <TextInput
            label="Name"
            required
            data-autofocus
            value={name}
            onChange={(event) => {
              setName(event.currentTarget.value);
              if (editing === 'new') setKey(toKey(event.currentTarget.value));
            }}
          />
          <TextInput
            label="Key"
            description="Stable id that tasks store. Can't change later."
            required
            disabled={editing !== 'new'}
            value={key}
            onChange={(event) => setKey(event.currentTarget.value)}
          />
          <Select
            label="Category"
            description={
              canChangeCategory
                ? 'Decides where tasks can go when they move between lists'
                : 'Comes from the level that defines this status'
            }
            data={categoryOptions}
            value={category}
            disabled={!canChangeCategory}
            allowDeselect={false}
            onChange={(value) => value && setCategory(value as StatusCategory)}
          />
          <ColorInput label="Color" format="hex" swatches={SWATCHES} value={color} onChange={setColor} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
