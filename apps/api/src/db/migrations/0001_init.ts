import { type Kysely, sql } from 'kysely';

// The schema is plain SQL so it can be read and reviewed as SQL. See docs/DESIGN.md section 11.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TYPE container_type AS ENUM ('workspace', 'space', 'folder', 'list');
    CREATE TYPE visibility AS ENUM ('public', 'private');
    CREATE TYPE user_role AS ENUM ('admin', 'member');
    CREATE TYPE grant_mode AS ENUM ('allow', 'deny');
    CREATE TYPE status_category AS ENUM ('not_started', 'active', 'done', 'closed');
    CREATE TYPE field_type AS ENUM ('text', 'number', 'single_select', 'multi_select', 'date', 'checkbox');
    -- Declared most to least urgent, so ORDER BY priority sorts by urgency.
    CREATE TYPE task_priority AS ENUM ('urgent', 'high', 'normal', 'low', 'none');

    CREATE TABLE users (
      id         uuid PRIMARY KEY DEFAULT uuidv7(),
      handle     text NOT NULL UNIQUE,
      name       text NOT NULL,
      role       user_role NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    -- Workspace, spaces, folders and lists in one adjacency-list table.
    -- The (parent_id, parent_type) foreign key plus the CHECK make an invalid parent impossible.
    CREATE TABLE containers (
      id          uuid PRIMARY KEY DEFAULT uuidv7(),
      type        container_type NOT NULL,
      parent_id   uuid,
      parent_type container_type,
      name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
      position    text COLLATE "C" NOT NULL,
      visibility  visibility NOT NULL DEFAULT 'public',
      archived_at timestamptz,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      UNIQUE (id, type),
      FOREIGN KEY (parent_id, parent_type) REFERENCES containers (id, type),
      CHECK (
           (type = 'workspace' AND parent_id IS NULL AND parent_type IS NULL)
        OR (type = 'space'  AND parent_id IS NOT NULL AND parent_type = 'workspace')
        OR (type = 'folder' AND parent_id IS NOT NULL AND parent_type = 'space')
        OR (type = 'list'   AND parent_id IS NOT NULL AND parent_type = 'folder')
      )
    );
    CREATE UNIQUE INDEX containers_single_workspace ON containers ((true)) WHERE type = 'workspace';
    CREATE INDEX containers_children ON containers (parent_id, position);

    -- An origin row defines a key (all columns set). An override row changes an inherited key:
    -- category stays NULL, other columns are NULL when not overridden. A hidden row only hides.
    CREATE TABLE status_definitions (
      id           uuid PRIMARY KEY DEFAULT uuidv7(),
      container_id uuid NOT NULL REFERENCES containers (id),
      key          text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{0,39}$'),
      name         text CHECK (char_length(name) BETWEEN 1 AND 50),
      category     status_category,
      color        text CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
      position     text COLLATE "C",
      hidden       boolean NOT NULL DEFAULT false,
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now(),
      UNIQUE (container_id, key),
      CHECK (NOT hidden OR (name IS NULL AND category IS NULL AND color IS NULL AND position IS NULL))
    );

    -- Field keys are unique across the workspace, archived fields included, so a key always
    -- means one type (decision D-08). Fields can't be owned by the workspace itself.
    CREATE TABLE field_definitions (
      id             uuid PRIMARY KEY DEFAULT uuidv7(),
      container_id   uuid NOT NULL,
      container_type container_type NOT NULL CHECK (container_type IN ('space', 'folder', 'list')),
      key            text NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_]{0,39}$'),
      name           text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
      type           field_type NOT NULL,
      required       boolean NOT NULL DEFAULT false,
      options        jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(options) = 'array'),
      position       text COLLATE "C" NOT NULL,
      archived_at    timestamptz,
      created_at     timestamptz NOT NULL DEFAULT now(),
      updated_at     timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (container_id, container_type) REFERENCES containers (id, type),
      CHECK (type IN ('single_select', 'multi_select') OR options = '[]')
    );
    CREATE INDEX field_definitions_owner ON field_definitions (container_id, position);

    -- status_key and custom_fields depend on the list's whole path, so the API validates them
    -- inside the same transaction as the write. list_type pins list_id to a container of type list.
    CREATE TABLE tasks (
      id            uuid PRIMARY KEY DEFAULT uuidv7(),
      list_id       uuid NOT NULL,
      list_type     container_type NOT NULL DEFAULT 'list' CHECK (list_type = 'list'),
      title         text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 500),
      description   text NOT NULL DEFAULT '',
      status_key    text NOT NULL,
      priority      task_priority NOT NULL DEFAULT 'none',
      due_date      timestamptz,
      custom_fields jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(custom_fields) = 'object'),
      position      text COLLATE "C" NOT NULL,
      version       integer NOT NULL DEFAULT 1,
      created_by    uuid NOT NULL REFERENCES users (id),
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (list_id, list_type) REFERENCES containers (id, type)
    );
    CREATE INDEX tasks_board ON tasks (list_id, status_key, position, id);
    CREATE INDEX tasks_by_due_date ON tasks (list_id, due_date, id);
    CREATE INDEX tasks_by_priority ON tasks (list_id, priority, id);
    -- Default jsonb_ops supports both @> (value filters) and ? (does a task have this key).
    CREATE INDEX tasks_custom_fields ON tasks USING gin (custom_fields);

    CREATE TABLE task_assignees (
      task_id uuid NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users (id),
      PRIMARY KEY (task_id, user_id)
    );
    CREATE INDEX task_assignees_user ON task_assignees (user_id);

    CREATE TABLE grants (
      id           uuid PRIMARY KEY DEFAULT uuidv7(),
      container_id uuid NOT NULL REFERENCES containers (id),
      user_id      uuid NOT NULL REFERENCES users (id),
      mode         grant_mode NOT NULL,
      created_at   timestamptz NOT NULL DEFAULT now(),
      UNIQUE (container_id, user_id)
    );
    CREATE INDEX grants_user ON grants (user_id);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP TABLE grants, task_assignees, tasks, field_definitions, status_definitions, containers, users;
    DROP TYPE task_priority, field_type, status_category, grant_mode, user_role, visibility, container_type;
  `.execute(db);
}
