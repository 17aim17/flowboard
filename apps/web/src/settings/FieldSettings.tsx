import type { CreateFieldBody, FieldDefinition, FieldType } from '@flowboard/contracts';
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconPencil, IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { useContainerFields, useCreateField, useDeleteField, useUpdateField } from '../api/queries.ts';
import { ErrorState, LoadingState } from '../shared/states.tsx';
import { ConfigError } from './ConfigError.tsx';
import { toKey } from './key.ts';

const typeLabel: Record<FieldType, string> = {
  text: 'Text',
  number: 'Number',
  single_select: 'Dropdown',
  multi_select: 'Multi-select',
  date: 'Date',
  checkbox: 'Checkbox',
};
const typeOptions = Object.entries(typeLabel).map(([value, label]) => ({ value, label }));
const isSelect = (type: FieldType) => type === 'single_select' || type === 'multi_select';

type Props = { containerId: string; nameOf: (containerId: string) => string };

/**
 * Fields from levels above are shown read-only: fields add up down the tree and are never
 * overridden (decision D-08). Fields defined here can be edited and deleted.
 */
export function FieldSettings({ containerId, nameOf }: Props) {
  const fields = useContainerFields(containerId);
  const remove = useDeleteField();
  const [editing, setEditing] = useState<FieldDefinition | 'new' | null>(null);
  const [deleting, setDeleting] = useState<FieldDefinition | null>(null);
  const [error, setError] = useState<unknown>(null);

  if (fields.isPending) return <LoadingState rows={5} />;
  if (fields.isError) return <ErrorState error={fields.error} onRetry={() => void fields.refetch()} />;

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          Fields defined here show on every task in {nameOf(containerId)}.
        </Text>
        <Button size="xs" onClick={() => setEditing('new')}>
          Add field
        </Button>
      </Group>

      {error !== null && <ConfigError error={error} nameOf={nameOf} onClose={() => setError(null)} />}

      <Table verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Field</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th>Comes from</Table.Th>
            <Table.Th w={100} aria-label="Actions" />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {fields.data.resolved.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text size="sm" c="dimmed" ta="center">
                  No custom fields yet
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
          {fields.data.resolved.map((field) => {
            const definedHere = field.ownerId === containerId;
            return (
              <Table.Tr key={field.id}>
                <Table.Td>
                  <Group gap="xs">
                    <Text size="sm">{field.name}</Text>
                    <Text size="xs" c="dimmed">
                      {field.key}
                    </Text>
                    {field.required && (
                      <Badge size="xs" variant="light" color="red">
                        Required
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {typeLabel[field.type]}
                    {isSelect(field.type) && ` (${field.options.map((o) => o.label).join(', ')})`}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{definedHere ? 'Defined here' : nameOf(field.ownerId)}</Text>
                </Table.Td>
                <Table.Td>
                  {definedHere && (
                    <Group gap={4} justify="flex-end" wrap="nowrap">
                      <Tooltip label={`Edit ${field.name}`} withArrow>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          aria-label={`Edit ${field.name}`}
                          onClick={() => setEditing(field)}
                        >
                          <IconPencil size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label={`Delete ${field.name}`} withArrow>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          aria-label={`Delete ${field.name}`}
                          onClick={() => setDeleting(field)}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  )}
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>

      <FieldModal
        key={editing === null ? 'closed' : editing === 'new' ? 'new' : editing.id}
        containerId={containerId}
        editing={editing}
        nameOf={nameOf}
        onClose={() => setEditing(null)}
      />

      <Modal
        opened={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
      >
        <Stack>
          <Text size="sm">
            The field disappears from every task. Values already saved are kept in the database but no longer
            shown, and the key “{deleting?.key}” can't be reused.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={remove.isPending}
              onClick={() =>
                remove.mutate(deleting!.id, {
                  onError: setError,
                  onSettled: () => setDeleting(null),
                })
              }
            >
              Delete field
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

type Option = { id?: string; label: string };

type ModalProps = {
  containerId: string;
  editing: FieldDefinition | 'new' | null;
  nameOf: (containerId: string) => string;
  onClose: () => void;
};

/** Add a field, or edit one defined here. Options keep their ids, so tasks using them stay valid. */
function FieldModal({ containerId, editing, nameOf, onClose }: ModalProps) {
  const existing = editing === 'new' ? null : editing;
  const create = useCreateField(containerId);
  const update = useUpdateField();
  const [name, setName] = useState(existing?.name ?? '');
  const [key, setKey] = useState(existing?.key ?? '');
  const [type, setType] = useState<FieldType>(existing?.type ?? 'text');
  const [required, setRequired] = useState(existing?.required ?? false);
  const [options, setOptions] = useState<Option[]>(existing?.options ?? [{ label: '' }]);
  const [error, setError] = useState<unknown>(null);

  const body = {
    name,
    type,
    required,
    options: isSelect(type)
      ? options.filter((o) => o.label.trim()).map((o) => ({ ...o, label: o.label.trim() }))
      : [],
  };
  const done = { onError: setError, onSuccess: onClose };
  const setOption = (index: number, label: string) =>
    setOptions((current) => current.map((o, i) => (i === index ? { ...o, label } : o)));

  return (
    <Modal
      opened={editing !== null}
      onClose={onClose}
      title={existing ? `Edit “${existing.name}”` : 'Add field'}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (existing) update.mutate({ fieldId: existing.id, body }, done);
          else create.mutate({ ...body, key } satisfies CreateFieldBody, done);
        }}
      >
        <Stack>
          {error !== null && <ConfigError error={error} nameOf={nameOf} onClose={() => setError(null)} />}
          <TextInput
            label="Name"
            required
            data-autofocus
            value={name}
            onChange={(event) => {
              setName(event.currentTarget.value);
              if (!existing) setKey(toKey(event.currentTarget.value));
            }}
          />
          <TextInput
            label="Key"
            description="Stable id used in task data. Unique across the workspace, can't change later."
            required
            disabled={existing !== null}
            value={key}
            onChange={(event) => setKey(event.currentTarget.value)}
          />
          <Select
            label="Type"
            description={existing ? "Can't change once tasks have a value" : undefined}
            data={typeOptions}
            value={type}
            allowDeselect={false}
            onChange={(value) => value && setType(value as FieldType)}
          />
          <Checkbox
            label="Required"
            description="Checked when tasks are created or moved here. Existing tasks aren't changed."
            checked={required}
            onChange={(event) => setRequired(event.currentTarget.checked)}
          />
          {isSelect(type) && (
            <Stack gap="xs">
              <Text size="sm" fw={500}>
                Options
              </Text>
              {options.map((option, index) => (
                <Group key={option.id ?? `new-${index}`} gap="xs" wrap="nowrap">
                  <TextInput
                    flex={1}
                    aria-label={`Option ${index + 1}`}
                    value={option.label}
                    onChange={(event) => setOption(index, event.currentTarget.value)}
                  />
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    aria-label={`Remove option ${index + 1}`}
                    onClick={() => setOptions((current) => current.filter((_, i) => i !== index))}
                  >
                    <IconX size={16} />
                  </ActionIcon>
                </Group>
              ))}
              <Button
                variant="subtle"
                size="xs"
                leftSection={<IconPlus size={14} />}
                onClick={() => setOptions((current) => [...current, { label: '' }])}
                style={{ alignSelf: 'flex-start' }}
              >
                Add option
              </Button>
            </Stack>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending || update.isPending}>
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
