---
date: 2026-02-07
topic: orm-pre-release-comprehensive-analysis
status: proposed (verified against current branch)
---

# ORM Pre-Release: Open Todos

## TIER 1: BREAKING CHANGES

### 1. [BREAKING] String/Negation Operators Strict-Mode Gating

**Severity**: Medium
**Effort**: S-M
**Status**: Plan ready at `docs/plans/2026-02-07-fix-strict-fullscan-gating-string-negation-filters-plan.md`

- `ne`, `notInArray`, `isNotNull` compiled as `multiProbe` plans -- can scan large table fractions without `allowFullScan`
- Runtime gating (query.ts:1650-1657) only throws when no selected index AND post-filters exist
- Proposed: `requiresAllowFullScanInStrictMode` metadata on planner output
- Mark risk for: string post-filters (`contains`, `endsWith`, non-prefix `like`, `ilike`), negation `multiProbe` (`ne`, `notInArray`), logical `NOT`
- Do NOT mark: `startsWith` and `like('prefix%')` when compiled to `rangeIndex`

---

## TIER 2: PERFORMANCE

### 2. [PERF] Relation Loading N+1

**Severity**: High
**Effort**: L (v1.x)

Current: `_mapWithConcurrency` per unique FK value (query.ts:2724, 3058). Dedup by sourceKeyMap reduces N from row count to distinct FK values.

Gap: 50 unique authors = 50 `db.get()` calls instead of 1 batched multi-get.

Proposed:
- one() by `_id`: batch into multi-get
- one() by field: single `.withIndex` query with OR
- many(): single query per target table with compound filter

---

### 3. [PERF] multiProbe Query Deduplication

**Severity**: Medium
**Effort**: S

multiProbe queries (query.ts:1976) are separate indexed queries per probe value. No dedup of overlapping results. Pagination requires `allowFullScan: true`.

Proposed: Deduplicate by `_id` across probes, apply limit/offset after merge.

---

## TIER 3: CONVEX NATIVE PARITY

### 4. [PARITY] Vector Search Polish

**Effort**: XS (docs only)

Implemented but remaining:
- `_score` exposure not surfaced in results (deferred)
- `findFirst({ vectorSearch })` not explicitly supported
- Cursor pagination with secondary orderBy instability: document as known behavior

---

### 5. [PARITY] System Table Access (`db.system`)

**Severity**: Medium
**Effort**: S

Not implemented. `db.system` used internally (stream.ts:536) but not exposed. Reserved tables blocked in table.ts:43.

Proposed: Passthrough `db.system.get()` / `db.system.query()`. No RLS, no relations.

---

### 6. [PARITY] `normalizeId()` Utility

**Severity**: Low
**Effort**: XS

Not implemented. Only exists as error stub in stream.ts:547-548.

Proposed: `db.normalizeId(table, idString)` passthrough.

---

## TIER 4: DRIZZLE v1 PARITY

### 7. [DRIZZLE] `findUnique()` Method

**Severity**: Medium
**Effort**: S

Not implemented. Proposed (per brainstorm 2026-02-07-find-unique):
- PK (`_id`) + unique indexes
- Return `T | undefined`
- Type-level unique constraint enforcement

---

### 8. [DRIZZLE] `exists`/`notExists` -- Document as Limitation

**Effort**: XS (docs only)

Platform limitation (no subqueries in Convex). Document with workaround recipes using relation `where` filters.

---

### 9. [DRIZZLE] Aggregations -- Defer to v1.x

**Effort**: XS (docs only)

No `count`/`sum`/`avg`/`max`/`min`. Document as gap, point to `@convex-dev/aggregate`. Evaluate Drizzle v1 `Count` aggregated field for v1.x.

---

## TIER 5: SAFETY & CORRECTNESS

### 10. [SAFETY] RLS Not Checked on Cascade Deletes

**Severity**: Medium
**Effort**: XS (docs)

Confirmed: cascade paths use raw `db.patch`/`db.delete` (mutation-utils.ts:984-1003) without RLS evaluation. Cycle detection exists via `visited` set.

Proposed: Document as intentional for v1. Add `cascade({ checkRls: true })` in v1.x.

---

### 11. [SAFETY] Soft Delete Relations Don't Auto-Filter

**Severity**: Medium
**Effort**: S

Relation loading doesn't check `deletionTime` on target rows.

Proposed: Auto-filter soft-deleted rows in relation loading when target table has `deletionTime`. Opt out via `{ includeSoftDeleted: true }`.

---

### 12. [SAFETY] Circular Relation Detection in Query Loading

**Severity**: Low
**Effort**: S

`maxDepth = 3` (query.ts:2586) silently stops. No visited `(tableName, _id)` tracking. Cascade deletes DO have cycle detection.

Proposed: Track visited pairs. Terminate on cycle. Keep maxDepth as separate safeguard.

---

## TIER 6: DOCS & COVERAGE

### 13. [DOCS] Performance Checklist Per Operation

**Effort**: S

Update `limitations.mdx` with operation-by-operation behavior table:

| Operation | Index Required | Sizing Policy |
|-----------|:-:|---|
| `findMany` | Recommended | limit, paginate, defaultLimit, or allowFullScan |
| `findFirst` | Recommended | limit: 1 (auto) |
| `update().where()` | Recommended | mutationMaxRows or `.paginate()` |
| `delete().where()` | Recommended | mutationMaxRows or `.paginate()` |
| `with: { many }` | Required (strict) | Per-parent limit/defaultLimit/allowFullScan |
| `search` | Required | Max 1024 scanned |
| `vectorSearch` | Required | Max 256, explicit limit |
| `ne()`, `not()`, strings | N/A | Post-fetch, allowFullScan in strict |

---

### 14. [DOCS] Convex-Helpers Migration Guide

**Effort**: S

Document how to migrate from convex-helpers patterns to ORM equivalents.

---

### 15. [TEST] Type Contract Tests

**Effort**: M

Add `@ts-expect-error` / `expectTypeOf` tests for:
- `findMany()` without sizing intent
- Schema `defaults` option types
- `findUnique()` type enforcement (if added)
- Vector search config types
- Mutation builder chain types

---

## Open Questions

1. Soft delete auto-filter: default on or opt-in?
2. `findUnique()`: v1 or v1.x?
3. System table access: v1 or v1.x?
4. Relation N+1 batch: confirmed v1.x?
5. Vector search `_score` exposure: v1.x or never?
6. multiProbe dedup: v1 or v1.x?

## Next Steps

-> `/workflows:plan` for #1 (strict-mode gating implementation).
-> Docs pass for #4 (vector search), #8-9 (limitations), #10 (RLS cascade), #13 (perf checklist).
