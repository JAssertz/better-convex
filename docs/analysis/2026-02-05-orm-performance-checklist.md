---
title: ORM Performance Checklist
type: analysis
date: 2026-02-05
status: draft
---

# ORM Performance Checklist

## Summary

Goal: prevent accidental full scans and clarify when to use filters and pagination.

Scope: Better‑Convex ORM query + relation loading + mutations guardrails.

## Strict Policy

- strict true (default): missing indexes throw unless `allowFullScan: true`.
- strict false: missing indexes still require `allowFullScan: true` but warn instead of throw.
- Guardrails below reflect current behavior.

## Decision Matrix (Short)

| Use Case | Recommended Tool | Why |
|---|---|---|
| Simple filters, no pagination | `db.query.*.findMany({ where })` | Uses indexes when possible |
| Complex JS filter, no pagination | `db.query.*.findMany({ where: (row) => ..., index: { name: 'by_field' } })` | Explicit index path |
| Complex JS filter + pagination | `db.query.*.findMany({ where: (row) => ..., index: { name: 'by_field' }, paginate: { cursor, numItems, maximumRowsRead } })` | Explicit index + bounded scan |
| Large lists | `db.query.*.findMany({ paginate })` | O(1) cursor pagination |
| Search + filters | `findMany({ search: { index, query, filters? } })` | `filters` must be in search index `filterFields`; base-field object `where` is post-search |

## Checklist (Ops → Guardrails)

| Operation | Index Requirement | Full‑Scan Risk | Guardrail | Fix |
|---|---|---|---|---|
| `findMany` / `findFirst` with `where` eq | Index on primary filter fields | Medium | Current: partial index use, post‑fetch filters | Add index for eq filters, avoid post‑fetch ops |
| String operators (`like`, `contains`, etc.) | Search index | High | Current: post‑fetch | Use search index or pre‑filter by indexed fields |
| `orderBy` on non‑indexed field | Index on first orderBy | Medium | Current: post‑fetch sort | Add index on first orderBy field |
| `findMany({ paginate })` with non‑indexed orderBy | Index on first orderBy | Medium | Current: strict true throws, strict false warns | Add index for stable ordering |
| Relation loading (one/many/through) | Index on relation lookup fields | High | Current: throws unless `allowFullScan` | Add index or set `allowFullScan: true` |
| Relation `where` filters (many) | Index for relation lookup | Medium | Current: post‑fetch relation filter | Keep relation lookup indexed, minimize post‑fetch filters |
| Predicate `where` | Explicit index required | High | Current: requires `index: { name, range? }` | Provide selective index range + `maximumRowsRead` |
| `update` / `delete` with `where` | Index on where fields | High | Current: requires `allowFullScan` when no index | Keep `where` indexed, avoid broad deletes |
| `update` / `delete` without `where` | N/A | High | Current: requires `allowFullScan` | Add `where`, or use `allowFullScan` |
| FK action lookups (`onDelete` / `onUpdate`) | Index on FK fields | Medium | Current: FK actions require indexes and fail fast at `defaults.mutationMaxRows` | Add indexes on all FK fields; raise `mutationMaxRows` only when needed |

## Notes

- Predicate `where` requires explicit index configuration and should set `paginate.maximumRowsRead` for bounded scans.
- Prefer indexes over post‑fetch filters for scalability.
- For very large graph rewrites/deletes, prefer paged mutation workflows (`.paginate` + action loop or recursive scheduling) over a single transactional cascade.
