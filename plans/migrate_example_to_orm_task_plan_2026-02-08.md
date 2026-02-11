# Task Plan: Migrate `example/` from Convex Ents to Better-Convex ORM (2026-02-08)

## Goal
Migrate the `example/` app to Better-Convex ORM so it no longer uses `ctx.table` (Convex Ents) or `ctx.db` directly, and uninstall `convex-ents`, while preserving behavior (API outputs, auth flows, aggregates/triggers) and keeping the codebase typecheck/lint/codegen-green.

## Constraints / Requirements
- No usage of `ctx.table` or `ctx.db` in `example/` application code.
  - Allowed exception (if unavoidable): infra plumbing that wraps the Convex DB for triggers (document any remaining `ctx.db` usage).
- Remove `convex-ents` from `example/package.json` and delete Ents-specific helpers (`example/convex/lib/ents.ts`, etc.).
- Keep existing API contracts as much as reasonable (zod outputs + cRPC behaviors).
- If we hit an ORM parity gap or docs gap, capture it in findings and improve the ORM/docs accordingly.

## Definition of Done
- `rg -n "ctx\\.table\\(|ctx\\.db\\b|convex-ents" example/` returns no matches (or only explicitly documented infra exceptions).
- `bun --cwd example typecheck` passes.
- `bun --cwd example lint` passes.
- Convex codegen continues to work (`bun --cwd example codegen` or existing `bun gen` flow).
- Auth flows still work (Better Auth + createClient + triggers).
- Aggregates/triggers still update (TableAggregate + Triggers).

## Current Phase
Phase 6 (Complete)

## Phases
### Phase 1: Discovery & Migration Design
- [x] Inventory `ctx.table`/`ctx.db` usage in `example/` (counts + file list).
- [x] Identify high-risk patterns (Ent edges, edge-patch semantics, streams).
- [x] Extract Ent index/search names referenced by code so we can preserve them in ORM schema.
- [ ] Decide schema runtime defaults: `strict` policy and `defaults.defaultLimit` strategy.
- [ ] Decide how to model comment replies in ORM:
  - Option A: self-referencing `parentId` one-to-many relations (drop `commentReplies` join table).
  - Option B: keep explicit join table semantics (keep `commentReplies` + relations).
- [ ] Note candidate ORM/docs gaps to address during migration.
- **Status:** complete

### Phase 2: ORM Schema + Relations
- [ ] Replace `example/convex/functions/schema.ts` (Convex Ents) with Better-Convex ORM schema:
  - `convexTable(...)` per table
  - `defineRelations(...)`
  - `export default defineSchema(...)` (keep `schemaValidation: true`)
- [ ] Preserve index/search index names referenced by code (and Better Auth adapters).
- [ ] Add required foreign-key indexes for relation loading (Ents used to auto-create these).
- [ ] Model soft delete on `todos` using `deletion('soft')` + `deletionTime` field.
- [ ] Ensure join tables (`projectMembers`, `todoTags`, and maybe `commentReplies`) exist with the needed composite indexes.
- **Status:** complete

### Phase 3: Context Wiring (`ctx.orm`)
- [ ] Add `example/convex/lib/orm.ts`:
  - `createOrm({ schema: relations, ... })`
  - export `withOrm(ctx)` helper that attaches `ctx.orm`
  - if/when needed: wire async mutation batching (`ormFunctions`, `scheduledMutationBatch`) and scheduled deletes (`scheduledDelete`)
- [ ] Update `example/convex/lib/crpc.ts` to attach ORM in `.context({ query, mutation })`:
  - Replace `getCtxWithTable(ctx)` with `withOrm(ctx)`
  - Ensure mutation contexts still use the triggers-wrapped `ctx.db` so aggregates continue to fire.
- [ ] Remove Ents context types and update middleware ctx typing accordingly.
- **Status:** complete

### Phase 4: Function Migration (`example/convex/functions/**`)
- [ ] Convert reads:
  - `ctx.table('x').get(id)` -> `ctx.orm.query.x.findFirst({ where: { _id: id } })`
  - `getX/firstX` -> `findFirst` + explicit throw
  - `table('x', 'index', ...)` / `.filter(...)` -> object `where` + (if needed) predicate `where` with explicit `index` plan
  - Ent `.search(...)` -> ORM `findMany({ search: { index, query, filters } })`
  - Ent `.order('desc')` -> ORM `orderBy: { _creationTime: 'desc' }`
  - Ent `.paginate(...)` -> ORM `paginate: { cursor, numItems, maximumRowsRead? }`
- [ ] Convert relation traversal:
  - `row.edge('rel')` / `edgeX` -> ORM `with: { rel: true }` (or explicit join-table queries)
  - Replace `edge(...).has(id)` with an existence query on join table (or relation filter if applicable)
- [ ] Convert writes:
  - `insert` -> `ctx.orm.insert(table).values(...)` (+ `.returning()` if needed)
  - `patch/replace` -> `ctx.orm.update(table).set(...).where(eq(...))`
  - `delete` -> `ctx.orm.delete(table).where(eq(...))` (+ `.soft()` for todos)
- [ ] Replace Ent edge-patch semantics (`{ tags: { add/remove } }`) with explicit join-table inserts/deletes (`todoTags`).
- [ ] Rewrite `stream(ctx.db, schema)` usage in `projects.ts` to ORM queries:
  - likely two-step: precompute membership ids + predicate where w/ explicit index + bounded `paginate.maximumRowsRead`
- **Status:** complete

### Phase 5: Remove `convex-ents` + Cleanups
- [ ] Remove `convex-ents` dependency from `example/package.json`.
- [ ] Delete Ents helpers:
  - `example/convex/lib/ents.ts`
  - any remaining `entsTableFactory` usage (replace with ORM)
- [ ] Update `example/README.md` to remove Ents-specific instructions (`ctx.table`, `defineEntSchema`, edges).
- [ ] Ensure no generated types depend on Ents-only schema shapes.
- **Status:** complete

### Phase 6: Verification + Gap Fixes
- [ ] Run:
  - `bun --cwd example typecheck`
  - `bun --cwd example lint`
  - `bun --cwd example codegen` (or the repo’s equivalent codegen flow)
- [ ] `rg` sweep for `ctx.table`, `ctx.db`, `convex-ents`.
- [ ] Smoke-test key flows (dev init, seed, basic CRUD) if feasible.
- [ ] If migration uncovered:
  - ORM parity gaps: implement in `packages/better-convex/src/orm/**` + add tests.
  - Docs gaps: update ORM docs (`www/content/docs/db/orm/migrate-from-ents.mdx` / `migrate-from-convex.mdx`) with the missing mapping.
- **Status:** complete

## Key Questions
1. Should we keep schema `strict: true` during migration (add all needed indexes), or start `strict: false` and tighten after?
2. Should we set `defaults.defaultLimit` globally for convenience, or enforce explicit limits everywhere in `example/`?
3. How should we model comment replies: self-referencing `parentId` vs explicit join table?
4. For `projects.list` (stream-based filtering today), what’s the most readable ORM rewrite that preserves pagination behavior?
5. Do we want to introduce ORM RLS in `example/` now, or keep existing explicit auth checks?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Plan artifacts live in `plans/` with unique filenames | Avoid clobbering existing `task_plan.md`/`findings.md`/`progress.md` in repo root |
| Preserve Ent index names referenced by code | Minimizes churn and reduces risk with Better Auth adapter queries |
| Avoid self-referential ORM relations for `todoComments` | ORM v1 rejects circular dependencies in `one()` relations; keep `parentId` as a plain field and query manually |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Missed remaining `ctx.db.get(...)` reads in `auth-helpers.ts` | 1 | Replaced with ORM reads (`ctx.orm.query.user/organization.findFirst`) and re-ran sweep + typecheck/lint/codegen. |
| Convex deploy failed: `Multiple relations found from "projects" to "user"` | 1 | Added relation aliases for disambiguation, avoided many-to-many inverse pairing via distinct aliases, and removed self-referencing `todoComments` relations (kept `parentId` as a plain field). |
