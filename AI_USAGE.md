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
