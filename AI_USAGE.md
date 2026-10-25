# AI usage

Tool: Claude Code (Claude Opus 5.5) in the terminal, used as a pair programmer. I review every change before committing. This log records the prompts, what the AI produced, and what I corrected or rejected.

## Log

### 2026-10-23: design

- **Prompt:** A written brief with my preferred stack and policies, plus the assignment PDF, asking for `docs/DESIGN.md` before any code. A follow-up added JD context: reliability and observability basics, UX states, keyboard-accessible drag-and-drop, a CRM evolution section, and deploy as a stretch goal.
- **AI produced:** `docs/DESIGN.md` and `docs/DECISIONS.md`.
- **Corrections / rejections:**
  - The AI tried to fit a third stretch goal (deploy) on top of the PDF's limit of two, and asked me to choose. I told it to follow the assignment. Scope is now exactly the PDF: two stretch goals (optimistic drag-and-drop, activity feed via outbox), with deploy and the other extras deferred. (Later reduced to one stretch goal; see 2026-10-25.)
  - The assignment PDF is the single source of truth. It's kept locally and not committed.

### 2026-10-23: tooling and library review

- **Prompt:** Asked the AI to review every library as if this were a production project (low maintenance, easy to read, defensible), to use mise for Node and corepack for pnpm, and to keep scope to the PDF.
- **AI produced:** A library review, the workspace setup, and decisions D-26 to D-31.
- **Corrections / rejections:**
  - The AI first pinned pnpm through mise. I asked for corepack instead (pinned by `packageManager`), with mise only for Node.
  - The AI had picked TypeScript 7 because it was the latest release, without checking the tooling. On review it found `typescript-eslint` doesn't support TS 7 yet, so we moved to 6.0.
  - On my prompt to review for production, it replaced TanStack Router with React Router (simpler for 3 routes), and dnd-kit (no release since Dec 2024) with Atlassian's Pragmatic drag and drop.
  - It proposed production extras (rate limiting, Sentry, OpenTelemetry, deploy). I kept them out of scope and asked for them to be listed as later work (DESIGN.md section 18).

### 2026-10-23/24: day 1 build (hierarchy, statuses, fields, seed, auth)

Important prompts, in order:

- "Whatever is listed on day 1, do it. Use my GitHub account." The AI built the workspace, schema, seed and modules and created a private repo.
- "Why Fastify, not Express, Hono or NestJS?" The AI explained; I had it add the rejected options to D-01.
- "Make small commits instead of big ones, so they are easy to go over." The AI split its pending work into one-concern commits and kept doing so.
- "Before you go on, is there anything ambiguous in the assignment that you're assuming?" The AI listed 25 assumptions, 10 of them small coding-time decisions I hadn't seen.
- "Do not over-engineer this; it should be simple to understand. Even though it's production-grade, it's still an assignment." The AI removed container reparenting, a restore endpoint, custom field reordering and users paging. They are listed as later work in DESIGN.md section 18.
- "Why merge-by-key inheritance, what were the other models? Why reject a move without a status mapping? Did you think of pagination? Go with cursor-based pagination, and the response structure should reflect it." The AI added the full model comparison to D-05, explained that moves already map by category (only `closed` can be rejected), and made pagination explicit: `{ data, page: { limit, nextCursor, hasMore } }` (D-32).

Corrections:

- The AI had added features beyond the PDF (reparenting containers, restore, field reordering). I had them removed.
- When simplifying, the AI dropped pagination from `/users`. I asked for cursor pagination with an explicit response shape, so it went back in, in a consistent form.
- Kysely 0.29 moved the migrator to `kysely/migration`; the AI's first import failed typecheck and was fixed.

### 2026-10-24: day 1 verification

- **Checks run:** `docker compose up --build` from an empty volume (migrate, seed, API healthy), `make test` in Docker (42 API tests), plus 10 validator and 7 resolution unit tests locally, and CI on GitHub.
- **Mutation check on AI-written tests:** all 42 API tests passed on the first run, so the AI disabled the "status in use" check on purpose and confirmed the two T7 tests then fail. The tests assert real outcomes, not just "no error".
- **AI mistakes caught:**
  - A smoke-test shell script passed headers through an unquoted zsh variable, which sent a malformed header. The API was fine; the script was rewritten in Python.
  - `GET /tree` first came back sorted by position across the whole workspace, mixing siblings from different parents. Fixed to depth-first tree order, with a test.
  - The first CI run failed: corepack's pnpm wasn't on mise's PATH in the runner. Fixed with `mise reshim`.
  - The AI's test helper used an `eslint-disable` comment for `any`; replaced with a lint override scoped to test files.

### 2026-10-24: move policy confirmed

- **Prompt:** "When moving from one list to another, make sure the move is only allowed if either a mapping exists or a category exists."
- **Outcome:** This matched the planned policy. The AI tightened the wording in DESIGN.md section 7 and D-10, and settled its own open question: no fallback from `closed` to `done`; an unmatched move is refused with 409.

### 2026-10-24: day 2, tasks API

- **Prompt:** "Start with day 2." The AI built the task schemas, the task service (list with cursor pagination and three sort orders, create, update, move, delete) and 26 API tests covering T3, T4, T5, T6 and T9, plus reordering and paging.
- **AI-generated test that had to be fixed:** the stale-version test renamed a task, then looked it up by its old title, so it crashed instead of asserting. The API was correct; the test now looks the task up by id.
- **Mutation check:** with the category mapping switched off, the two T4 mapping tests fail, so they test real behavior.

### 2026-10-24: day 2, web app

- **Built:** the React app (sidebar tree, kanban board with drag and drop and a keyboard "Move" menu, list view with server-side sort and paging, task drawer with generated custom field inputs) and an nginx image serving it on :8080.
- **Checked in a real browser** (Chrome DevTools): Sprint 12 and Backlog show different columns; a drag saved on the server with the expected fractional position; editing a custom field saved and bumped the version; a missing required field was blocked in the form with the same message as the API; the table sorted by due date with undated tasks last. **The stretch goal (optimistic UI + conflict handling):** Carol changed a task through the API, then dragging the stale card on Alice's board snapped it back, showed "Someone else just changed this task" and reloaded the board with Carol's change.
- **AI mistakes caught:**
  - The API container's healthcheck had failed since day 1: `localhost` resolves to IPv6 in Alpine while the API listens on IPv4. Nothing depended on API health until the web service did. Fixed by probing `127.0.0.1`.
  - A first draft of the board had an `isNoop` helper that compared the wrong columns, and the "Move down" and "Move to column" menu actions could go out of range. Both were caught in self-review before running.
  - `pnpm add` silently added a supply-chain exemption for `react-hook-form@7.91.0` (published less than a day earlier). The AI removed the exemption and pinned 7.90.0 instead of bypassing the check.
  - The "Saved" toast covered the drawer's Save button; moved notifications to the top right.

### 2026-10-25: day 3, permissions, settings UI, frontend tests

- **Prompt:** "Do day 3, and tell me what you're planning and any assumptions you're going to make." The AI listed the plan and 8 assumptions first (keep the D-15 rule, 403 for hidden but existing, moves need access to both lists, members can read config but not change it, any user can be assigned, settings reorder via buttons, no UI for creating containers, the activity feed only if time is left), then built it.
- **Questions I asked along the way:** the testing strategy for backend and frontend; whether spaces and lists can be reordered (API yes, UI no, moved to "Later"); what the lock icon means; whether "Flowboard" is the workspace and whether there can be more than one. The multi-tenant answer was added to DESIGN.md section 16.
- **Built:** view permissions on the tree and every read and write (9 tests for T1); a settings page for statuses and custom fields at any level; a component test for custom field inputs; two Playwright tests; `make test` running everything in Docker.
- **Mutation checks:** with the permission check forced to "allow", the 5 direct-access T1 tests fail. With the number input reporting a string, the component test fails.
- **Bugs found while checking in the browser:**
  - Switching users cleared the query cache, but components already on screen kept the previous user's data. This dated from day 2 and was only visible once a query (`/me`) differed between users. Fixed by remounting the app per user (D-37).
  - I was using the app in another tab. When I switched user there, the AI's tab kept showing "Alice" while sending requests as Carol, and an admin action returned 403. The server was right; the UI was misleading. Fixed by following the `storage` event.
  - The settings page's first draft showed errors behind open modals, repeated the error message twice when there were no details, and said "every list inside it" for a list. All fixed before committing.
- **AI-written tests that had to be fixed:**
  - The component test looked up select inputs by the `textbox` role; Mantine 9 exposes them as `combobox`. Then the dropdown didn't open in jsdom until the test rendered Mantine with `env="test"` (no transitions or portals).
  - The first Playwright test pressed Escape to close the drawer after a reload, before the drawer had reopened from the URL, then clicked a card under the drawer's overlay. The test now checks the value in the reopened drawer, which is also the stronger check.
  - The test setup's browser polyfills failed lint (`unbound-method`) and then typecheck in two rounds; they are now plain assignments, since they only run in jsdom.
- **Doc corrections:** DESIGN.md still listed a grants API and a worker that were never built. The grants API moved to "Later"; the worker is marked as planned.
- **Scope decision:** after reviewing the list of stretch goals, I decided to keep only one (optimistic drag-and-drop with conflict handling). The activity feed stays a documented design. The AI updated README, DESIGN and D-16 to say so.

### 2026-10-25: review by a second agent, and a mutation sweep

- **Prompt:** "Get everything reviewed by a subagent with respect to the assignment's must-haves." A separate agent with no context from this session read the PDF, the code and the docs, ran `make test`, and probed the running app.
- **It found every must-have implemented, plus these real gaps, all fixed:**
  - `PATCH /tasks/:id` accepted `statusKey` and silently ignored it (200). PDF scenario 3 expects a 400 for an unknown status on update. Task bodies are now strict, with a test.
  - The due-date index didn't match the sort expression (`coalesce(due_date, 'infinity')`), so the README's "deep pages are as fast" claim was false for that sort. New migration with an expression index; checked with `EXPLAIN` that the keyset query is an index scan.
  - The diagram didn't show where statuses and fields attach to the tree (the PDF asks for it). Added to the README.
  - A member sending a malformed body to an admin route got 400 instead of 403. The role is now checked in a `preValidation` hook, with a test.
  - Two admins creating the same field key at once could get a 500. The insert now uses `ON CONFLICT DO NOTHING` and returns 409.
  - The validator unit tests weren't part of `make test`, although the README said so. Added.
  - The browser test left a changed value in the demo data. It now puts it back.
  - Doc contradictions: the 409 VERSION_CONFLICT payload, "restorable" containers, a dead link to the uncommitted PDF, section numbers, and old stretch goal wording.
- **Not changed, on purpose:** required fields stay non-retroactive on update (D-09); the `Co-Authored-By` trailer stays (I approved it on day 1).
- **Prompt:** "Make sure whatever tests you have written are meaningful." The AI broke 25 rules in the code one at a time (type checks, required fields, unknown status, versions, in-use checks, key conflicts, the category invariant, tree filtering, direct-access checks, admin-only, 401, stale neighbors) and ran the suites each time. 24 were caught. Removing the "neighbors must be adjacent" check failed no test, so a test for it was added.
- **AI mistake:** the mutation script restored files with `git checkout`, which also threw away uncommitted edits. It reverted the new admin hook right before a commit (the commit didn't compile; caught before pushing and amended) and a just-written fix, which was redone. The script now restores from an in-memory copy.
