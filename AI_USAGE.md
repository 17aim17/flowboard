# AI usage

Tool: Claude Code (Claude Opus 5.5) in the terminal, used as a pair programmer. I review every change before committing. This log records the prompts, what the AI produced, and what I corrected or rejected.

## Log

### 2026-10-23: design

- **Prompt:** A written brief with my preferred stack and policies, plus the assignment PDF, asking for `docs/DESIGN.md` before any code. A follow-up added JD context: reliability and observability basics, UX states, keyboard-accessible drag-and-drop, a CRM evolution section, and deploy as a stretch goal.
- **AI produced:** `docs/DESIGN.md` and `docs/DECISIONS.md`.
- **Corrections / rejections:**
  - The AI tried to fit a third stretch goal (deploy) on top of the PDF's limit of two, and asked me to choose. I told it to follow the assignment. Scope is now exactly the PDF: two stretch goals (optimistic drag-and-drop, activity feed via outbox), with deploy and the other extras deferred.
  - The assignment PDF is kept in `docs/` under its original filename as the single source of truth.

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
