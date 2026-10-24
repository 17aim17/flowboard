import {
  type FieldDefinition,
  type Priority,
  type ResolvedStatus,
  type Task,
  type User,
  type ValidationIssue,
  validateCustomFields,
} from '@flowboard/contracts';
import {
  Button,
  Divider,
  Drawer,
  Group,
  MultiSelect,
  Select,
  Stack,
  Textarea,
  TextInput,
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import dayjs from 'dayjs';
import { useState } from 'react';
import { Controller, type FieldErrors, type FieldPath, useForm } from 'react-hook-form';
import { ApiError } from '../api/client.ts';
import { useCreateTask, useDeleteTask, useMoveTask, useTask, useUpdateTask } from '../api/queries.ts';
import { priorityLabel } from '../shared/badges.tsx';
import { notifyError } from '../shared/notify.ts';
import { ErrorState, LoadingState } from '../shared/states.tsx';
import { CustomFieldInput } from './CustomFieldInput.tsx';

type ListContext = { listId: string; statuses: ResolvedStatus[]; fields: FieldDefinition[]; users: User[] };

type Props = ListContext & {
  /** Open an existing task, or create one in the given column. */
  taskId: string | null;
  newStatusKey: string | null;
  onClose: () => void;
};

export function TaskDrawer({ taskId, newStatusKey, onClose, ...list }: Props) {
  const task = useTask(taskId);
  return (
    <Drawer
      opened={taskId !== null || newStatusKey !== null}
      onClose={onClose}
      position="right"
      size="lg"
      title={taskId ? 'Task' : 'New task'}
    >
      {taskId ? (
        task.isPending ? (
          <LoadingState rows={6} />
        ) : task.isError ? (
          <ErrorState error={task.error} onRetry={() => void task.refetch()} />
        ) : (
          <TaskForm key={task.data.id} {...list} task={task.data} onDone={onClose} />
        )
      ) : (
        newStatusKey && <TaskForm key={newStatusKey} {...list} statusKey={newStatusKey} onDone={onClose} />
      )}
    </Drawer>
  );
}

type FormValues = {
  title: string;
  description: string;
  statusKey: string;
  priority: Priority;
  assigneeIds: string[];
  /** Local time as "YYYY-MM-DD HH:mm:ss", the format the date picker uses. */
  dueDate: string | null;
  customFields: Record<string, unknown>;
};

type FormProps = ListContext & { task?: Task; statusKey?: string; onDone: () => void };

function TaskForm({ listId, statuses, fields, users, task, statusKey, onDone }: FormProps) {
  const create = useCreateTask(listId);
  const update = useUpdateTask();
  const move = useMoveTask(listId);
  const remove = useDeleteTask();
  // The version our edits are based on. Our own saves and status changes move it forward; someone else's
  // save doesn't, so the server can tell us about their change instead of us overwriting it.
  const [baseVersion, setBaseVersion] = useState(task?.version ?? 0);

  const form = useForm<FormValues>({
    defaultValues: toFormValues(fields, task, statusKey),
    resolver: (values) => validate(values, fields, task),
  });

  const submit = form.handleSubmit(async (values) => {
    const common = {
      title: values.title.trim(),
      description: values.description,
      priority: values.priority,
      assigneeIds: values.assigneeIds,
      dueDate: values.dueDate ? dayjs(values.dueDate).toISOString() : null,
    };
    try {
      if (task) {
        const customFields = changedFields(values.customFields, task.customFields);
        const saved = await update.mutateAsync({
          taskId: task.id,
          body: { ...common, version: baseVersion, customFields },
        });
        setBaseVersion(saved.version);
        form.reset(toFormValues(fields, saved));
        notifications.show({ color: 'green', message: 'Saved' });
      } else {
        const customFields = Object.fromEntries(
          Object.entries(values.customFields).filter(([, v]) => v !== null),
        );
        await create.mutateAsync({ ...common, statusKey: values.statusKey, customFields });
        notifications.show({ color: 'green', message: 'Task created' });
        onDone();
      }
    } catch (error) {
      if (!showServerIssues(error, form.setError)) notifyError(error, "Couldn't save the task");
    }
  });

  const changeStatus = (next: string | null) => {
    if (!task || !next || next === task.statusKey) return;
    move.mutate(
      { task: { ...task, version: baseVersion }, body: { statusKey: next } },
      { onSuccess: (moved) => setBaseVersion(moved.version) },
    );
  };

  const deleteTask = () => {
    if (!task || !window.confirm(`Delete "${task.title}"? This can't be undone.`)) return;
    remove.mutate(task, {
      onSuccess: onDone,
      onError: (error) => notifyError(error, "Couldn't delete the task"),
    });
  };

  const { errors } = form.formState;
  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <Stack>
        <TextInput
          label="Title"
          required
          {...form.register('title')}
          error={errors.title?.message}
          data-autofocus
        />
        <Group grow>
          {task ? (
            <Select
              label="Status"
              data={statuses.map((s) => ({ value: s.key, label: s.name }))}
              value={task.statusKey}
              onChange={changeStatus}
              allowDeselect={false}
            />
          ) : (
            <Controller
              control={form.control}
              name="statusKey"
              render={({ field }) => (
                <Select
                  label="Status"
                  data={statuses.map((s) => ({ value: s.key, label: s.name }))}
                  value={field.value}
                  onChange={(v) => v && field.onChange(v)}
                  allowDeselect={false}
                />
              )}
            />
          )}
          <Controller
            control={form.control}
            name="priority"
            render={({ field }) => (
              <Select
                label="Priority"
                data={Object.entries(priorityLabel).map(([value, label]) => ({ value, label }))}
                value={field.value}
                onChange={(v) => v && field.onChange(v)}
                allowDeselect={false}
              />
            )}
          />
        </Group>
        <Controller
          control={form.control}
          name="assigneeIds"
          render={({ field }) => (
            <MultiSelect
              label="Assignees"
              data={users.map((u) => ({ value: u.id, label: u.name }))}
              value={field.value}
              onChange={field.onChange}
              clearable
            />
          )}
        />
        <Controller
          control={form.control}
          name="dueDate"
          render={({ field }) => (
            <DateTimePicker
              label="Due date"
              value={field.value}
              onChange={field.onChange}
              valueFormat="MMM D, YYYY HH:mm"
              clearable
            />
          )}
        />
        <Textarea label="Description" autosize minRows={3} {...form.register('description')} />

        {fields.length > 0 && <Divider label="Custom fields" labelPosition="left" />}
        {fields.map((definition) => (
          <Controller
            key={definition.key}
            control={form.control}
            name={`customFields.${definition.key}`}
            render={({ field, fieldState }) => (
              <CustomFieldInput
                field={definition}
                value={field.value}
                onChange={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />
        ))}

        <Group justify="space-between" mt="md">
          {task ? (
            <Button variant="subtle" color="red" onClick={deleteTask} loading={remove.isPending}>
              Delete
            </Button>
          ) : (
            <span />
          )}
          <Group>
            <Button variant="default" onClick={onDone}>
              Close
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {task ? 'Save' : 'Create task'}
            </Button>
          </Group>
        </Group>
      </Stack>
    </form>
  );
}

function toFormValues(fields: FieldDefinition[], task?: Task, statusKey?: string): FormValues {
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    statusKey: task?.statusKey ?? statusKey ?? '',
    priority: task?.priority ?? 'none',
    assigneeIds: task?.assigneeIds ?? [],
    dueDate: task?.dueDate ? dayjs(task.dueDate).format('YYYY-MM-DD HH:mm:ss') : null,
    customFields: Object.fromEntries(fields.map((f) => [f.key, task?.customFields[f.key] ?? null])),
  };
}

/** Only the custom fields the user changed, so an edit never trips over values it didn't touch. */
function changedFields(values: Record<string, unknown>, saved: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([key, value]) => JSON.stringify(value) !== JSON.stringify(saved[key] ?? null),
    ),
  );
}

/** Same rules as the server, via the shared validator, so the form and the API agree. */
function validate(values: FormValues, fields: FieldDefinition[], task?: Task) {
  const issues: ValidationIssue[] = [];
  const title = values.title.trim();
  if (!title) issues.push({ path: 'title', code: 'required', message: 'Title is required' });
  else if (title.length > 500)
    issues.push({ path: 'title', code: 'too_long', message: 'At most 500 characters' });

  const input = task ? changedFields(values.customFields, task.customFields) : values.customFields;
  const mode = task ? 'update' : 'create';
  issues.push(...validateCustomFields(fields, input, mode, task?.customFields).issues);

  return issues.length === 0 ? { values, errors: {} } : { values: {}, errors: toFieldErrors(issues) };
}

/** Turns issue paths like "customFields.estimate" into React Hook Form's nested error object. */
function toFieldErrors(issues: ValidationIssue[]): FieldErrors<FormValues> {
  const errors: Record<string, unknown> = {};
  for (const issue of issues) {
    const parts = issue.path.split('.');
    let node = errors;
    for (const part of parts.slice(0, -1)) node = (node[part] ??= {}) as Record<string, unknown>;
    node[parts.at(-1)!] = { type: issue.code, message: issue.message };
  }
  return errors;
}

/** Puts the server's validation messages next to the matching inputs. False if there were none. */
function showServerIssues(
  error: unknown,
  setError: (path: FieldPath<FormValues>, e: { message: string }) => void,
) {
  if (!(error instanceof ApiError) || error.issues.length === 0) return false;
  for (const issue of error.issues) setError(issue.path as FieldPath<FormValues>, { message: issue.message });
  return true;
}
