---
date: 2026-02-06
topic: orm-pre-release-remaining-after-limit-safety
status: proposed
---

# ORM Pre-release: Remaining After Limit-Safety Plan

Assumes the following plans are implemented:

**Limit-Safety Breaking Plan** resolves:
- Silent `limit ?? 1000` truncation → explicit sizing policy
- Update/delete unbounded `.collect()` → one-shot bounded with `mutationMaxRows` ceiling
- multiProbe unbounded `.collect()` → effective limit applied
- Nested many relation limit enforcement → schema defaults / explicit
- `allowFullScan` as unified escape hatch

**Paginated Update/Delete Batching** resolves:
- `.paginate({ cursor, numItems })` on update/delete builders for large workloads
- One-shot mode keeps `mutationMaxRows` fail-fast
- Paged mode processes one page per call via Convex cursor semantics
- Types distinguish one-shot vs paged `execute()` return types
- Docs guide users to loop from action or recursive scheduler for scale

This document re-ranks all remaining pre-release work.

---

## Ranked Recommendations

### TIER 1: Breaking — Remaining Budget

#### 1. [BREAKING] Cascade Delete Unbounded `.collect()`

**Severity**: High
**File**: `mutation-utils.ts:482-495` (`collectReferencingRows`)

Last remaining unbounded `.collect()` path. Update/delete selection now has one-shot ceiling + `.paginate()`, but cascade deletes still call `.collect()` on referencing tables via `collectReferencingRows()`. This path uses `withIndex` (good) but has no row ceiling. A cascade on a user with 50k posts still collects all 50k rows into memory.

**Proposed**:
- Apply `mutationMaxRows` ceiling to cascade collection.
- Fail fast if referencing row count exceeds ceiling.
- Users can increase ceiling via schema `defaults.mutationMaxRows`.
- Consider: should cascade support paged mode too? (Likely no — cascade is transactional by nature.)

**Effort**: S

---

#### 2. [BREAKING] Hide Internal Classes from Public API

**Severity**: Medium
**File**: `index.ts` exports

`GelRelationalQuery`, `QueryPromise`, `WhereClauseCompiler`, `ConvexInsertBuilder`, `ConvexUpdateBuilder`, `ConvexDeleteBuilder` are all exported. These are implementation details. Anyone constructing them directly creates an accidental API contract that blocks future refactoring.

**Proposed**:
- Export only types (for type-level use) and factory functions.
- Users interact via `db.query.table.findMany()`, `db.insert(table)`, etc.
- Class instances remain opaque.

**Effort**: S

---

#### 3. [BREAKING] Post-Fetch Sort After Offset/Limit = Wrong Results

**Severity**: High (correctness bug)
**File**: `query.ts:1691-1695`

When orderBy requires post-fetch sort (multi-field or non-indexable), current flow:
1. Fetch `offset + limit` rows from index
2. Slice for offset
3. Sort the already-truncated set

Result: sort applied to wrong subset → incorrect results.

**Proposed**: Restructure to fetch → sort → offset → limit. This is a behavior change but it's a bug fix. Document that non-indexed sorts require fetching the full filtered set (which interacts with the new sizing policy — users must provide sufficient limit or allowFullScan).

**Effort**: M

---

### TIER 2: Performance

#### 4. [PERF] Relation Loading N+1

**Severity**: High
**Files**: `query.ts:2724-2927` (`_loadManyRelation`, `_loadOneRelation`)

For 100 posts × author: 100 separate `db.get()` calls. For many-to-many through: N through-table + N target queries.

**Proposed**:
- For one() relations by `_id`: batch into single multi-get (collect IDs, fetch all, distribute).
- For one() by other fields: single `.withIndex` query with OR of values (if indexed), distribute.
- For many() relations: single query per target table with compound filter, distribute per-parent.
- Through relations: single through-table query, then single target query.
- Document `relationLoading.concurrency` option.

**Effort**: L
**Note**: Observable behavior change (fewer queries). Functionally equivalent but may affect write conflict patterns.

---

#### 5. [PERF] String Operators Require `allowFullScan` in Strict Mode

**Severity**: Medium
**Files**: `where-clause-compiler.ts`, `query.ts`

`like()`, `startsWith()`, `endsWith()`, `contains()` are post-fetch filters that look like index operators. Users don't realize these trigger full scans.

**Proposed**:
- In strict mode: require `allowFullScan` when using string operators without a search index.
- Log warning: "For text matching, prefer `search` with a search index."
- Map `startsWith` to Convex prefix range where possible (potential optimization).

**Effort**: S

---

#### 6. [PERF] `ne()` / `not()` / `notInArray()` Require `allowFullScan` in Strict Mode

**Severity**: Medium
**Files**: `where-clause-compiler.ts`

Negation can never use indexes. Currently silent post-fetch filters.

**Proposed**: Same as string operators — require `allowFullScan` in strict mode unless other indexed fields sufficiently narrow the scan.

**Effort**: S

---

### TIER 3: Parity — Convex Native

#### 7. [PARITY] Vector Search Query API

**Severity**: High
**Gap**: Schema supports `vectorIndex()` but no query builder.

Convex native: `ctx.vectorSearch(table, indexName, { vector, limit, filter })`.

**Proposed**:
```ts
findMany({
  vectorSearch: {
    index: 'embedding_index',
    vector: [0.1, 0.2, ...],
    limit: 10,
    filter: (q) => q.eq('status', 'published'),
  }
})
```

Largest Convex parity gap on the read path. Requires `limit` (inherently bounded — no sizing issue).

**Effort**: L

---

#### 8. [PARITY] `between` / `notBetween` Operators

**Severity**: Medium
**Gap**: Drizzle has `between(col, min, max)`. ORM requires `and(gte(col, min), lte(col, max))`.

**Proposed**: Sugar that compiles to `and(gte, lte)`. Index-compatible.

**Effort**: S

---

#### 9. [PARITY] System Table Access (`db.system`)

**Severity**: Medium
**Gap**: `_storage`, `_scheduled_functions` not queryable via ORM.

**Proposed**: Passthrough `db.system.get()` / `db.system.query()`. No ORM features (no RLS, no relations), just typed access.

**Effort**: S

---

#### 10. [PARITY] `normalizeId()` Utility

**Severity**: Low
**Gap**: Stream API throws on `normalizeId()`. No ORM wrapper.

**Proposed**: `db.normalizeId(table, idString)` passthrough.

**Effort**: XS

---

### TIER 4: Safety & Correctness

#### 11. [SAFETY] RLS Not Checked on Cascade Deletes

**Severity**: Medium
**File**: `mutation-utils.ts` cascade paths

When a cascade delete removes referencing rows, RLS policies on the referencing table are NOT evaluated. A user who can delete a parent can implicitly delete child rows they wouldn't normally have access to.

**Proposed**:
- A: Apply target table's RLS on each cascaded row (safe but potentially surprising: cascade fails if any row blocked).
- B: Document as intentional: "cascade deletes bypass RLS on referencing tables" (explicit trade-off).
- C: Add `cascade({ checkRls: true })` option (default false for compat).

**Effort**: M (option A/C), XS (option B)

---

#### 12. [SAFETY] Soft Delete Relations Don't Auto-Filter

**Severity**: Medium
**Files**: `query.ts` relation loading

When loading relations, soft-deleted rows are included in results. Users must manually add `where: isNull(table.deletionTime)` to every relation config.

**Proposed**:
- A (Recommended): Auto-filter soft-deleted rows in relation loading when the target table has a `deletionTime` column. Opt out via `{ includeSoftDeleted: true }`.
- B: Document as intentional: "relation loading returns all rows including soft-deleted."

**Effort**: S (option A)

---

#### 13. [SAFETY] No Circular Relation Detection

**Severity**: Low
**Files**: `query.ts` `_loadRelations`

Bidirectional relations with unlimited nesting depth (e.g., `user → posts → author → posts → ...`) can infinite-loop. Current `maxDepth: 3` mitigates but doesn't detect actual cycles.

**Proposed**: Track visited `(tableName, _id)` pairs in relation loading. Terminate branch when cycle detected.

**Effort**: S

---

### TIER 5: Drizzle Parity (Platform Limitations)

#### 14. [DRIZZLE] `exists` / `notExists` — Document as Limitation

No subqueries in Convex. Approximate via relation `where` filters.

#### 15. [DRIZZLE] Aggregations (`count`, `sum`, `avg`, `max`, `min`) — Defer to v1.x

Point to `@convex-dev/aggregate` component.

#### 16. [DRIZZLE] `findUnique()` Method

Drizzle has `findUnique()` that requires unique key in where. ORM currently uses `findFirst()`.

**Proposed**: Add `findUnique()` that validates the where clause references a unique index/PK. Returns `T | undefined` (same as findFirst) but enforces unique constraint at type level. Sugar over findFirst.

**Effort**: S

---

### TIER 6: convex-helpers Decisions (Unchanged from v2)

All decisions from v2 stand:
- **stream.ts, pagination.ts**: Already forked. Keep internal.
- **relationships.ts, filter.ts, crud.ts**: ORM supersedes. Ignore.
- **rowLevelSecurity.ts**: ORM has own RLS. Ignore.
- **customFunctions.ts, validators.ts**: Recommend as companions. Don't integrate.
- **triggers.ts, zod4.ts, cors.ts, hono.ts, migrations.ts, rateLimit.ts, retries.ts, sessions.ts**: Ignore all.

---

### TIER 7: Coverage & Docs

#### 17. [DOCS] Performance Checklist Per Operation

Update `limitations.mdx` with operation-by-operation behavior table. Must reflect new sizing policy from limit-safety plan.

| Operation | Index Required | Sizing Policy | Notes |
|-----------|:-:|---|---|
| `findMany` | Recommended | Explicit limit, paginate, defaultLimit, or allowFullScan required | New in limit-safety plan |
| `findFirst` | Recommended | limit: 1 (automatic) | Unchanged |
| `update().where()` | Recommended | One-shot: mutationMaxRows ceiling. Paged: `.paginate()` for scale | New |
| `delete().where()` | Recommended | One-shot: mutationMaxRows ceiling. Paged: `.paginate()` for scale | New |
| `with: { many }` | Required (strict) | Per-parent limit required (or defaultLimit/allowFullScan) | New |
| `with: { one }` | Required (strict) | N/A (single row) | Unchanged |
| `search: {...}` | Required | Uses search index | Unchanged |
| `ne()`, `not()`, strings | N/A | Always post-fetch, allowFullScan in strict | New in this plan |

**Effort**: S

---

#### 18. [TEST] Type Contract Tests

Add `@ts-expect-error` tests for:
- `findMany()` without sizing intent errors at runtime
- New schema `defaults` option types
- `findUnique()` type enforcement (if added)

**Effort**: M

---

## Summary: Priority Order

| # | Category | Item | Effort | Breaking? |
|---|----------|------|--------|-----------|
| 1 | Breaking | Cascade `.collect()` unbounded | S | Yes |
| 2 | Breaking | Hide internal classes | S | Yes |
| 3 | Breaking | Post-fetch sort ordering bug | M | Yes (behavior) |
| 4 | Perf | Relation loading N+1 batch | L | No (observable) |
| 5 | Perf | String operators strict mode | S | Yes (strict only) |
| 6 | Perf | Negation operators strict mode | S | Yes (strict only) |
| 7 | Parity | Vector search query API | L | No |
| 8 | Parity | `between`/`notBetween` | S | No |
| 9 | Parity | System table access | S | No |
| 10 | Parity | `normalizeId()` | XS | No |
| 11 | Safety | RLS on cascade deletes | M | Depends on option |
| 12 | Safety | Soft delete relation filtering | S | Yes (behavior) |
| 13 | Safety | Circular relation detection | S | No |
| 14-15 | Drizzle | Platform limitations | XS | No (docs only) |
| 16 | Drizzle | `findUnique()` | S | No |
| 17 | Docs | Performance checklist | S | No |
| 18 | Test | Type contract tests | M | No |

## Key Decisions

- **3 remaining breaking changes** to spend budget on (#1 cascade, #2 hide internals, #3 sort bug).
- **Limit-safety plan** resolves the most critical items. Remaining breaks are smaller scope.
- **Relation N+1** is the biggest perf win but largest effort. Can ship post-stable.
- **Vector search** is highest-value parity addition. Independent from safety work.
- **Soft delete relation filtering** is a subtle correctness issue worth addressing pre-stable.

## Open Questions

1. Cascade ceiling: same `mutationMaxRows` or separate `cascadeMaxRows`?
2. RLS on cascade: check by default, or opt-in?
3. Soft delete auto-filter: default on or opt-in?
4. `findUnique()`: v1 or v1.x?
5. Vector search: v1 boundary or v1.x?
6. Relation N+1 batch: pre-stable or first perf release?
7. Sort bug fix: silent fix or document as breaking behavior change?

## Next Steps

-> `/workflows:plan` to convert into implementation plan.
