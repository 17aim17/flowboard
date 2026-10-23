import {
  type ContainerType,
  type FieldOption,
  type FieldType,
  type Priority,
  type StatusCategory,
  validateCustomFields,
} from '@flowboard/contracts';
import { generateKeyBetween } from 'fractional-indexing';
import { sql } from 'kysely';
import { loadConfig } from '../config.ts';
import { resolveFieldsForPath } from '../modules/fields/service.ts';
import { getListPath } from '../modules/hierarchy/paths.ts';
import { resolveForPath, verifySubtree } from '../modules/statuses/service.ts';
import { createDb, type Db } from './db.ts';

// Demo data matching the tree in docs/DESIGN.md section 4.

type Handle = 'alice' | 'bob' | 'carol';

type SeedTask = {
  title: string;
  status: string;
  priority: Priority;
  assignees?: Handle[];
  due?: string;
  fields?: Record<string, unknown>;
  description?: string;
};

const option = (id: string, label: string, color?: string): FieldOption => ({
  id,
  label,
  ...(color && { color }),
});

const severityOptions = [
  option('low', 'Low', '#22C55E'),
  option('medium', 'Medium', '#EAB308'),
  option('high', 'High', '#F97316'),
  option('critical', 'Critical', '#EF4444'),
];

const tasksByList: Record<string, SeedTask[]> = {
  Backlog: [
    {
      title: 'Design password reset flow',
      status: 'todo',
      priority: 'normal',
      assignees: ['bob'],
      fields: { severity: 'medium', estimate: 5, component: ['web'] },
    },
    {
      title: 'Audit API rate limits',
      status: 'todo',
      priority: 'low',
      fields: { severity: 'low', estimate: 3, component: ['api'] },
    },
    {
      title: 'Add SSO login',
      status: 'todo',
      priority: 'high',
      assignees: ['alice'],
      due: '2026-11-20T17:00:00Z',
      fields: { severity: 'high', estimate: 8, component: ['api', 'web'] },
    },
    {
      title: 'Migrate image storage',
      status: 'in_progress',
      priority: 'normal',
      assignees: ['carol'],
      fields: { severity: 'medium', estimate: 5, component: ['infra'] },
    },
    {
      title: 'Offline mode for mobile',
      status: 'in_progress',
      priority: 'low',
      assignees: ['bob'],
      fields: { severity: 'low', component: ['mobile'] },
    },
    {
      title: 'Remove legacy v0 endpoints',
      status: 'done',
      priority: 'normal',
      fields: { severity: 'low', estimate: 2, component: ['api'] },
    },
    {
      title: 'Dark mode',
      status: 'closed',
      priority: 'none',
      description: "Won't do this quarter.",
      fields: { severity: 'low', component: ['web'] },
    },
  ],
  'Sprint 12': [
    {
      title: 'Checkout page redesign',
      status: 'todo',
      priority: 'high',
      assignees: ['carol'],
      due: '2026-10-30T17:00:00Z',
      fields: { severity: 'high', estimate: 8, component: ['web'], needs_qa: true },
    },
    {
      title: 'Fix login redirect loop',
      status: 'in_progress',
      priority: 'urgent',
      assignees: ['bob'],
      due: '2026-10-25T12:00:00Z',
      fields: { severity: 'critical', estimate: 2, component: ['web'], needs_qa: true },
    },
    {
      title: 'Order history API',
      status: 'in_progress',
      priority: 'normal',
      assignees: ['alice', 'bob'],
      due: '2026-10-29T17:00:00Z',
      fields: { severity: 'medium', estimate: 5, component: ['api'] },
    },
    {
      title: 'Search by order number',
      status: 'in_review',
      priority: 'normal',
      assignees: ['carol'],
      fields: { severity: 'medium', estimate: 3, component: ['api', 'web'], needs_qa: true },
    },
    {
      title: 'Email receipts',
      status: 'in_review',
      priority: 'high',
      assignees: ['alice'],
      due: '2026-10-28T17:00:00Z',
      fields: { severity: 'high', estimate: 3, component: ['api'], needs_qa: false },
    },
    {
      title: 'Set up CI for web app',
      status: 'done',
      priority: 'normal',
      assignees: ['bob'],
      fields: { severity: 'low', estimate: 2, component: ['infra'] },
    },
    {
      title: 'Cart totals rounding bug',
      status: 'done',
      priority: 'urgent',
      assignees: ['carol'],
      fields: { severity: 'critical', estimate: 1, component: ['web'], needs_qa: true },
    },
  ],
  'On-call': [
    {
      title: 'Database CPU alerts at night',
      status: 'todo',
      priority: 'high',
      assignees: ['alice'],
      fields: { estimate: 3, runbook: 'https://wiki.example.com/runbooks/db-cpu' },
    },
    {
      title: 'Rotate TLS certificates',
      status: 'in_progress',
      priority: 'urgent',
      assignees: ['carol'],
      due: '2026-10-27T09:00:00Z',
      fields: { estimate: 2 },
    },
    {
      title: 'Queue backlog after deploy',
      status: 'blocked',
      priority: 'high',
      assignees: ['alice'],
      description: 'Waiting on the vendor fix.',
      fields: { runbook: 'https://wiki.example.com/runbooks/queues' },
    },
    { title: 'Disk full on worker-3', status: 'done', priority: 'normal', fields: { estimate: 1 } },
    {
      title: 'Flaky health check',
      status: 'closed',
      priority: 'low',
      description: 'Duplicate of the queue issue.',
    },
  ],
  'Launch Content': [
    {
      title: 'Launch announcement post',
      status: 'drafting',
      priority: 'high',
      assignees: ['carol'],
      due: '2026-11-02T10:00:00Z',
      fields: { channel: 'blog', publish_date: '2026-11-02' },
    },
    { title: 'Customer story: Acme', status: 'idea', priority: 'normal', fields: { channel: 'blog' } },
    {
      title: 'Launch email to customers',
      status: 'scheduled',
      priority: 'high',
      assignees: ['alice'],
      fields: { channel: 'email', publish_date: '2026-11-03' },
    },
    {
      title: 'Teaser video',
      status: 'drafting',
      priority: 'normal',
      assignees: ['carol'],
      fields: { channel: 'video', publish_date: '2026-10-31' },
    },
    { title: 'Social thread for launch day', status: 'idea', priority: 'low', fields: { channel: 'social' } },
    {
      title: 'September newsletter',
      status: 'published',
      priority: 'none',
      fields: { channel: 'email', publish_date: '2026-09-30' },
    },
  ],
};

export async function seed(db: Db): Promise<void> {
  await db.transaction().execute(async (tx) => {
    const users = await tx
      .insertInto('users')
      .values([
        { handle: 'alice', name: 'Alice Admin', role: 'admin' },
        { handle: 'bob', name: 'Bob Builder', role: 'member' },
        { handle: 'carol', name: 'Carol Writer', role: 'member' },
      ])
      .returning(['id', 'handle'])
      .execute();
    const userId = (handle: Handle) => users.find((u) => u.handle === handle)!.id;

    const lastPosition = new Map<string | null, string | null>();
    const container = async (
      type: ContainerType,
      name: string,
      parent?: { id: string; type: ContainerType },
      visibility: 'public' | 'private' = 'public',
    ) => {
      const position = generateKeyBetween(lastPosition.get(parent?.id ?? null) ?? null, null);
      lastPosition.set(parent?.id ?? null, position);
      return tx
        .insertInto('containers')
        .values({
          type,
          name,
          visibility,
          position,
          parent_id: parent?.id ?? null,
          parent_type: parent?.type ?? null,
        })
        .returning(['id', 'type'])
        .executeTakeFirstOrThrow();
    };

    const workspace = await container('workspace', 'Flowboard');
    const engineering = await container('space', 'Engineering', workspace);
    const q4Launch = await container('folder', 'Q4 Launch', engineering);
    const backlog = await container('list', 'Backlog', q4Launch);
    const sprint12 = await container('list', 'Sprint 12', q4Launch);
    const platform = await container('folder', 'Platform', engineering);
    const onCall = await container('list', 'On-call', platform);
    const marketing = await container('space', 'Marketing', workspace, 'private');
    const campaigns = await container('folder', 'Campaigns', marketing);
    const launchContent = await container('list', 'Launch Content', campaigns);

    const status = (
      owner: { id: string },
      key: string,
      name: string,
      category: StatusCategory,
      color: string,
      position: string,
    ) => ({ container_id: owner.id, key, name, category, color, position });
    const override = (owner: { id: string }, key: string, changes: { name?: string; hidden?: boolean }) => ({
      container_id: owner.id,
      key,
      name: changes.name ?? null,
      hidden: changes.hidden ?? false,
    });

    await tx
      .insertInto('status_definitions')
      .values([
        // Workspace defaults
        status(workspace, 'todo', 'To Do', 'not_started', '#9CA3AF', 'a0'),
        status(workspace, 'in_progress', 'In Progress', 'active', '#3B82F6', 'a1'),
        status(workspace, 'done', 'Done', 'done', '#22C55E', 'a2'),
        status(workspace, 'closed', 'Closed', 'closed', '#6B7280', 'a3'),
        // Marketing space: its own workflow, replacing the defaults
        ...['todo', 'in_progress', 'done', 'closed'].map((key) => override(marketing, key, { hidden: true })),
        status(marketing, 'idea', 'Idea', 'not_started', '#A855F7', 'a0'),
        status(marketing, 'drafting', 'Drafting', 'active', '#F59E0B', 'a1'),
        status(marketing, 'scheduled', 'Scheduled', 'active', '#06B6D4', 'a2'),
        status(marketing, 'published', 'Published', 'done', '#22C55E', 'a3'),
        // Platform folder: adds Blocked
        status(platform, 'blocked', 'Blocked', 'active', '#EF4444', 'a1V'),
        // Sprint 12 list: adds In Review, renames Done, hides Closed
        status(sprint12, 'in_review', 'In Review', 'active', '#8B5CF6', 'a1V'),
        override(sprint12, 'done', { name: 'Shipped' }),
        override(sprint12, 'closed', { hidden: true }),
      ])
      .execute();

    const field = (
      owner: { id: string; type: ContainerType },
      key: string,
      name: string,
      type: FieldType,
      position: string,
      extra: { required?: boolean; options?: FieldOption[] } = {},
    ) => ({
      container_id: owner.id,
      container_type: owner.type,
      key,
      name,
      type,
      position,
      required: extra.required ?? false,
      options: JSON.stringify(extra.options ?? []),
    });

    await tx
      .insertInto('field_definitions')
      .values([
        field(engineering, 'estimate', 'Estimate (pts)', 'number', 'a0'),
        field(q4Launch, 'severity', 'Severity', 'single_select', 'a0', {
          required: true,
          options: severityOptions,
        }),
        field(q4Launch, 'component', 'Component', 'multi_select', 'a1', {
          options: [
            option('api', 'API'),
            option('web', 'Web'),
            option('mobile', 'Mobile'),
            option('infra', 'Infra'),
          ],
        }),
        field(sprint12, 'needs_qa', 'Needs QA', 'checkbox', 'a0'),
        field(platform, 'runbook', 'Runbook link', 'text', 'a0'),
        field(campaigns, 'channel', 'Channel', 'single_select', 'a0', {
          required: true,
          options: [
            option('blog', 'Blog'),
            option('email', 'Email'),
            option('social', 'Social'),
            option('video', 'Video'),
          ],
        }),
        field(campaigns, 'publish_date', 'Publish date', 'date', 'a1'),
      ])
      .execute();

    const lists = {
      Backlog: backlog,
      'Sprint 12': sprint12,
      'On-call': onCall,
      'Launch Content': launchContent,
    };
    for (const [listName, tasks] of Object.entries(tasksByList)) {
      const list = lists[listName as keyof typeof lists];
      await insertTasks(tx, list.id, tasks, userId);
    }

    await tx
      .insertInto('grants')
      .values([
        { container_id: onCall.id, user_id: userId('bob'), mode: 'deny' },
        { container_id: marketing.id, user_id: userId('carol'), mode: 'allow' },
      ])
      .execute();

    // The seed goes through the same rules as the API, so it can never create an invalid board.
    await verifySubtree(tx, workspace.id);
  });
}

async function insertTasks(tx: Db, listId: string, tasks: SeedTask[], userId: (handle: Handle) => string) {
  const path = await getListPath(tx, listId);
  const statusKeys = new Set((await resolveForPath(tx, path)).map((s) => s.key));
  const fields = await resolveFieldsForPath(tx, path);
  const lastInColumn = new Map<string, string>();

  for (const task of tasks) {
    if (!statusKeys.has(task.status))
      throw new Error(`Seed: "${task.status}" isn't a status of ${path.at(-1)!.name}`);
    const { values, issues } = validateCustomFields(fields, task.fields ?? {}, 'create');
    if (issues.length > 0) throw new Error(`Seed: "${task.title}": ${JSON.stringify(issues)}`);

    const position = generateKeyBetween(lastInColumn.get(task.status) ?? null, null);
    lastInColumn.set(task.status, position);
    const { id } = await tx
      .insertInto('tasks')
      .values({
        list_id: listId,
        title: task.title,
        description: task.description ?? '',
        status_key: task.status,
        priority: task.priority,
        due_date: task.due ? new Date(task.due) : null,
        custom_fields: JSON.stringify(values),
        position,
        created_by: userId('alice'),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    if (task.assignees?.length) {
      await tx
        .insertInto('task_assignees')
        .values(task.assignees.map((h) => ({ task_id: id, user_id: userId(h) })))
        .execute();
    }
  }
}

/** Empties every table. Used by `make seed` and the test suite. */
export async function resetDatabase(db: Db): Promise<void> {
  await sql`TRUNCATE users, containers, status_definitions, field_definitions, tasks, task_assignees, grants`.execute(
    db,
  );
}

if (import.meta.main) {
  const db = createDb(loadConfig().DATABASE_URL);
  try {
    const reset = process.argv.includes('--reset');
    const { count } = await db
      .selectFrom('users')
      .select(sql<number>`count(*)::int`.as('count'))
      .executeTakeFirstOrThrow();
    if (count > 0 && !reset) {
      console.log('Database already has data; skipping seed (use --reset to start over)');
    } else {
      if (reset) await resetDatabase(db);
      await seed(db);
      console.log('Seeded demo data');
    }
  } finally {
    await db.destroy();
  }
}
