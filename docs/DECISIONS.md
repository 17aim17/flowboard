# Decisions

Each entry covers the decision, why I made it, what I rejected, the trade-off, and when I'd revisit it. The lens throughout is speed versus quality, scalability, performance and reliability. Design details are in `DESIGN.md`.

---

## D-01 Node.js + TypeScript (Fastify) and React, not Go and Vue

- **Decision:** Fastify on Node 24 with TypeScript for the API, and React 19 + Vite for the web app.
- **Why:** I've shipped production React/TypeScript/Node for years, so in a 3-4 day window this is where my speed and quality are highest. The parts that matter (data model, resolution algorithms, API contract, permission rules) don't depend on the framework: they live in SQL, plain TypeScript functions and an OpenAPI document that a Go service or Vue client could implement unchanged. Fastify over Express: built-in schema-based validation and serialization, pino logging, request IDs, and an `inject()` test harness without a real socket.
- **Rejected:** Go (I'd be learning while building, which risks correctness on exactly the parts being graded). Vue (same reason; I can explain the React state model in depth). NestJS (decorators and DI add a layer I'd have to defend and don't need at this size).
- **Trade-off:** It doesn't match their production stack. Porting cost is low because contracts and SQL carry over.
- **Revisit:** If the team standard is Go for services, the resolution and validation functions are small and pure, so they port directly.

## D-02 Postgres with Kysely and SQL migrations

- **Decision:** Postgres 18. Kysely as a typed query builder. Migrations are hand-written SQL inside Kysely migration files, checked in.
- **Why:** The domain is relational (tree, FKs, grants) with one semi-structured part (custom field values), which `jsonb` + GIN handles well. Kysely keeps the SQL visible, so the interview conversation is about the SQL that runs, and recursive CTEs and jsonb operators don't fight an ORM.
- **Rejected:** Prisma (weak at recursive CTEs and jsonb, plus a generated client and engine to explain). Drizzle (good, but its schema DSL plus generated diffs is a second source of truth next to the SQL). MongoDB (the tree, grants and FKs want relational integrity).
- **Trade-off:** Hand-written DB row types for about 9 tables, kept next to the migrations.
- **Revisit:** If the schema grows past about 30 tables, generate types from the DB (`kysely-codegen`).

## D-03 One `containers` table for workspace, space, folder and list

- **Decision:** A single adjacency-list table with a `type` column. Parent validity is enforced by a composite FK `(parent_id, parent_type) -> (id, type)` plus a CHECK on allowed type pairs.
- **Why:** All four types share shape and behavior (name, position, archive, visibility, grants, owning config). Statuses, fields and grants can then use a real FK `container_id` instead of an unenforceable polymorphic `owner_type/owner_id`. The DB itself rejects a list under a space.
- **Rejected:** A table per type (four near-identical tables, and polymorphic owner columns without FKs). Closure table, ltree or materialized path (they speed up deep-subtree queries, but depth is fixed at 4, and they make moves more expensive).
- **Trade-off:** Type-specific columns would be nullable here. There are none today.
- **Revisit:** If types diverge significantly (for example lists gain many list-only settings), add a 1:1 `list_settings` table.

## D-04 Strict nesting: lists live only in folders

- **Decision:** workspace > space > folder > list, exactly as the spec lists it.
- **Why:** The simplest valid reading. Every list has the same path shape, so resolution and permission code has no optional levels.
- **Rejected:** Folderless lists (a ClickUp feature). They'd be easy to add because the resolution walks whatever path exists, but they're untested surface.
- **Revisit:** If product wants folderless lists, extend the CHECK to allow `list` under `space`. The algorithms already handle a path of any length.

## D-05 Status inheritance: merge by key

- **Decision:** Walk workspace, space, folder, list. A row with a new key adds a status. A row with an inherited key overrides name/color/position, or hides it with `hidden = true`. Category can't be overridden.
- **Why:** It's the only model that supports all four operations the spec lists (inherit, override, add, hide) without copying, and it stays one loop. Locking category keeps meaning stable: "done" means done everywhere the key appears, so reports and the move policy can rely on it.
- **Rejected:** "Override set replaces parent" (simpler, but a list that wants one extra column must copy the whole parent set, and later parent changes silently stop propagating). Copy-on-create (lists get their own copies, and inheritance becomes a one-time template).
- **Trade-off:** It needs an invariant (one origin row per key per path) and write-time checks to keep it true. These are covered by tests.
- **Revisit:** If users need "detach from parent", add a per-container `inherit_statuses boolean` that starts resolution at that container.

## D-06 Tasks store `statusKey`, not a status row id

- **Decision:** `tasks.status_key text`, validated against the resolved set of the task's list.
- **Why:** With merge-by-key, a status at a given list may come from several rows (origin plus overrides), so no single row id is "the" status. The key is the stable identity across levels, and it makes cross-list moves comparable (same key and category means same status). The spec explicitly allows a stable statusKey.
- **Rejected:** Storing the origin row id (a FK that looks like integrity but can't express "valid for this list", plus extra joins).
- **Trade-off:** No DB FK on the status. Validity is enforced in the service layer under locks (D-14) and covered by T3 and T7.

## D-07 In-use statuses: block, don't remap

- **Decision:** Hiding or deleting a status that any task in the affected subtree uses returns 409 `STATUS_IN_USE` with the affected lists, counts and task ids. Nothing changes.
- **Why:** It's the safest default for a lead to pick: no silent data changes, and the user decides where tasks go. It keeps the invariant "every task's status is in its list's resolved set" true at all times, so the board can't have orphan cards.
- **Rejected:** Archive and auto-remap (silently moves work, needs an audit trail and a target choice). Soft-disable (tasks keep a status that has no column, which is exactly the orphan board state the spec warns about).
- **Trade-off:** Cleanup takes more clicks for admins.
- **Revisit:** Add an explicit `remapTo` parameter on delete that moves tasks and then deletes, all in one transaction.

## D-08 Custom field keys are unique per workspace, and fields aren't overridable

- **Decision:** A unique index on `field_definitions.key` (including archived rows). The resolved schema is the concatenation of space, folder and list definitions.
- **Why:** Field values are typed data stored on tasks. If a list could redefine `estimate` from number to text, the same key would hold different types in different lists, and moves and filters would break. One key means one type, enforced by the DB, and collisions fail loudly at definition time (409).
- **Rejected:** Merge by key like statuses (override of type is unsafe, and override of required/options adds rules nobody asked for). Per-path uniqueness (sibling branches could reuse keys with different types).
- **Trade-off:** Two teams can't both have their own field called `estimate`.
- **Revisit:** Allow narrow overrides (`required`, option subset) per container if product asks.

## D-09 Field definition changes: soft delete, keep orphan values, block unsafe edits

- **Decision:** Deleting a field archives it. Values stay in task jsonb and are left out of responses. Type change or option removal while in use returns 409. Making a field required isn't retroactive: it's enforced on create and move, and on update you can't clear it.
- **Why:** Deletes are cheap and reversible, with no big rewrite of task rows. Keeping the key reserved means old values can never be read under a new, incompatible definition. A retroactive required flag would make every old task fail on unrelated edits such as a kanban drag.
- **Rejected:** Strip values on delete (an irreversible bulk write inside a request). Block delete while in use (frustrating, and the field may be used by thousands of tasks).
- **Revisit:** A background job that purges values of fields archived for more than N days, via the outbox worker.

## D-10 Cross-list move: keep, map by category, else reject

- **Decision:** Keep the key if the destination has it with the same category. Otherwise use the destination's first status of the same category. If neither works, 409 `STATUS_UNMAPPABLE`, and the client can pass `statusKey` explicitly. Destination required fields must be present in existing values plus the move payload, else 400.
- **Why:** Category is the semantic meaning, so mapping by it preserves "this work is in progress" across differently named workflows. Only `closed` can be unmappable, because every set has the other three. That gives a natural reject path, and both outcomes are tested.
- **Rejected:** Always reset to the first `not_started` (loses progress). Always reject (makes moves painful between lists that differ only in labels).

## D-11 Archive containers, hard delete tasks

- **Decision:** Containers get `archived_at`, and archived subtrees read as 404, with a restore endpoint. Tasks are hard deleted, and the `task.deleted` outbox event keeps the record.
- **Why:** Archiving a container is a large blast-radius action that must be reversible. A single task delete is small, and soft-deleted tasks would leak into every query and in-use check.
- **Revisit:** Task trash with 30-day retention if users ask.

## D-12 Fractional index strings for ordering

- **Decision:** `position text collate "C"` using the `fractional-indexing` package. The client sends neighbor ids, and the server computes the key.
- **Why:** A reorder updates one row instead of renumbering a column. That keeps writes small and the outbox event meaningful ("task moved", not 40 rows changed). Server-side computation means clients can't send arbitrary positions.
- **Rejected:** Integer positions with renumbering (O(n) writes per drag). Floats (precision runs out after repeated bisection).
- **Trade-off:** Keys grow with repeated inserts at the same spot (rare in practice). Concurrent inserts between the same neighbors could pick the same key, which is prevented by the per-list lock (D-14).

## D-13 Config changes are admin-only

- **Decision:** Containers, statuses, fields and grants can only be changed by admins. Members can create, edit and move tasks in lists they can see.
- **Why:** Config changes cascade into subtrees the member may not see, and a 409 `STATUS_IN_USE` would leak task ids from lists they can't access. Admin-only avoids that whole class of problems.
- **Rejected:** "Members with edit access on that container" (needs an edit mode on grants and leak-safe error messages).
- **Revisit:** Add `mode: allow_edit` to grants and redact 409 details to counts only for non-admins.

## D-14 Path row locks for validation consistency

- **Decision:** Task writes lock the list row `FOR UPDATE` and its ancestors `FOR SHARE`. Config changes lock their owner container `FOR UPDATE`. Everything runs at READ COMMITTED.
- **Why:** Without this, a task can be validated against a status that a concurrent transaction is hiding, leaving an orphan. The locks make validation and config changes on the same path take turns, using plain row locks.
- **Rejected:** SERIALIZABLE everywhere (correct, but needs retry loops on every endpoint). A workspace-wide advisory lock (simpler, but serializes unrelated lists).
- **Trade-off:** Writes within one list are serialized. That's fine at this scale and also fixes position collisions.
- **Revisit:** Hot lists with heavy concurrent drags. Measure first.

## D-15 Permission rule: every container on the path must be accessible

- **Decision:** Visible if, for every space, folder and list on the path, there's an allow grant, or the container is public and has no deny. Admins bypass. Invisible but existing returns 403, and missing returns 404.
- **Why:** One rule, easy to state and test. Deny on an ancestor reliably hides everything below it.
- **Rejected:** "Nearest explicit grant wins" (allows a lower allow to reopen a denied subtree, which surprises admins). Grants that imply visibility of ancestors (needs "path-only" nodes in the tree).
- **Revisit:** Teams: grants get `principal_type user|team`, and the check expands the user's teams. Edit modes: see D-13.

## D-16 Outbox table + polling worker for async work

- **Scope:** built only if time allows after the MVP and required tests pass. Otherwise this stays a written design, which the PDF accepts (engineering expectation 6).

- **Decision:** Domain writes insert an `outbox` row in the same transaction. A separate worker process claims rows with `FOR UPDATE SKIP LOCKED`, writes `activity` idempotently (`ON CONFLICT (event_id) DO NOTHING`), and retries with backoff.
- **Why:** No dual-write problem, because the event exists if and only if the change committed. There's no new infrastructure (Postgres is already there), and delivery is at least once with idempotent consumers. This is the standard shape that later feeds a real broker.
- **Rejected:** Publishing to Redis/RabbitMQ from the request (dual write: the commit succeeds while the publish fails, or the reverse). LISTEN/NOTIFY alone (lost if no listener is connected). Kafka (operational weight with no benefit here).
- **Trade-off:** Polling adds about one second of latency and a light query per second.
- **Revisit:** Move to a relay (Debezium or a small publisher) into a broker when there are multiple consumers (automations, search, webhooks).

## D-17 Zod as the single schema source, shared in `packages/contracts`

- **Decision:** Zod schemas define request/response bodies. `fastify-type-provider-zod` uses them for validation and OpenAPI, and the web app imports the same schemas and the custom field validator.
- **Why:** One definition gives runtime validation, TS types, API docs and client-side form validation, so they can't drift.
- **Rejected:** TypeBox (closer to JSON Schema and faster, but less ergonomic for the dynamic per-list custom field schema). Hand-written OpenAPI (drifts).

## D-18 Mantine for UI primitives

- **Decision:** `@mantine/core` and `@mantine/dates`.
- **Why:** Drawer, Select, MultiSelect, DatePicker, Table, Skeleton and notifications come accessible out of the box, so the time goes into states and behavior rather than building inputs.
- **Rejected:** Tailwind + shadcn (more component code to own and review). MUI (heavier, harder to theme lightly). Plain CSS (time spent on inputs and focus handling).

## D-19 UUIDv7 primary keys generated by Postgres

- **Decision:** `DEFAULT uuidv7()` (built into Postgres 18).
- **Why:** Globally unique ids that are safe to expose. Time ordering keeps B-tree inserts local, and ids double as a creation-order tiebreaker in keyset pagination.
- **Rejected:** bigserial (enumerable, and the id leaks volume). UUIDv4 (random index inserts).

## D-20 Reliability and observability baseline

- **Decision:** Structured JSON logs (pino) with a request ID per request (accept incoming `x-request-id`, else generate, echo it in the response, include it in 500 bodies). `/health` for liveness, `/ready` with a DB ping. One error handler. Graceful shutdown.
- **Why:** This is the minimum to debug a production issue from a user report: the user gives the request ID from the error toast, and the logs show the whole request. It's cheap to add on day one and painful to retrofit.
- **Not built:** Metrics and tracing. The next step is OpenTelemetry auto-instrumentation for HTTP and pg, exported to a collector, plus RED metrics per route.

## D-21 Backend tests against real Postgres

- **Decision:** Vitest + Fastify `inject()` against a dedicated test database in the compose Postgres.
- **Why:** The invariants live partly in SQL (constraints, locks, jsonb queries). Mocking the DB would test the mocks.
- **Trade-off:** Slower than unit tests (seconds, not milliseconds). The pure resolution functions also get fast unit tests.

## D-22 `version` is required on task updates and moves

- **Decision:** PATCH and move must include the version the client last saw. A mismatch returns 409 `VERSION_CONFLICT` with the current task.
- **Why:** Prevents lost updates between two people editing the same task. It's also the conflict signal for optimistic drag-and-drop.
- **Rejected:** Last write wins (silent data loss). `If-Match` ETags (more HTTP-native, but clumsier in curl and the CLI). Easy to add later as an alternative.

## D-23 nginx serves the SPA and proxies the API on one origin

- **Why:** No CORS configuration, and it mirrors a typical production edge. The API is also exposed on :3000 for curl.

## D-24 Status, list and position change only through `POST /tasks/:id/move`

- **Decision:** `PATCH /tasks/:id` edits plain fields (title, description, priority, assignees, due date, custom fields). Anything that changes where a task sits (status, list, position) goes through `/move`. Status reorder is a `beforeKey/afterKey` option on the same `PUT .../statuses/:key` used to add or override, not a separate endpoint.
- **Why:** One code path for status validation, the cross-list mapping and position calculation, so it's tested once. A status change always needs a new position anyway (the task lands in another column). Fewer endpoints for the same behavior.
- **Rejected:** Allowing `statusKey` in PATCH too (two ways to do one thing, two places to keep in sync).
- **Trade-off:** The drawer's status dropdown calls `/move` instead of PATCH. That's a client detail.

## D-25 `task_assignees` join table instead of an array column

- **Decision:** One row per (task, user) with a composite primary key and FKs to both tables.
- **Why:** A task has many assignees and a user has many tasks (many-to-many). The join table gives real FKs (you can't assign a user that doesn't exist), no duplicates (primary key), a plain index for "tasks assigned to Bob", and room to grow (`assigned_at`, `assigned_by`).
- **Rejected:** `assignee_ids uuid[]` on tasks. Simpler (no join, one less table), and Postgres can index arrays, but it can't put a FK on array elements, so bad or deleted user ids go unnoticed.
- **Trade-off:** Task reads need one extra query or join to fetch assignees.
