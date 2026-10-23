import type {
  ContainerType,
  FieldOption,
  FieldType,
  GrantMode,
  Priority,
  StatusCategory,
  UserRole,
  Visibility,
} from '@flowboard/contracts';
import type { ColumnType, Generated, Selectable } from 'kysely';

// Row types for Kysely, matching migrations/0001_init.ts column for column.
// jsonb columns are written as JSON strings (node-postgres would turn JS arrays into Postgres arrays).

type CreatedAt = Generated<Date>;
type UpdatedAt = ColumnType<Date, never, Date>;
type Json<T> = ColumnType<T, string, string>;

export interface UsersTable {
  id: Generated<string>;
  handle: string;
  name: string;
  role: UserRole;
  created_at: CreatedAt;
}

export interface ContainersTable {
  id: Generated<string>;
  type: ContainerType;
  parent_id: string | null;
  parent_type: ContainerType | null;
  name: string;
  position: string;
  visibility: Generated<Visibility>;
  archived_at: Date | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface StatusDefinitionsTable {
  id: Generated<string>;
  container_id: string;
  key: string;
  name: string | null;
  category: StatusCategory | null;
  color: string | null;
  position: string | null;
  hidden: Generated<boolean>;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface FieldDefinitionsTable {
  id: Generated<string>;
  container_id: string;
  container_type: ContainerType;
  key: string;
  name: string;
  type: FieldType;
  required: Generated<boolean>;
  options: Json<FieldOption[]>;
  position: string;
  archived_at: Date | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface TasksTable {
  id: Generated<string>;
  list_id: string;
  list_type: Generated<'list'>;
  title: string;
  description: Generated<string>;
  status_key: string;
  priority: Generated<Priority>;
  due_date: Date | null;
  custom_fields: Json<Record<string, unknown>>;
  position: string;
  version: Generated<number>;
  created_by: string;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface TaskAssigneesTable {
  task_id: string;
  user_id: string;
}

export interface GrantsTable {
  id: Generated<string>;
  container_id: string;
  user_id: string;
  mode: GrantMode;
  created_at: CreatedAt;
}

export interface Database {
  users: UsersTable;
  containers: ContainersTable;
  status_definitions: StatusDefinitionsTable;
  field_definitions: FieldDefinitionsTable;
  tasks: TasksTable;
  task_assignees: TaskAssigneesTable;
  grants: GrantsTable;
}

export type UserRow = Selectable<UsersTable>;
export type ContainerRow = Selectable<ContainersTable>;
export type StatusRow = Selectable<StatusDefinitionsTable>;
export type FieldRow = Selectable<FieldDefinitionsTable>;
