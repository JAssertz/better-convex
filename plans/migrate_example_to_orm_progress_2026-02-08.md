# Progress Log: `example/` -> Better-Convex ORM Migration (2026-02-08)

## Session: 2026-02-08

### Phase 1: Discovery & Migration Design
- **Status:** complete
- Actions taken:
  - Read ORM docs set (already completed earlier in session context).
  - Scanned `example/` for data-access usage:
    - ~124 `ctx.table(...)` occurrences.
    - `ctx.db` usage limited to `projects.ts` (streams), `user.ts` (patch), and README examples.
  - Located Ents schema and key wiring:
    - Ents schema: `example/convex/functions/schema.ts`
    - Ents context helper: `example/convex/lib/ents.ts`
    - cRPC context uses `getCtxWithTable` and wraps mutations with Triggers (`example/convex/lib/crpc.ts`).
  - Extracted the set of Ent index/search names referenced by code (to preserve in ORM schema) and recorded them in:
    - `plans/migrate_example_to_orm_findings_2026-02-08.md`
  - Identified high-risk migrations:
    - stream-based async filtering + pagination in `projects.list`
    - Ent relation helpers (`edge`, `edgeX`, `has`) and edge patch syntax for tags
    - ensuring ORM writes still flow through trigger-wrapped DB for aggregates
- Files created/modified:
  - `plans/migrate_example_to_orm_task_plan_2026-02-08.md` (created)
  - `plans/migrate_example_to_orm_findings_2026-02-08.md` (created)
  - `plans/migrate_example_to_orm_progress_2026-02-08.md` (created)

## Test Results
| Test | Input | Expected | Actual | Status |
|------|-------|----------|--------|--------|
| Pre-migration inventory sweep | `rg -n "convex-ents|ctx\\.db|ctx\\.table" example/` | Identify all remaining usages | Found extensive `ctx.table`, minimal `ctx.db` | pass |
| Post-migration sweep | `rg -n "\\bctx\\.db\\b|\\bctx\\.table\\(|convex-ents" example/` | No matches | No matches | pass |
| Typecheck | `bun --cwd example typecheck` | Pass | Pass | pass |
| Lint | `bun --cwd example lint` | Pass | Pass | pass |
| Codegen | `bun --cwd example codegen` | Pass | Pass | pass |

## Error Log
| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
| 2026-02-08 | `ERR_REQUIRE_ESM` from `dist/cli.cjs` requiring `execa` | 1 | Switched CLI build to ESM (`dist/cli.mjs`), updated bin + watcher path, ran `bun install` to refresh workspace bin link |
| 2026-02-08 | `node:fs` has no named export `globSync` (codegen) | 2 | Replaced glob usage with a recursive directory walker |
| 2026-02-10 | Convex deploy failed while analyzing modules: `Multiple relations found from "projects" to "user"` (followed by many-to-many inverse + circular dependency errors once disambiguated) | 1 | Added relation aliases for disambiguation, prevented many-to-many inverse pairing via distinct aliases, removed self-referencing `todoComments` relations; verified ORM boot |

## 5-Question Reboot Check
| Question | Answer |
|----------|--------|
| Where am I? | Phase 1 (Discovery & Migration Design) |
| Where am I going? | Schema conversion -> ctx.orm wiring -> function migrations -> remove convex-ents -> verification |
| What's the goal? | Migrate `example/` off `ctx.table`/`ctx.db` to Better-Convex ORM and uninstall `convex-ents` |
| What have I learned? | Main complexity is Ent edge helpers + stream-based filtering; triggers/aggregates must keep working |
| What have I done? | Built the plan + findings + progress artifacts and captured the migration inventory |

### Phase 6: Verification + Gap Fixes
- **Status:** complete
- Actions taken:
  - Fixed remaining `bun --cwd example typecheck` errors in:
    - `example/convex/functions/todoComments.ts`
    - `example/convex/functions/todoInternal.ts`
    - `example/convex/functions/todos.ts`
  - Made `bun --cwd example lint` pass (removed explicit `any`, applied formatting fixes).
  - Fixed Better Convex CLI/codegen regressions so `bun --cwd example codegen` works:
    - CLI build moved from CJS to ESM to support `execa` (ESM-only)
    - Removed invalid `globSync` import from `node:fs` in codegen.

## Session: 2026-02-09

### Phase 6: Verification + Gap Fixes (Follow-up)
- **Status:** complete
- Found remaining `ctx.db.get(...)` usage in `example/convex/lib/auth/auth-helpers.ts`.
- Replaced those reads with ORM queries:
  - `ctx.orm.query.user.findFirst({ where: { _id: { eq: userId } } })`
  - `ctx.orm.query.organization.findFirst({ where: { _id: { eq: orgId } } })`
- Re-ran sweep + `typecheck` + `lint` + `codegen`.

## Test Results (2026-02-09)
| Test | Input | Expected | Actual | Status |
|------|-------|----------|--------|--------|
| Sweep | `rg -n "\\bctx\\.db\\b|\\bctx\\.table\\(|convex-ents" example/` | No matches | No matches | pass |
| Typecheck | `bun --cwd example typecheck` | Pass | Pass | pass |
| Lint | `bun --cwd example lint` | Pass | Pass | pass |
| Codegen | `bun --cwd example codegen` | Pass | Pass | pass |

## Session: 2026-02-10

### Deploy Push Fix (Schema Relations)
- **Status:** complete
- Actions taken:
  - Fixed relation inverse auto-detection ambiguity for `projects` <-> `user` by adding aliases on the owner relation pair.
  - Prevented invalid inverse pairing for many-to-many relations (`projects.members`, `todos.tags`) by using non-matching aliases.
  - Removed unsupported self-referencing `todoComments` relations (circular dependency detection).
  - Verified: ORM boots, `typecheck`, `lint`, and `codegen` are green.

## Test Results (2026-02-10)
| Test | Input | Expected | Actual | Status |
|------|-------|----------|--------|--------|
| ORM boot (import) | `bun -e "import('./example/convex/lib/orm.ts')"` | No throw | No throw | pass |
| Typecheck | `bun --cwd example typecheck` | Pass | Pass | pass |
| Lint | `bun --cwd example lint` | Pass | Pass | pass |
| Codegen | `bun --cwd example codegen` | Pass | Pass | pass |
