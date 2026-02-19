---
name: simulate
description: "Command: simulate"
---

Use this as your battle-test prompt:

```md
Simulate a brand-new user onboarding to better-convex and execute end-to-end in 2 phases.

Hard rules:

1. Use only this skill:
   - `skills/convex/SKILL.md`
2. No other implementation skills unless blocked; if blocked, log it as a skill gap.
3. No git commit/push/PR.
4. Keep all tracking artifacts updated continuously.
5. No cheating: do not read existing implementation files from this repo.
   Allowed reads are docs/skills and files you create in the simulation workspace.
6. Be realistic:
   - If Convex bootstrap is missing, do not fake generated files.
   - Try non-interactive bootstrap first:
     `bunx convex dev --once --configure new --team <team_slug> --project <project_slug> --dev-deployment local`
   - If team/project info is unavailable or bootstrap still blocks, ask the user to run `better-convex dev` interactively, then continue after confirmation.
7. Do not declare success until verification is green (or an explicit blocker is logged with evidence).

Planning/tracking:

- Initialize and maintain:
  - `task_plan.md`
  - `progress.md`
  - `findings.md`
- If files already exist, append a new run section. Do not erase prior history.
- In `findings.md`, log every friction point with:
  - `severity: blocker|major|minor`
  - `phase: 1|2`
  - `source: absolute file path + section`
  - `issue`
  - `proposed fix`

Phase 1 (setup only):

- Start by asking the exact intake questions expected by:
  - `www/content/docs/index.mdx`
  - `skills/convex/references/setup.md`
- Then run setup using these choices:
  - Approach: Top-down
  - Framework: Next.js App Router
  - Database: ORM (`ctx.orm`)
  - Auth: Better Auth
  - SSR/RSC: Yes
  - Triggers: Yes
  - Aggregates: No
  - Rate Limiting: Yes
  - Scheduling: No
  - HTTP router: Yes
  - RLS: No
  - Auth plugins: none
- Deliver a working baseline app per setup docs.
  - Baseline must include `withOrm` using `orm.with(ctx)` from setup docs.
  - Baseline must include provider composition so `useCRPC` runs under `CRPCProvider` (no runtime provider crash).

Phase 2 (feature):

- Add a real feature: “Projects + Tasks”
  - cRPC coverage in `convex/lib/crpc.ts` must include:
    - `publicQuery`
    - `optionalAuthQuery`
    - `authQuery`
    - `publicMutation`
    - `optionalAuthMutation`
    - `authMutation`
  - Schema: `project`, `task`
  - Procedures: create/list project, create/list/toggle task
  - Auth-protected writes with `.meta({ rateLimit: ... })`
  - `CRPCError` for expected failures (`UNAUTHORIZED`, `NOT_FOUND`)
  - Trigger: keep `project.updatedAt` and `project.openTaskCount` in sync from task changes
  - React page using `useCRPC` + TanStack Query
  - One HTTP route exposing project tasks
- Add focused validation/tests for:
  - auth rejection
  - not-found path
  - trigger side effect correctness

Verification required before final output:

- `bunx better-convex codegen`
- `bunx tsc --noEmit`
- `bun test`
- Browser smoke using `agent-browser` (headed) on `http://localhost:3000`:
  - root route renders without application error/HTTP 500
  - at least one interactive element appears in snapshot
- If any check fails, fix and re-run. Only stop when all pass or a hard blocker is documented.

Final output:

- Summary of what worked
- Top 10 skill/doc improvements
- Exact patch suggestions (target file + replacement text) for:
  - `skills/convex/SKILL.md`
  - `skills/convex/references/setup.md`
  - any other impacted doc in `www/content/docs/`
```
