---
title: LLMs Index
description: Structured index of Better-Convex ORM documentation for AI assistants and code completion tools
---

# Better-Convex ORM Documentation Index

This file provides a structured index of Better‑Convex ORM documentation for AI assistants and code completion tools.

## Core Concepts

**Getting Started:**
- `/docs/db/orm` - Overview, installation, and value proposition
- `/docs/db/orm/quickstart` - 5‑minute tutorial with backend queries

**Schema Definition:**
- `/docs/db/orm/schema` - Table definitions, field types, indexes, and type inference
- `/docs/db/orm/column-types` - Column builders and TypeScript type mapping
- `/docs/db/orm/indexes-constraints` - Indexes, unique constraints, and foreign keys

**Relations:**
- `/docs/db/orm/relations` - One‑to‑one, one‑to‑many, many‑to‑many relations

**Querying Data:**
- `/docs/db/orm/queries` - findMany(), findFirst(), findMany({ paginate }), filters, orderBy
- `/docs/db/orm/operators` - All supported `where` operators (query + mutation)

**Mutations:**
- `/docs/db/orm/mutations` - insert(), update(), delete(), returning(), onConflictDoUpdate()
- `/docs/db/orm/insert` - insert() builder details
- `/docs/db/orm/update` - update() builder details
- `/docs/db/orm/delete` - delete() builder details

**Row-Level Security:**
- `/docs/db/orm/rls` - rlsPolicy, rlsRole, and runtime enforcement

## Migration & Comparison

- `/docs/db/orm/migrate-from-convex` - Native Convex (`ctx.db`) → ORM migration guide
- `/docs/db/orm/migrate-from-ents` - Convex Ents → ORM migration guide
- `/docs/db/orm/comparison` - Drizzle v1 mapping and migration guidance

## Reference

- `/docs/db/orm/api-reference` - Full API surface and TypeScript helpers
- `/docs/db/orm/limitations` - Differences and performance guidance

## Quick Reference

### Key APIs

**Schema:**
```ts
convexTable(name, columns)
defineSchema(tables, { defaults?: { defaultLimit?, mutationBatchSize?, mutationMaxRows? } })
defineRelations(schema, callback)
extractRelationsConfig(schema)
```

**Queries:**
```ts
const db = ctx.orm

await db.query.table.findMany({
  where: { field: value },
  orderBy: { _creationTime: 'desc' },
  limit: 10,
  offset: 0,
})

await db.query.table.findFirst({
  where: { field: value },
})

await db.query.table.findMany({
  where: { active: true },
  paginate: { cursor: null, limit: 20 },
})

await db.query.table.findMany({
  // Predicate where requires an explicit index plan (no allowFullScan fallback)
  where: (row) => row.status === 'active',
  index: { name: 'by_status' },
  paginate: { cursor: null, limit: 20, maxScan: 2000 },
})
```

**Mutations:**
```ts
await db.insert(table).values(data)
await db.update(table).set(data).where(eq(table._id, id))
await db.delete(table).where(eq(table._id, id))
// Full-scan opt-in (only if no index on email)
await db.update(table).set(data).where(eq(table.email, email)) // indexed
await db.update(table).set(data).where(eq(table.email, email)).allowFullScan()
await db.delete(table).where(eq(table.email, email)) // indexed
await db.delete(table).where(eq(table.email, email)).allowFullScan()
```

**RLS:**
```ts
const db = ctx.orm
const secret = convexTable.withRLS('secrets', { /* ... */ }, (t) => [
  rlsPolicy('read_own', { for: 'select', using: (ctx) => eq(t.ownerId, ctx.viewerId) }),
])
```

**Object `where` operators:**
```ts
{ field: value }
{ field: { ne: value } }
{ field: { gt: value } }
{ field: { gte: value } }
{ field: { lt: value } }
{ field: { lte: value } }
{ field: { between: [min, max] } }
{ field: { notBetween: [min, max] } }
{ field: { in: [a, b] } }
{ field: { notIn: [a, b] } }
{ field: { isNull: true } }
{ field: { isNotNull: true } }
{ AND: [ ... ] }
{ OR: [ ... ] }
{ NOT: { ... } }
```

**Mutation filter helpers:**
```ts
eq(field, value)
ne(field, value)
gt(field, value)
gte(field, value)
lt(field, value)
lte(field, value)
between(field, min, max)
notBetween(field, min, max)
inArray(field, values)
notInArray(field, values)
and(...filters)
or(...filters)
not(filter)
isNull(field)
isNotNull(field)
```

### Feature Overview

**Core features:**
- Schema definition (convexTable, column builders)
- Relations definition and loading (one, many, with)
- Query operations (findMany, findFirst, paginate)
- Where filtering (object filters)
- Pagination (limit, offset)
- Order by (multi‑field, index‑aware first sort)
- Type inference
- Column selection (post‑fetch)
- String operators (post‑fetch)
- Mutations (insert, update, delete, returning)
- Aggregation workaround via `/docs/db/aggregates` (`@convex-dev/aggregate`)

**Unavailable in Convex:**
- Raw SQL queries
- Database migrations
- SQL joins
- ORM query-builder aggregations (`count`, `sum`, `avg`, `max`, `min`) should use Convex aggregate components

## Error Messages & Solutions

- `where is not a function` → Use object form: `where: { field: value }`
- `Property 'query' does not exist` → Ensure ORM is attached as `ctx.orm`
- `Type error: missing required field` → Check `.notNull()` in schema
- `findUnique is not a function` → Use `findFirst` with `where`
- `count/sum/avg/max/min is not on db.query.*` → Use `/docs/db/aggregates` (`@convex-dev/aggregate`)
- `'include' does not exist` → Use `with` instead of `include`
- `findMany() requires explicit sizing` → Add `limit`, use `paginate`, set schema `defaultLimit`, or opt in with `allowFullScan`
- `allowFullScan required` → Predicate `where`, missing relation index, or unbounded update/delete requires `allowFullScan`
- `matched more than mutationMaxRows` → Narrow update/delete filter or raise `defaults.mutationMaxRows`
- `update/delete pagination does not support multi-probe filters yet` → Rewrite to a single-range index filter, or run non-paginated mode with row cap

**Index-compiled operators (when indexed):**
- `eq`, `ne`, `gt`, `gte`, `lt`, `lte`
- `between`, `notBetween`
- `in`, `notIn`
- `isNull`, `isNotNull`
- `startsWith`
- `like('prefix%')`
- same-field equality `OR` branches

**Still full-scan operators (require explicit opt-in):**
- `arrayContains`, `arrayContained`, `arrayOverlaps` (use inverted/join tables)
- `contains` (use search index or tokenized denormalized field)
- `endsWith` (use reversed-string indexed column + `startsWith`)
- `ilike`, `notIlike` (use normalized lowercase indexed field)
- `notLike` (use indexed pre-filter then post-filter)
- predicate `where` and `RAW` (narrow with indexed pre-filters first)
