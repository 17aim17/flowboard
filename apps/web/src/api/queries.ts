import type {
  Container,
  CreateFieldBody,
  CreateTaskBody,
  FieldDefinition,
  MoveTaskBody,
  PutStatusBody,
  ResolvedStatus,
  StatusDefinition,
  Task,
  TaskSort,
  UpdateFieldBody,
  UpdateTaskBody,
  User,
} from '@flowboard/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifyError } from '../shared/notify.ts';
import { api } from './client.ts';

type Page<T> = { data: T[]; page: { limit: number; nextCursor: string | null; hasMore: boolean } };

export const keys = {
  me: ['me'],
  users: ['users'],
  tree: ['tree'],
  statuses: (listId: string) => ['lists', listId, 'statuses'],
  fields: (listId: string) => ['lists', listId, 'fields'],
  tasks: (listId: string) => ['lists', listId, 'tasks'], // prefix of every task query of a list
  board: (listId: string) => ['lists', listId, 'tasks', 'board'],
  table: (listId: string, sort: TaskSort) => ['lists', listId, 'tasks', 'table', sort],
  task: (taskId: string) => ['tasks', taskId],
  containerStatuses: (containerId: string) => ['containers', containerId, 'statuses'],
  containerFields: (containerId: string) => ['containers', containerId, 'fields'],
};

/** Follows `page.nextCursor` until the last page. For bounded sets the UI needs whole (users, a board). */
async function fetchAll<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  do {
    const separator = path.includes('?') ? '&' : '?';
    const page: Page<T> = await api(
      'GET',
      `${path}${separator}limit=200${cursor ? `&cursor=${cursor}` : ''}`,
    );
    items.push(...page.data);
    cursor = page.page.nextCursor;
  } while (cursor);
  return items;
}

// ---------- reads ----------

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => api<User>('GET', '/me') });

export const useUsers = () => useQuery({ queryKey: keys.users, queryFn: () => fetchAll<User>('/users') });

export const useTree = () =>
  useQuery({
    queryKey: keys.tree,
    queryFn: async () => (await api<{ data: Container[] }>('GET', '/tree')).data,
  });

export const useStatuses = (listId: string) =>
  useQuery({
    queryKey: keys.statuses(listId),
    queryFn: async () =>
      (await api<{ data: ResolvedStatus[] }>('GET', `/lists/${listId}/resolved-statuses`)).data,
  });

export const useFields = (listId: string) =>
  useQuery({
    queryKey: keys.fields(listId),
    queryFn: async () =>
      (await api<{ data: FieldDefinition[] }>('GET', `/lists/${listId}/resolved-fields`)).data,
  });

/** Every task of a list, in position order: the board groups them into columns. */
export const useBoardTasks = (listId: string) =>
  useQuery({
    queryKey: keys.board(listId),
    queryFn: () => fetchAll<Task>(`/lists/${listId}/tasks?sort=position`),
  });

/** The table loads page by page ("Load more"), sorted on the server. */
export const useTableTasks = (listId: string, sort: TaskSort) =>
  useInfiniteQuery({
    queryKey: keys.table(listId, sort),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api<Page<Task>>(
        'GET',
        `/lists/${listId}/tasks?sort=${sort}&limit=50${pageParam ? `&cursor=${pageParam}` : ''}`,
      ),
    getNextPageParam: (last) => last.page.nextCursor,
  });

export const useTask = (taskId: string | null) =>
  useQuery({
    queryKey: keys.task(taskId ?? ''),
    queryFn: () => api<Task>('GET', `/tasks/${taskId}`),
    enabled: taskId !== null,
  });

type ContainerStatuses = { local: StatusDefinition[]; resolved: ResolvedStatus[] };
type ContainerFields = { local: FieldDefinition[]; resolved: FieldDefinition[] };

/** A container's own status rows and what it shows after merging (the settings page). */
export const useContainerStatuses = (containerId: string) =>
  useQuery({
    queryKey: keys.containerStatuses(containerId),
    queryFn: () => api<ContainerStatuses>('GET', `/containers/${containerId}/statuses`),
  });

export const useContainerFields = (containerId: string) =>
  useQuery({
    queryKey: keys.containerFields(containerId),
    queryFn: () => api<ContainerFields>('GET', `/containers/${containerId}/fields`),
  });

// ---------- writes ----------

/** After any task write, refetch the list's board and table, and the task itself. */
function useRefreshTasks() {
  const queryClient = useQueryClient();
  return (task: { id: string; listId: string }) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.tasks(task.listId) }),
      queryClient.invalidateQueries({ queryKey: keys.task(task.id) }),
    ]);
}

export function useCreateTask(listId: string) {
  const refresh = useRefreshTasks();
  return useMutation({
    mutationFn: (body: CreateTaskBody) => api<Task>('POST', `/lists/${listId}/tasks`, body),
    onSuccess: (task) => refresh(task),
  });
}

/** `version` is the version the edit is based on; the server refuses it if someone saved since. */
export function useUpdateTask() {
  const refresh = useRefreshTasks();
  return useMutation({
    mutationFn: ({ taskId, body }: { taskId: string; body: UpdateTaskBody }) =>
      api<Task>('PATCH', `/tasks/${taskId}`, body),
    onSuccess: (updated) => refresh(updated),
  });
}

export function useDeleteTask() {
  const refresh = useRefreshTasks();
  return useMutation({
    mutationFn: (task: Task) => api<void>('DELETE', `/tasks/${task.id}`),
    onSuccess: (_result, task) => refresh(task),
  });
}

type MoveVariables = {
  task: Task;
  body: Omit<MoveTaskBody, 'version'>;
  /** Where the card should appear right away, before the server answers. Omit to wait for the server. */
  optimistic?: { statusKey: string; position: string };
};

/**
 * Optimistic move: the card moves on the board immediately. If the server refuses (for example 409
 * because someone else changed the task), the board goes back to how it was and the error is shown.
 * Either way the list is refetched, so the board ends up matching the server.
 */
export function useMoveTask(listId: string) {
  const queryClient = useQueryClient();
  const refresh = useRefreshTasks();
  return useMutation({
    mutationFn: ({ task, body }: MoveVariables) =>
      api<Task>('POST', `/tasks/${task.id}/move`, { ...body, version: task.version }),
    onMutate: async ({ task, optimistic }) => {
      if (!optimistic) return;
      await queryClient.cancelQueries({ queryKey: keys.board(listId) });
      const previous = queryClient.getQueryData<Task[]>(keys.board(listId));
      queryClient.setQueryData<Task[]>(keys.board(listId), (tasks) =>
        tasks?.map((t) => (t.id === task.id ? { ...t, ...optimistic } : t)),
      );
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context) queryClient.setQueryData(keys.board(listId), context.previous);
      notifyError(error, "Couldn't move the task");
    },
    onSettled: (_data, _error, { task }) => refresh(task),
  });
}

// ---------- config (admin) ----------

/** A config change can affect every list below the container, so refetch all config and boards. */
function useRefreshConfig() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['containers'] }),
      queryClient.invalidateQueries({ queryKey: ['lists'] }),
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
    ]);
}

export function usePutStatus(containerId: string) {
  const refresh = useRefreshConfig();
  return useMutation({
    mutationFn: ({ key, body }: { key: string; body: PutStatusBody }) =>
      api<ContainerStatuses>('PUT', `/containers/${containerId}/statuses/${key}`, body),
    onSuccess: refresh,
  });
}

export function useDeleteStatus(containerId: string) {
  const refresh = useRefreshConfig();
  return useMutation({
    mutationFn: (key: string) =>
      api<ContainerStatuses>('DELETE', `/containers/${containerId}/statuses/${key}`),
    onSuccess: refresh,
  });
}

export function useCreateField(containerId: string) {
  const refresh = useRefreshConfig();
  return useMutation({
    mutationFn: (body: CreateFieldBody) =>
      api<FieldDefinition>('POST', `/containers/${containerId}/fields`, body),
    onSuccess: refresh,
  });
}

export function useUpdateField() {
  const refresh = useRefreshConfig();
  return useMutation({
    mutationFn: ({ fieldId, body }: { fieldId: string; body: UpdateFieldBody }) =>
      api<FieldDefinition>('PATCH', `/fields/${fieldId}`, body),
    onSuccess: refresh,
  });
}

export function useDeleteField() {
  const refresh = useRefreshConfig();
  return useMutation({
    mutationFn: (fieldId: string) => api<void>('DELETE', `/fields/${fieldId}`),
    onSuccess: refresh,
  });
}
