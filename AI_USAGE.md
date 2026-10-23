# AI usage

Tool: Claude Code (Claude Opus 5.5) in the terminal, used as a pair programmer. I review every change before committing. This log records the prompts, what the AI produced, and what I corrected or rejected.

## Log

### 2026-10-23: design

- **Prompt:** A written brief with my preferred stack and policies, plus the assignment PDF, asking for `docs/DESIGN.md` before any code. A follow-up added JD context: reliability and observability basics, UX states, keyboard-accessible drag-and-drop, a CRM evolution section, and deploy as a stretch goal.
- **AI produced:** `docs/DESIGN.md` and `docs/DECISIONS.md`.
- **Corrections / rejections:**
  - The AI tried to fit a third stretch goal (deploy) on top of the PDF's limit of two, and asked me to choose. I told it to follow the assignment. Scope is now exactly the PDF: two stretch goals (optimistic drag-and-drop, activity feed via outbox), with deploy and the other extras deferred.
  - The assignment PDF is kept in `docs/` under its original filename as the single source of truth.
