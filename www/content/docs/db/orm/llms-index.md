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
- `/docs/db/orm/queries` - findMany(), findFirst(), paginate(), filters, orderBy
- `/docs/db/orm/operators` - All supported `where` operators (query + mutation)

**Mutations:**
- `/docs/db/orm/mutations` - insert(), update(), delete(), returning(), onConflictDoUpdate()
- `/docs/db/orm/insert` - insert() builder details
- `/docs/db/orm/update` - update() builder details
- `/docs/db/orm/delete` - delete() builder details

**Row-Level Security:**
- `/docs/db/orm/rls` - rlsPolicy, rlsRole, and runtime enforcement

## Migration & Comparison

- `/docs/db/orm/comparison` - Drizzle v1 mapping and migration guidance

## Reference

- `/docs/db/orm/api-reference` - Full API surface and TypeScript helpers
- `/docs/db/orm/limitations` - Differences and performance guidance

## Quick Reference

### Key APIs

**Schema:**
```ts
convexTable(name, columns)
defineRelations(schema, callback)
extractRelationsConfig(schema)
```

**Queries:**
```ts
const db = createDatabase(ctx.db, ormSchema, ormEdges)

await db.query.table.findMany({
  where: { field: value },
  orderBy: { _creationTime: 'desc' },
  limit: 10,
  offset: 0,
})

await db.query.table.findFirst({
  where: { field: value },
})

await db.query.table.paginate(
  { where: { active: true } },
  { cursor: null, numItems: 20 }
)
```

**Mutations:**
```ts
await db.insert(table).values(data)
await db.update(table).set(data).where(eq(table._id, id))
await db.delete(table).where(eq(table._id, id))
```

**RLS:**
```ts
const db = createDatabase(ctx.db, ormSchema, ormEdges, { rls: { ctx } })
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

**Unavailable in Convex:**
- Raw SQL queries
- Database migrations
- SQL joins

## Error Messages & Solutions

- `where is not a function` → Use object form: `where: { field: value }`
- `Property 'query' does not exist` → Use `createDatabase(ctx.db, ormSchema, ormEdges)`
- `Type error: missing required field` → Check `.notNull()` in schema
- `findUnique is not a function` → Use `findFirst` with `where`
- `'include' does not exist` → Use `with` instead of `include`
