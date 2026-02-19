Use this as your battle-test prompt:

```md
I want you to simulate onboarding for a brand-new better-convex app and ship a full-stack demo app (not toy CRUD).

CRITICAL: do this in a brand-new repository at `/tmp/simulation-1` (create it first if missing). All code, planning files, and verification artifacts must live under `/tmp/simulation-1`. Do **not** read or modify the current repository (cheating is a hard blocker).

Use `skills/convex/SKILL.md` for implementation and `.codex/skills/planning-with-files/planning-with-files.mdc` for tracking/reporting.

Track progress in `task_plan.md`, `progress.md`, and `findings.md`; log blockers/friction continuously in `findings.md`.

Target coverage: Next.js App Router, Better Auth, org/admin, not polar (no subscription), cRPC procedure families (`public*`, `optionalAuth*`, `auth*`, `private*` where needed), ORM schema across users/orgs/todos/projects/tags/comments/subscriptions, triggers, aggregates, rate limiting, HTTP routers/routes, React Query + RSC usage, and seed/reset flows.

Also make ORM coverage broad at a product level (excluding RLS): data integrity rules, relationship modeling depth, safe read/write behavior under load, and automatic data consistency side effects.

Then verify with codegen, typecheck, tests, and headed browser smoke across key app routes (public, auth, todos, projects, tags, org, http demo), and report what worked, blockers/friction, and concrete doc patch suggestions.

Final mandatory step: run `agent-browser` smoke checks at the end (after all fixes), capture that evidence, and do not mark complete before it passes.

Keep implementation specifics aligned with `skills/convex/references/setup.md`.
```
