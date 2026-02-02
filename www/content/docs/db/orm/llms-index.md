---
title: LLMs Index
description: Structured index of Better-Convex ORM documentation for AI assistants and code completion tools
---

# Better-Convex ORM Documentation Index

**For LLM/AI Discovery**: This file provides a structured index of all Better-Convex ORM documentation for AI assistants and code completion tools.

## Core Concepts (M1-M4)

**Getting Started:**
- `/docs/db/orm` - Overview, installation, and value proposition
- `/docs/db/orm/quickstart` - 5-minute tutorial with backend queries

**Schema Definition:**
- `/docs/db/orm/schema` - Table definitions, field types, and type inference

**Relations:**
- `/docs/db/orm/relations` - Define one-to-one, one-to-many, many-to-many relationships

**Querying Data:**
- `/docs/db/orm/queries` - findMany(), findFirst(), where filtering, limit/offset

**Mutations (Coming in M5-M6):**
- `/docs/db/orm/mutations` - insert(), update(), delete() operations (planned API)

## Migration & Comparison

**Drizzle ORM:**
- `/docs/db/orm/comparison` - Side-by-side API comparison and migration guide

## Reference

**API Documentation:**
- `/docs/db/orm/api-reference` - Complete API surface, all operators, TypeScript signatures

**Limitations & Performance:**
- `/docs/db/orm/limitations` - Category 2/4 features, workarounds, performance deep dive, N+1 prevention

## Quick Reference (M1-M4)

### Key APIs

**Schema:**
```ts
convexTable(name, fields)       // Define table
relations(table, callback)      // Define relations
```

**Queries (M1-M4 - Implemented):**
```ts
db(ctx).query.table.findMany()  // Get all records
db(ctx).query.table.findFirst() // Get first record
where(condition)                 // Filter results
limit: 10, offset: 20           // Pagination
```

**Coming in M5+:**
```ts
with({ relation: true })        // Load relations (M5)
orderBy: desc(field)            // Sort results (M5)
```

**Mutations (M5-M6 - Not Yet Implemented):**
```ts
// Use native Convex mutations for now:
ctx.db.insert(table, data)
ctx.db.patch(id, data)
ctx.db.delete(id)
```

**Operators (M1-M4 - Implemented):**
```ts
eq(field, value)     // Equal
ne(field, value)     // Not equal
gt(field, value)     // Greater than
lt(field, value)     // Less than
gte(field, value)    // Greater than or equal
lte(field, value)    // Less than or equal
and(...conditions)   // Logical AND
or(...conditions)    // Logical OR
```

### Feature Categories (M1-M4)

**✅ Implemented:**
- Schema definition (convexTable, field types)
- Relations definition (one, many)
- Query operations (findMany, findFirst)
- Where filtering (eq, ne, gt, lt, gte, lte, and, or, not)
- Pagination (limit, offset)
- Type inference

**🚧 Coming Soon (M5+):**
- Relation loading with `with:`
- Mutations (insert, update, delete)
- Order by (orderBy, asc, desc)

**⚠️ Limited/Workaround:**
- String operators (like, ilike) → Use Convex search or post-filter
- Column selection → Map after fetch

**❌ Not Applicable (SQL-specific):**
- Raw SQL queries
- Database migrations
- Complex JOINs

### Common Patterns (M1-M4)

**Basic Query:**
```ts
const users = await db(ctx).query.users.findMany();
```

**Filtered Query:**
```ts
const admins = await db(ctx).query.users.findMany({
  where: and(
    eq(users.role, 'admin'),
    gt(users.lastSeen, Date.now() - 86400000)
  ),
});
```

**With Pagination:**
```ts
const posts = await db(ctx).query.posts.findMany({
  where: eq(posts.published, true),
  limit: 10,
  offset: 0,
});
```

**Find First:**
```ts
const user = await db(ctx).query.users.findFirst({
  where: eq(users.email, 'alice@example.com'),
});
```

**Real-Time (React):**
```ts
const users = useQuery(api.queries.getUsers);
// Automatically updates when data changes
```

**Mutations (Use Native Convex for Now):**
```ts
// Insert
const userId = await ctx.db.insert('users', {
  name: 'Alice',
  email: 'alice@example.com',
});

// Update
await ctx.db.patch(userId, {
  name: 'Alice Smith',
});

// Delete
await ctx.db.delete(userId);
```

## Error Messages & Solutions

**Common errors:**

- `Type 'null' is not assignable to type 'undefined'` → Use `undefined` instead of `null` (Convex convention)
- `Property 'query' does not exist on type 'typeof db'` → Use `db(ctx)` not `db`
- `Cannot find name 'ctx'` → Import `{ query }` or `{ mutation }` from Convex and use context
- `Type error: missing required field` → Check schema definition for required fields
- `Property '...' does not exist on type` → Field doesn't exist in schema, check spelling
- `findUnique is not a function` → Use `findFirst` with `where` instead (Drizzle migration)
- `'include' does not exist` → Use `with` instead of `include` (Drizzle migration)

## Migration Quickstart (M1-M4)

**From Drizzle:**

1. Replace imports: `drizzle-orm` → `better-convex/orm`
2. Replace `pgTable` → `convexTable` with `v.*` validators
3. Remove manual `id` fields (auto-created as `_id`)
4. Add `ctx` to all queries: `db.query` → `db(ctx).query`
5. Replace `users.id` → `users._id` in relations
6. Remove `with:` relation loading (coming in M5)
7. Remove `orderBy` (coming in M5)
8. Use native Convex mutations instead of ORM mutations

**Query API is compatible. Mutations and relation loading coming in M5+.**

## Additional Resources

- GitHub: https://github.com/get-convex/convex-backend
- Discord: https://convex.dev/community
- API Catalog: `/orm/api-catalog.json`
- Error Catalog: `/orm/error-catalog.json`
- Examples Registry: `/orm/examples-registry.json`
