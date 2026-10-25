# Decisions

Each entry covers the decision, why I made it, what I rejected, the trade-off, and when I'd revisit it. The lens throughout is speed versus quality, scalability, performance and reliability. Design details are in `DESIGN.md`.

---

## D-01 Node.js + TypeScript (Fastify) and React, not Go and Vue

- **Decision:** Fastify on Node 24 with TypeScript for the API, and React 19 + Vite for the web app.
- **Frontend shape:** a single-page app. Every screen is behind login, nothing needs SEO, and all data comes from our API, so the frontend is static files served by nginx. Next.js or React Router framework mode would add a second Node server that duplicates auth and data loading, with nothing gained for a logged-in app.
- **Why:** I've shipped production React/TypeScript/Node for years, so in a 3-4 day window this is where my speed and quality are highest. The parts that matter (data model, resolution algorithms, API contract, permission rules) don't depend on the framework: they live in SQL, plain TypeScript functions and an OpenAPI document that a Go service or Vue client could implement unchanged. Fastify over Express: built-in schema-based validation and serialization, pino logging, request IDs, and an `inject()` test harness without a real socket.
- **Rejected:** Go (I'd be learning while building, which risks correctness on exactly the parts being graded). Vue (same reason; I can explain the React state model in depth). Express (validation, structured logging, request IDs, OpenAPI and test injection would all be separate add-ons to wire and explain). Hono (excellent, but its strengths are edge runtimes; on Node it runs through an adapter and its logging and shutdown story is thinner). NestJS (modules, DI and decorators are a lot of concepts for this size, and decorators need a compile step that Node's built-in type stripping can't run).
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
- **Rejected:** Lists only (no inheritance; the PDF FAQ scores it as incomplete). "Override set replaces parent" (simpler, but a list that wants one extra column must copy the whole parent set, and later parent changes silently stop propagating). Copy-on-create (lists get their own copies, and inheritance becomes a one-time template). Named status schemes assigned to containers, like Jira workflow schemes (reusable, but it's "replace" with an extra layer and can't express "the parent's set plus one column").
- **How far an override reaches:** An override pins only what the list explicitly changed, one attribute of one status. Everything else keeps inheriting. With replace, copy or schemes, one local change detaches the list from every future parent change. Example: Sprint 12 renamed `done` to "Shipped" and hid `closed`. Then the workspace changes:

  | Workspace change                | Backlog  | Sprint 12 (merge by key)            | Sprint 12 (replace / copy) |
  | ------------------------------- | -------- | ----------------------------------- | -------------------------- |
  | Rename `in_progress` to "Doing" | Doing    | Doing (never touched it)            | In Progress (stale copy)   |
  | Rename `done` to "Complete"     | Complete | Shipped (its own choice wins)       | Shipped                    |
  | Recolor `done` to teal          | teal     | teal (only the name was overridden) | old color (stale copy)     |
  | Add a "Blocked" status          | gets it  | gets it (can hide it)               | doesn't get it             |

  A local choice is deliberate, so a parent change must not silently undo it. The settings page shows what was "changed here", and deleting that override makes the list follow the parent again.

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

- **Decision:** A move is allowed only when the status has a match in the destination: the client's explicit `statusKey`, the same key with the same category, or (mapped automatically) the destination's first status of the same category. With no match, 409 `STATUS_UNMAPPABLE` and nothing changes; there's no fallback to a different category. Destination required fields must be present in existing values plus the move payload, else 400.
- **Why:** Category is the semantic meaning, so mapping by it preserves "this work is in progress" across differently named workflows. Only `closed` can be unmappable, because every set has the other three. That gives a natural reject path, and both outcomes are tested.
- **Rejected:** Always reset to the first `not_started` (loses progress). Always reject (makes moves painful between lists that differ only in labels). Falling back to another category, such as closed to done ("done" means completed, which a closed task wasn't).

## D-11 Archive containers, hard delete tasks

- **Decision:** Containers get `archived_at`, and archived subtrees read as 404. The rows stay in the database; a restore endpoint is later work. Tasks are hard deleted.
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

- **Scope:** not built. On 2026-10-25 I decided to keep one stretch goal (optimistic drag-and-drop), so this stays a written design, which the PDF accepts (engineering expectation 6).

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

- **Decision:** PATCH and move must include the version the client last saw. A mismatch returns 409 `VERSION_CONFLICT` with `details: [{ currentVersion }]`; the client reloads the task.
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

## D-26 Node runs the TypeScript source directly (no build step for the API)

- **Decision:** `node src/server.ts`. Node 24 LTS strips types at load time, with no flag. `tsc` only checks types (`noEmit`).
- **Why:** One less tool and no `dist/` folder. Stack traces point at the real source files. Fewer moving parts in Docker.
- **Rules it imposes:** No TypeScript features that need compiling (`enum`, `namespace`, constructor parameter properties). `erasableSyntaxOnly` makes the compiler enforce this. Imports use `.ts` extensions.
- **Rejected:** `tsc` to `dist/` (extra build step and config), `tsx` (another runtime dependency doing what Node now does).
- **Revisit:** If we ever need syntax Node can't strip, add a `tsc` emit step. No code changes are needed.

## D-27 TypeScript 6.0, not 7

- **Decision:** TypeScript 6.0.3 everywhere.
- **Why:** TypeScript 7 is the rewritten compiler, and `typescript-eslint` (needed for type-aware linting) supports only versions below 6.1 today. 6.0 is the newest version the whole toolchain supports.
- **Revisit:** Move to 7 when `typescript-eslint` supports it. That's a version bump only.

## D-28 ESLint (type-aware) + Prettier, checked in CI

- **Decision:** ESLint with `typescript-eslint`'s type-checked rules, Prettier for formatting, and a GitHub Actions workflow that runs typecheck, lint and tests on every push.
- **Why:** Type-aware rules catch real async bugs (a forgotten `await` on a database call). Prettier ends formatting debates. CI keeps main green without relying on memory. These are the tools most engineers already know.
- **Rejected:** Biome (one fast tool for both jobs, but its type-aware rules are less complete than typescript-eslint's).

## D-29 React Router, not TanStack Router

- **Decision:** React Router in declarative mode.
- **Why:** The app has about 3 routes. React Router is the router most React developers know, so the code reads instantly.
- **Rejected:** TanStack Router (typed search params are nice, but file-based routing needs a Vite plugin and a generated route file, which is more machinery than 3 routes justify).

## D-30 Pragmatic drag and drop (Atlassian), not dnd-kit

- **Decision:** `@atlaskit/pragmatic-drag-and-drop` for the board. Each card also gets a "Move to..." menu for keyboard users.
- **Why:** It's actively maintained and powers the boards in Jira and Trello. `@dnd-kit/core` has had no release since Dec 2024, and its successor `@dnd-kit/react` is still pre-1.0.
- **Trade-off:** No built-in keyboard dragging. Atlassian's own accessibility guidance is an explicit "move" menu, which is also easier to test. It needs a little more glue code than dnd-kit's sortable presets.
- **Rejected:** dnd-kit (maintenance risk), react-beautiful-dnd (deprecated by Atlassian in favor of this library).

## D-31 Toolchain: mise for Node, corepack for pnpm

- **Decision:** `mise.toml` pins Node 24.21.0. `package.json` pins `"packageManager": "pnpm@12.6.0"` and corepack provides that exact pnpm. Docker images use the same versions.
- **Why:** Everyone (and CI and Docker) runs the same Node and pnpm, with no global installs to drift.

## D-32 Cursor pagination for growing collections, complete sets returned whole

- **Decision:** Users and tasks use cursor (keyset) pagination: `?limit&cursor`, response `{ data, page: { limit, nextCursor, hasMore } }`. The tree, resolved statuses and resolved fields return `{ data }` whole.
- **Why:** A cursor holds the last row's sort values, so the next page is `WHERE (sort, id) > (last)`. It uses the index, costs the same on page 1 and page 100, and doesn't skip or repeat rows when tasks are added. The `page` object makes paging explicit for every client. Config sets and the tree are bounded and needed whole (a board can't render half its columns).
- **Rejected:** Offset pagination (slower on deep pages, and inserts shift rows between pages). Paging the tree (the sidebar needs the full visible tree).
- **Revisit:** Very large workspaces: load the tree lazily per parent (`GET /containers/:id/children?cursor`).

## D-33 Repo layout: a pnpm monorepo, folders by domain inside the API

- **Decision:** `apps/` holds deployables (`api`, and `web` on day 2), each with its own `package.json` and Docker image. `packages/` holds shared libraries (`contracts`: API schemas and the custom field validator). Inside the API, code is grouped by domain (`modules/hierarchy`, `statuses`, `fields`, `tasks`, `identity`, `permissions`), each with `routes.ts` (HTTP only), `service.ts` (rules and SQL) and pure files with unit tests. A module never queries another module's tables.
- **Why:** One repo means one change updates the schema, the API and the web app together, with one compose file and one CI. A monorepo isn't a monolith: each app deploys on its own. Domain folders match the module boundaries the PDF asks for and keep one feature in one place. They also make extraction concrete: a module that only talks to others through exported functions can move into its own `apps/<service>` folder, with calls replaced by HTTP or events.
- **Growth path:** New services (`apps/activity-worker`, `apps/search-service`) and web apps (`apps/admin-web`) are new folders in `apps/`. Shared UI goes to `packages/ui`. When CI gets slow, add Turborepo or Nx to build only affected apps. Use `CODEOWNERS` per app for ownership. Move to separate repos only if teams need fully independent tooling.
- **Rejected:** Separate repos for API and web (shared types would need publishing and versioning). Layer folders (`controllers/`, `services/`, `repositories/`), which spread one feature across many folders and hide module boundaries. A repository layer over Kysely (typed queries are already readable; another layer adds files without clarity). Splitting `apps/` into `apps/` (frontends) and `services/` (backends) now: it reads well with many backends, but with one API it's extra structure, and it's a folder move later.

## D-34 Permission checks run in the route, before the write

- **Decision:** Every route that takes a container, list or task id calls `assertCanView(user, containerId)` first. It loads the path and the user's grants and applies the D-15 rule. Task routes look up the task's list first; a cross-list move checks both lists. The tree uses the same rule on the full container list (`filterVisible`), keeping a node only if its parent was kept.
- **Why:** One explicit line per route is easy to review ("does this route check access?") and keeps the service functions about domain rules only. Checking before the write means a refused request touches nothing.
- **Rejected:** A Fastify hook that guesses the resource from the URL (hides the check, and task routes need a lookup anyway). Filtering in SQL with a recursive query joined to grants (faster for huge trees, but harder to read and test than one function over at most a few hundred rows).
- **Trade-off:** The check runs outside the write transaction, so a grant removed in the same millisecond could let one write through. Grants change rarely, and the next request is refused. Each request also loads the path and grants again (two small indexed queries).
- **Admin-only routes** use a `preValidation` hook (`adminOnly`), so the role is checked before the body: a member gets 403, never a 400 that hints at the payload shape.
- **Revisit:** If permission queries show up in profiles, cache grants per user for a few seconds, or move the check into the transaction that already locks the path (D-14).

## D-35 Settings: one admin page per container, reorder with buttons

- **Decision:** `/settings/:containerId` shows the statuses and custom fields of any level, with a picker to switch levels. Statuses show the merged result plus where each comes from, and only offer actions this level can take: delete (defined here), hide (inherited), undo (changed here), show again (hidden here). Reordering uses up/down buttons. Errors from the server (409 with details) are shown as a list next to the action, inside the modal when one is open.
- **Why:** The PDF asks for "edit resolved vs local" for a list and a non-list level; one page that works for every level covers both with one component. Showing the resolved list (not just this level's rows) is what an admin needs to understand what lists will display. Up/down buttons are keyboard accessible and need no extra drag code.
- **Rejected:** Drag-and-drop reordering of statuses (more code for a rare admin action). A separate page per level type. Showing only this level's own rows (hard to understand without the inherited ones).
- **Trade-off:** Each up/down click is one request. The page is admin-only, which matches D-13; members don't see the link, and the API refuses them anyway.

## D-36 Frontend tests: one component test and two browser tests

- **Decision:** A Vitest + Testing Library test for `CustomFieldInput` (each field type renders the right input and reports the right value shape), and two Playwright tests against the running stack: the PDF path (Sprint 12 columns, edit Estimate, save, reload, value persisted) and Alice-to-Bob (private list disappears, direct URL shows "no access"). `make test` runs them in Docker, in the official Playwright image pinned to the same version as the package.
- **Why:** The rules that matter (validation, inheritance, permissions) live in the API and the shared validator and are tested there. The UI tests cover what only the UI can get wrong: sending a number as a string, and the end-to-end flow working in a real browser.
- **Rejected:** Mocking the API in the browser tests (would test the mocks). A fresh database per browser test run (would reset the demo data a reviewer may be looking at); the edit test uses a random value instead, so it can run again on the same data.
- **Trade-off:** Drag and drop, the optimistic rollback and the settings screens are checked by hand, not by tests. The browser tests share the demo database, so they run one at a time.

## D-37 Switching users remounts the app

- **Decision:** The current-user provider renders the app under `key={handle}`, so switching users unmounts and remounts everything, after clearing the query cache. It also listens for the browser `storage` event, so other open tabs switch too.
- **Why:** Clearing the cache alone left mounted queries showing the previous user's data (found when `/me` decided whether to show Settings). And one tab switching users changed the header every other tab sends, while those tabs still showed the old name.
- **Rejected:** Putting the user handle in every query key (easy to forget in one place). Keeping the user in memory per tab (each tab could then be a different user, which is confusing with a single mock login).
- **Trade-off:** A switch loses unsaved form input. It's a mock login, and real login would reload the page anyway.
