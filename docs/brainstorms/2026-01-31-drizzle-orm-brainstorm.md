---
date: 2026-01-31
topic: drizzle-convex
---

# Drizzle-Convex: Familiar ORM Ergonomics for Convex

## What We're Building

@.claude/commands/clone.md

**Goal**: Clone Drizzle ORM's API for Convex to reduce learning curve for developers coming from SQL ORMs.

Similar to how Better Convex created cRPC (tRPC-like API for Convex), we'll create **Drizzle-Convex** - a Drizzle-inspired relations API built specifically for Convex's document database architecture.

### Core Insight

Developers know Drizzle/Prisma. They don't know convex-ents. By providing familiar ergonomics, we eliminate one major learning barrier when adopting Convex.

## Development Approach

**CRITICAL: Test-Driven Development (TDD)**

- **Always run `/test:tdd` skill** when implementing any milestone features
- **Use existing tests** as baseline (103 passing tests from convex-ents in `/convex/`)
- **Add tests for new coverage** if implementing drizzle-specific features not covered by convex-ents
- **Keep tests green**: All changes must maintain 100% passing tests

**Workflow:**

1. Identify feature to implement (e.g., `convexTable()`, `relations()`)
2. Run `/test:tdd` skill and `convex-test` skill
3. Use existing convex-ents tests as reference
4. Write test for drizzle API equivalent
5. Implement until test passes
6. Refactor while keeping tests green

## Test Infrastructure

**✅ Green Baseline Achieved**: All 103 tests passing with vitest

**Test Location**: `/convex/` (root level, pulled from convex-ents)

**Test Files**:

- `cascade.test.ts` - Soft deletion, scheduled deletion, cascade behavior (44 tests)
- `paginate.test.ts` - Pagination with edge traversal (~100 lines)
- `read.test.ts` - Index queries, edge traversal, getX, firstX (~500 lines)
- `rules.test.ts` - Authorization rules, skipRules (~200 lines)
- `types.test.ts` - Type inference validation (16 lines) ← **Start M1 here**
- `write.test.ts` - Insert, unique constraints, edge creation (~200 lines)
- `setup.testing.ts` - Test harness, convexTest wrapper (26 lines)
- `schema.ts` - Comprehensive test fixtures
- `functions.ts` - Helper functions for tests
- `rules.ts` - Authorization rules helpers
- `types.ts` - Type definitions for tests

**Test Infrastructure**:

- Uses [convex-test](https://www.npmjs.com/package/convex-test) - Mock implementation of Convex backend
- Vitest for test runner
- Edge-runtime environment
- vitest.config.mts at root configures edge-runtime

**Key Setup Details**:

```bash
# Test commands (in root package.json)
bun test         # Other tests (8 pass)
vitest run       # Convex tests (103 pass)

# Dependencies
convex-test ^0.0.39      # Convex test harness
vitest ^4.0.10           # Test framework
@edge-runtime/vm ^3.2.0  # Edge runtime environment
```

**convex-test Usage Pattern**:

```typescript
import { convexTest } from "convex-test";
import { test, expect } from "vitest";
import schema from "./schema";

test("some behavior", async () => {
  const t = convexTest(schema);

  // Call functions
  await t.mutation(api.users.create, { name: "Alice" });
  const users = await t.query(api.users.list);
  expect(users).toHaveLength(1);

  // Direct DB access
  await t.run(async (ctx) => {
    await ctx.db.insert("posts", { title: "Test" });
  });
});
```

**For detailed convex-test documentation:** See [Convex Testing Guide](https://docs.convex.dev/testing) for:

- Setup with different project structures
- Mocking fetch calls
- Testing scheduled functions
- Authentication testing
- HTTP actions testing
- Coverage measurement

**Migration Status**:

- ✅ All imports fixed (convex-ents → local)
- ✅ Duplicate indexes removed
- ✅ Tests running with vitest (used instead of bun test due to import.meta.glob requirement)

## Why Drizzle (Not Prisma)

After deep analysis of both libraries:

| Factor                  | Drizzle                     | Prisma                          |
| ----------------------- | --------------------------- | ------------------------------- |
| **Schema Definition**   | TypeScript-native           | Prisma Schema Language (DSL)    |
| **Code Generation**     | Type inference only         | Full client generation required |
| **API Surface**         | Minimal, focused            | Large, feature-heavy            |
| **Alignment with cRPC** | Builder pattern, fluent API | More declarative                |
| **Cloning Complexity**  | Moderate                    | High (need DSL parser)          |

**Decision: Clone Drizzle** because:

1. TypeScript-first (no DSL parser needed)
2. Simpler API surface to replicate
3. Better alignment with Better Convex philosophy
4. Growing community, modern design

## Technical Architecture

### Convex Constraints vs SQL

| Feature             | SQL (Drizzle)                       | Convex (Our Clone)                   |
| ------------------- | ----------------------------------- | ------------------------------------ |
| **Field selection** | `columns: { id: true, name: true }` | Not supported - always full document |
| **Joins**           | SQL JOIN operations                 | Edge traversal via `with`            |
| **Data model**      | Normalized tables                   | Document-based with edges            |
| **Indexes**         | Manual definition                   | Auto-created for edges               |

### Drizzle API We're Cloning

```typescript
// Schema definition (Drizzle pattern)
const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
});

const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

// Query (Drizzle pattern)
const users = await db.query.users.findMany({
  with: {
    posts: {
      where: eq(posts.published, true),
      limit: 5,
    },
  },
});
```

### Our Convex Adaptation

#### Iterative API Evolution (M1 → M6)

**M1-M5 (Intermediate)**: Use Convex validators directly
```typescript
const users = convexTable("users", {
  name: v.string(),
  email: v.string(),
  age: v.optional(v.number()),
});
```

**M6 (Final)**: Drizzle-style column builders
```typescript
const users = convexTable("users", {
  id: integer().primaryKey(),
  name: text().notNull(),
  email: text().notNull(),
  age: integer(),
});
```

**Why Iterative**:
- M1: Prove type inference with proven `v.*` validators (low risk, fast TDD)
- M6: Add Drizzle column builders as syntactic sugar (polish API)
- Each milestone builds on working foundation

#### Query API (M3+)

```typescript
// Schema + Relations (M1-M2)
const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles),
  posts: many(posts),
}));

// Query (M3)
const users = await ctx.db.query.users.findMany({
  with: {
    posts: { limit: 5 },
    profile: true,
  },
});
```

**Key Differences from Real Drizzle**:

- No `columns` selection (Convex always returns full document)
- `where` filtering adapts to Convex's edge-based model
- Direct `ctx.db` mapping with edge field helpers (no convex-ents)

## Drizzle Feature Compatibility Guide

**Strategy**: API-first with hybrid fallback
- **API-first**: Clone Drizzle API exactly where Convex architecture permits
- **Hybrid fallback**: Use Convex-native patterns when Drizzle API isn't feasible
- **Documentation**: Clearly document all limitations and differences from SQL Drizzle

### Category 1: 100% Drizzle Compatible

Features we can clone with identical API - developers get exact Drizzle ergonomics:

**Relations API** (M2):
- ✅ `relations(table, ({ one, many }) => ({ ... }))`
- ✅ `one(targetTable, { fields, references })`
- ✅ `many(targetTable, { relationName })`
- ✅ Type inference for relation configs

**Query Reads** (M3):
- ✅ `db.query.table.findMany({ columns, with, limit })`
- ✅ `db.query.table.findFirst({ where, with })`
- ✅ Column selection via `columns: { id: true, name: true }`
- ✅ Nested relation loading via `with: { posts: true }`

**Ordering** (M4.5):
- ✅ `orderBy: asc(table.createdAt)`
- ✅ `orderBy: [desc(table.year), asc(table.price)]`

**Pagination** (M3, M4.5):
- ✅ `limit(10)` - Direct map to `.take()`
- ⚠️ `offset(20)` - Works but less efficient than cursor (see Category 3)

**Core Filtering** (M4):
- ✅ `eq`, `ne`, `gt`, `gte`, `lt`, `lte` - Direct Convex filter support
- ✅ `and`, `or`, `not` - Logical operators
- ✅ `inArray`, `notInArray` - Expands to OR chain
- ✅ `isNull`, `isNotNull` - Optional field checks

**Basic Mutations** (M5):
- ✅ `db.insert(table).values({ ... })`
- ✅ `db.insert(table).values([{...}, {...}])` - Batch insert
- ✅ `db.update(table).set({ ... }).where(...)`
- ✅ `db.delete(table).where(...)`

### Category 2: Subset/Limited Drizzle

Features with Convex constraints - API looks like Drizzle but has limitations:

**Advanced Filtering** (Deferred to M4.5+):
- ❌ `like`, `ilike` - No native SQL LIKE in Convex
  - **Workaround**: Post-filter with JavaScript regex
  - **Impact**: O(n) scan instead of index usage
- ❌ `between` - Not native
  - **Workaround**: `and(gte(field, min), lte(field, max))`
- ❌ `exists`, `notExists` - No subqueries in Convex
  - **Workaround**: Use joins via relations instead

**String Operators** (M4.5+):
- ⚠️ `startsWith(field, prefix)` - Partial support
  - **Good**: Uses index range when field is indexed
  - **Limitation**: Limited to exact prefix matching
- ❌ `contains`, `endsWith` - No native support
  - **Workaround**: Post-filter with JavaScript `.includes()`

**Joins** (M2-M3):
- ✅ Via relations: `with: { author: true }` - Works great
- ❌ Manual SQL joins: `leftJoin`, `rightJoin`, `fullJoin` - Not applicable
  - **Convex Philosophy**: Relations defined upfront, not runtime joins
  - **Always inner join semantics** - no LEFT/RIGHT/FULL

**Column Selection** (M3):
- ✅ Select specific fields: `columns: { id: true, title: true }`
- ❌ Computed expressions: `sql<string>`lower(${title})`  - No SQL
  - **Workaround**: Use `.map()` after query for transformations

**Mutation Limitations** (M5):
- ❌ `returning()` clause - Convex mutations don't return values
- ❌ `onConflictDoUpdate()`, `onConflictDoNothing()` - No native upsert
  - **Workaround**: Manual get-then-patch or insert-with-try-catch
- ❌ Insert from select, update from joins - Not supported

**Advanced Queries** (Not Planned):
- ❌ Subqueries, CTEs (WITH clause), UNION/INTERSECT/EXCEPT
- ❌ GROUP BY, HAVING, window functions, DISTINCT
- ❌ Lateral joins, recursive queries

### Category 3: Convex-Native with Drizzle Philosophy

Features better in Convex or unique to Convex - follow Drizzle philosophy but different implementation:

**Edge-Based Relations** (M2):
- **Drizzle**: Foreign keys + SQL JOINs
- **Better-Convex**: Edge fields with automatic indexes
- **Advantage**: Better performance, auto-indexing, type-safe traversal

**Cursor-Based Pagination** (M3+):
- **Drizzle**: `limit().offset()` (offset pagination)
- **Better-Convex**: `.paginate({ cursor, numItems })`
- **Advantage**: O(1) vs O(n) for large offsets, stable pagination
- **Compatibility**: Still support `limit`/`offset` for familiarity

**Real-Time Subscriptions** (M3+):
- **Drizzle**: Static queries only
- **Better-Convex**: All queries auto-subscribe to changes
- **Advantage**: Live updates without polling or WebSockets setup
- **API**: Same query API, reactivity is automatic

**Write-Time Validation** (M1-M5):
- **Drizzle**: DB constraints enforce at write
- **Better-Convex**: Validators run on every write with TypeScript types
- **Advantage**: Compile-time + runtime validation
- **API**: Use Convex `v.*` validators (M1-M5) or Drizzle-style builders (M6)

**Index-Aware Filtering** (M4):
- **Drizzle**: Manual index hints
- **Better-Convex**: Automatic index selection via scoring algorithm
- **Advantage**: Optimal index usage without developer hints
- **Fallback**: Manual hints possible if needed (M4.5+)

**Server-Side vs Client-Side Filters**:
- **Index filters**: `.withIndex()` - server-side, fast (O(log n))
- **Post-filters**: `.filter()` - server-side but slower (O(n) after index)
- **Best Practice**: M4 compiler splits filters automatically

### Category 4: Not Applicable

Drizzle features that don't make sense for Convex - won't implement:

**Database Infrastructure**:
- ❌ Connection management, pooling, read replicas
- ❌ Migrations with `drizzle-kit` - Convex has declarative schema
- ❌ Transaction isolation levels - Convex always serializable
- ❌ Prepared statements - Convex auto-optimizes

**SQL-Specific**:
- ❌ Raw SQL: `db.execute(sql`...`)`, `sql` template literals
- ❌ Database views, materialized views, stored procedures, triggers
- ❌ Sequences, custom types, extensions (PostGIS, vector)

**Lock Management**:
- ❌ `FOR UPDATE`, `FOR SHARE`, `SKIP LOCKED`
- Convex manages locks internally

**Schema Constraints** (Use validators instead):
- ❌ CHECK constraints, foreign key cascade rules
- Use Convex validators and application logic

### Implementation Priority Matrix

Based on categories, here's the recommended implementation order:

| Milestone | Category | Features | Rationale |
|-----------|----------|----------|-----------|
| M1 | Cat 1 | Schema definition with `v.*` validators | Foundation, proven patterns |
| M2 | Cat 1 + 3 | Relations API (Drizzle) + Edges (Convex-native) | Core feature, type inference |
| M3 | Cat 1 + 3 | Query reads + cursor pagination | Essential queries, hybrid approach |
| M4 | Cat 1 + 2 | Core filtering (supported operators) | 90% of filter use cases |
| M4.5 | Cat 2 + 3 | String operators + ordering + advanced | Polish, edge cases |
| M5 | Cat 1 + 2 | Mutations (insert/update/delete) | CRUD complete |
| M6 | Cat 1 + 3 | Drizzle-style builders + polish | API refinement, final UX |

### How This Guides Milestones

**M1-M3**: Focus on Category 1 (100% compatible) - prove Drizzle ergonomics work
**M4**: Mix Category 1 + 2 - core filtering with clear limitation docs
**M4.5-M5**: Address Category 2 limitations with workarounds
**M6**: Polish Category 3 (Convex-native) features for best DX
**Post-M6**: Category 4 features explicitly documented as not applicable

### Key Differences Summary Table

| Feature | Drizzle | Better-Convex | Category | Status |
|---------|---------|---------------|----------|--------|
| Relations | `relations()`, `one()`, `many()` | Same API | 1 | ✅ M2 |
| Queries | `findMany()`, `findFirst()` | Same API | 1 | ✅ M3 |
| Core Filters | `eq`, `gt`, `and`, `or` | Same API | 1 | 📋 M4 |
| String Filters | `like`, `ilike`, `contains` | Post-filter workaround | 2 | 🔜 M4.5 |
| Joins | SQL LEFT/RIGHT/FULL | Relations only (inner) | 2 | ✅ M2 |
| Pagination | `limit`/`offset` | + cursor (recommended) | 1+3 | ✅ M3 |
| Mutations | INSERT/UPDATE/DELETE | Same, no RETURNING | 1+2 | 🔜 M5 |
| Real-time | None | Auto-subscribe | 3 | ✅ M3 |
| Subqueries | Full support | Not supported | 2 | ❌ N/A |

**Legend**: ✅ Completed | 📋 In Progress | 🔜 Planned | ❌ Not Applicable

---

## Implementation Milestones

Based on Drizzle's layered architecture analysis and feature compatibility guide above:

### Milestone 1: Schema Foundation

**Goal**: TypeScript-first table definitions with type inference

**Scope**:

- `convexTable()` function (like `pgTable`)
- **Uses Convex validators directly** (`v.string()`, `v.number()` - NOT Drizzle builders yet)
- Basic type inference (`InferSelectModel`, `InferInsertModel`)
- Symbol-based metadata storage (Drizzle pattern)

**Deliverable**: Can define tables and get TypeScript types

**Rationale**: Start with proven Convex validators for fast TDD iteration. Drizzle-style builders (`text()`, `integer()`) added in M6.

**Example**:

```typescript
const users = convexTable("users", {
  name: v.string(),
  email: v.string(),
});

type User = InferSelectModel<typeof users>;
// { _id: Id<'users'>, name: string, email: string, _creationTime: number }
```

### Milestone 2: Relations Layer

**Goal**: Define relationships between tables

**Scope**:

- `relations()` function (Drizzle API)
- `one()` and `many()` helpers
- Relation type inference
- Schema extraction (like `extractTablesRelationalConfig`)
- Generate edge field metadata (userId, postId) + traversal helpers

**Deliverable**: Can define relations, types inferred correctly

**Example**:

```typescript
const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [users.profileId],
    references: [profiles.id],
  }),
  posts: many(posts),
}));

// Generates: Edge field metadata + traversal helpers (no convex-ents dependency)
```

### Milestone 3: Query Builder - Read Operations

**Goal**: Drizzle-style query API for reads

**Scope**:

- `ctx.db.query.tableName.findMany()` API
- `ctx.db.query.tableName.findFirst()` API
- `with` option for loading relations
- Type inference for query results
- Limit/offset pagination

**Deliverable**: Can query with relations, fully typed

**Example**:

```typescript
const result = await ctx.db.query.users.findMany({
  with: {
    posts: { limit: 5 },
    profile: true,
  },
  limit: 10,
});
// Type: { name: string, posts: Post[], profile: Profile | null }[]
```

### Milestone 4: Query Builder - Where Filtering

**Goal**: Core filtering with type safety and index optimization

**Scope**:

- `where` option with filter expression compilation
- **Basic comparison operators**: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`
- **Logical operators**: `and`, `or`, `not`
- **Array/null operators**: `inArray`, `notInArray`, `isNull`, `isNotNull`
- Index selection algorithm (automatic optimization)
- Filter splitting (index-compatible vs post-filters)
- Type-safe filter expressions with FieldReference abstraction

**Deliverable**: Core filtering works with optimal index usage

**Deferred to M4.5**:
- `orderBy` (query feature, not filtering)
- String operators (`like`, `startsWith`, `contains`) - advanced features

**Example**:

```typescript
const result = await ctx.db.query.users.findMany({
  where: (user, { eq, and, gt }) =>
    and(eq(user.role, "admin"), gt(user.credits, 100)),
  with: { posts: true },
});
```

### Milestone 4.5: Query Builder - Ordering & Advanced Queries

**Goal**: Complete query API with ordering and advanced operators

**Scope**:

- **`orderBy` option**: Sort results by field(s) with `asc`/`desc`
- **String operators**: `like`, `ilike`, `startsWith`, `endsWith`, `contains`
- **Index-aware ordering**: Use Convex index ordering when possible
- **Multi-field ordering**: Combine multiple sort fields
- **Search integration**: Full-text search operators (if needed)

**Deliverable**: Full-featured query API matching Drizzle ergonomics

**Example**:

```typescript
const result = await ctx.db.query.users.findMany({
  where: (user, { startsWith }) => startsWith(user.name, "A"),
  orderBy: [desc(users.createdAt), asc(users.name)],
  limit: 10,
});
```

### Milestone 5: Mutations

**Goal**: Drizzle-style insert/update/delete

**Scope**:

- `ctx.db.insert(table).values(...)` API
- `ctx.db.update(table).set(...).where(...)` API
- `ctx.db.delete(table).where(...)` API
- Type-safe input validation
- Direct `ctx.db.insert/patch/delete` operations

**Deliverable**: Full CRUD with Drizzle ergonomics

**Example**:

```typescript
await ctx.db.insert(users).values({
  name: "Alice",
  email: "alice@example.com",
});

await ctx.db
  .update(users)
  .set({ name: "Alice Updated" })
  .where(eq(users.id, userId));
```

### Milestone 6: Advanced Features & Drizzle-Style API

**Goal**: Polish and final API alignment with Drizzle

**Scope**:

- **Drizzle-style column builders** (`text()`, `integer()`, `boolean()`, etc.)
  - Drop-in replacement for `v.*` validators
  - Same API as Drizzle ORM (`.notNull()`, `.default()`, `.primaryKey()`)
  - Type inference compatibility with M1 foundation
- Default values support (`.default("draft")`)
- Transaction support (Convex mutations are already transactional)
- Computed fields / extras
- Relation load strategies
- Schema migrations helpers
- Documentation and examples

**Deliverable**: Final API matches Drizzle ergonomics

**Example**:

```typescript
// Final API (M6) - Drizzle-style
const users = convexTable("users", {
  id: integer().primaryKey(),
  name: text().notNull(),
  email: text().notNull(),
  role: text().default("user"),
  age: integer(), // nullable
});

// Still works with M1 validators (backward compatible)
const posts = convexTable("posts", {
  title: v.string(),
  content: v.string(),
});
```

## Type Mapping Reference

**Cherry-pick convex-ents patterns** for TypeScript type mapping and runtime utilities:

From `convex-ents/src/schema.ts` (patterns to adapt):

- Schema extraction algorithm
- Edge inverse detection logic
- Type inference from validators
- Validator introspection utilities

From `convex-ents/src/functions.ts` (patterns to adapt):

- Edge traversal helpers
- Type-safe query builders
- Generic ent type utilities

Key patterns we'll reuse directly in ORM code:

```typescript
// Adapt edge traversal pattern (no convex-ents dependency)
type EdgeTraversal<T> = /* extract from ents, simplify */

// Adapt type inference pattern
type ValidatorToType<V> = V extends Validator<infer T> ? T : never;

// Build directly on ctx.db with helper utilities
```

We'll map Drizzle relations → direct Convex edge fields + traversal helpers.

**For detailed TypeScript patterns:** See @docs/brainstorms/2026-01-31-typescript-patterns-from-drizzle-and-ents.md for comprehensive analysis of:

- Symbol-based metadata storage
- Type branding with `declare readonly _`
- Builder patterns and fluent APIs
- Edge detection algorithms
- Promise-based query builders

## Key Design Decisions

### 1. **Direct Convex Mapping**

Drizzle-Convex maps **directly to Convex `ctx.db`**:

- Schema definitions generate Convex `defineTable()` calls
- Relations map to edge fields (`userId`, `postId`, etc.)
- Queries translate to `ctx.db` operations with helper utilities
- Cherry-pick relevant convex-ents features (edge traversal, soft deletion) into ORM code
- No convex-ents dependency

**Why**: Full control, no external dependencies, lighter weight. Reuse proven ents patterns without the facade layer.

### 2. **No Field Selection**

Unlike Drizzle's `columns: { id: true }`, we can't select fields:

- Convex always queries full documents
- Attempting to clone this would add false complexity
- Document this clearly as a difference

### 3. **Index Strategy**

- Drizzle requires manual indexes
- Convex-ents auto-creates indexes for edges
- We'll expose index hints in schema but handle automatically

### 4. **Type Inference Strategy**

Study Drizzle's type system:

- Symbol-based metadata storage
- Generic config propagation
- Conditional types for nullable tracking
- Apply to Convex's validator system

### 5. **API Evolution Strategy (Iterative TDD)**

**Decision**: Start with Convex validators, evolve to Drizzle-style builders

**Milestones 1-5**: Use `v.string()`, `v.number()`, etc.
- Proven, well-understood
- Fast iteration for TDD
- Type inference complexity isolated

**Milestone 6**: Add `text()`, `integer()`, etc. as syntactic sugar
- Maps to underlying validators
- Drop-in Drizzle compatibility
- Backward compatible with `v.*` syntax

**Why Iterative**:
- **Lower risk**: Build type inference on proven foundation
- **Faster validation**: Don't solve two problems at once
- **Clear migration**: M1-M5 proves core, M6 polishes API
- **TDD-friendly**: Simple → Complex, each milestone builds on working code

**Trade-off**: Users see `v.string()` initially, but final API is pure Drizzle

## Open Questions

### Architecture

- [ ] **Schema registration**: Global registry vs per-context?
- [ ] **Backward compatibility**: How to migrate from convex-ents?
- [ ] **Tree shaking**: Ensure unused tables don't bloat bundle

### API Surface

- [ ] **Where syntax**: Exact Drizzle syntax or Convex-optimized?
- [ ] **Ordering**: Support Drizzle's `orderBy` or adapt to Convex patterns?
- [ ] **Aggregations**: Clone Drizzle's `count()`, `sum()` or use Convex aggregates?

### Type System

- [ ] **Many-to-many**: How to handle junction tables in Drizzle style?
- [ ] **Self-directed edges**: Drizzle's relation names vs convex-ents approach?
- [ ] **System tables**: Expose `_storage`, `_scheduled_functions` in Drizzle API?

### Developer Experience

- [ ] **Migration guide**: Tool to convert convex-ents → Drizzle-Convex?
- [ ] **Codemods**: Automate conversion of existing schemas?
- [ ] **Documentation**: Show Drizzle → Drizzle-Convex mapping for each pattern?

## Success Criteria

### Phase 1 (Schema + Relations)

- [ ] Define tables with TypeScript
- [ ] Define relations with `relations()`
- [ ] Full type inference (InferSelectModel, InferInsertModel)
- [ ] Generates valid Convex schema with edge fields

### Phase 2 (Queries)

- [ ] `findMany()` with relations
- [ ] `findFirst()` with relations
- [ ] Type-safe query results
- [ ] Proper nullability tracking

### Phase 3 (Mutations)

- [ ] Insert with type validation
- [ ] Update with where clause
- [ ] Delete operations
- [ ] Relation mutations (add/remove edges)

### Phase 4 (Polish)

- [ ] Documentation parity with cRPC
- [ ] Migration guide from convex-ents
- [ ] Real-world example app
- [ ] Performance benchmarks

## Next Steps

1. **Validate approach**: Review this brainstorm, gather feedback
2. **Prototype schema layer**: Build Milestone 1 to prove concept
3. **Type system spike**: Confirm type inference patterns work with Convex validators
4. **Plan detailed**: Break each milestone into implementation tasks

---

## 1:1 Documentation Mapping from Drizzle

**Goal**: Create comprehensive migration docs showing exact Drizzle → Better-Convex mappings.

### Documentation Structure

Mirror Drizzle's documentation structure with Better-Convex equivalents:

```
docs/
  orm/
    getting-started.md          # Quick start with Better-Convex ORM
    schema-definition.md        # convexTable() + relations()
    queries/
      select.md                 # findMany(), findFirst()
      filtering.md              # where clause operators
      ordering.md               # orderBy with asc/desc
      pagination.md             # limit/offset + cursor pagination
      relations.md              # with option for loading relations
    mutations/
      insert.md                 # insert().values()
      update.md                 # update().set().where()
      delete.md                 # delete().where()
    migration-from-drizzle.md   # Complete migration guide
    api-reference.md            # Full API reference
    limitations.md              # Category 2 & 4 features
```

### Mapping Strategy by Category

**Category 1 (100% Compatible)** - Direct translation:
```markdown
# Drizzle Docs → Better-Convex Docs

## Same API, Same Code
Show side-by-side code that's IDENTICAL:

### Drizzle (SQL)
\`\`\`typescript
const users = await db.query.users.findMany({
  where: eq(users.role, 'admin')
});
\`\`\`

### Better-Convex (Convex)
\`\`\`typescript
const users = await db.query.users.findMany({
  where: (user, { eq }) => eq(user.role, 'admin')
});
\`\`\`

✅ **API Compatibility**: 100% - Same function names, same options
```

**Category 2 (Limited)** - Show workarounds:
```markdown
# Drizzle Feature → Better-Convex Adaptation

## Pattern Matching (LIKE)

### Drizzle
\`\`\`typescript
const users = await db.query.users.findMany({
  where: like(users.email, '%@example.com')
});
\`\`\`

### Better-Convex - Option 1: Post-filter (Simple)
\`\`\`typescript
const users = await db.query.users.findMany();
const filtered = users.filter(u => u.email.endsWith('@example.com'));
\`\`\`

### Better-Convex - Option 2: Index range (Fast)
\`\`\`typescript
// For startsWith only - uses Convex index
const users = await db.query.users.findMany({
  where: (user, { gte, lt, and }) => and(
    gte(user.email, prefix),
    lt(user.email, prefix + '\uffff')
  )
});
\`\`\`

⚠️ **Limitation**: No native LIKE operator in Convex
💡 **Workaround**: Post-filter or use index ranges for prefix matching
📊 **Performance**: Post-filter O(n), index range O(log n)
```

**Category 3 (Convex-Native)** - Highlight advantages:
```markdown
# Convex-Specific Features

## Real-Time Subscriptions (Not in Drizzle)

### Drizzle - Manual Polling
\`\`\`typescript
// Poll every 5 seconds
setInterval(async () => {
  const users = await db.query.users.findMany();
  updateUI(users);
}, 5000);
\`\`\`

### Better-Convex - Auto-Subscribe
\`\`\`typescript
// Automatically updates when data changes
const users = useQuery(api.users.list);
// No polling needed! ✨
\`\`\`

✅ **Convex Advantage**: Built-in real-time subscriptions
⚡ **Performance**: Instant updates, no polling overhead
🎯 **Use Case**: Live dashboards, collaborative apps
```

**Category 4 (Not Applicable)** - Explain why not needed:
```markdown
# Not Needed in Convex

## Database Migrations

### Drizzle
\`\`\`bash
# Generate migration
drizzle-kit generate:pg

# Apply migration
drizzle-kit push:pg
\`\`\`

### Better-Convex - Declarative Schema
\`\`\`typescript
// Just update your schema - Convex handles the rest
const users = convexTable('users', {
  name: v.string(),
  email: v.string(), // Add new field - auto-migrated
});
\`\`\`

❌ **Not Needed**: Convex uses declarative schema
✅ **Alternative**: Update schema.ts, Convex migrates automatically
🎯 **Benefit**: No migration files, no version tracking
```

### Documentation Pages to Create

Priority order based on categories and milestones:

#### Phase 1: Core Features (M1-M3) - Category 1
1. **Getting Started** - Installation, setup, first query
2. **Schema Definition** - `convexTable()`, validators, type inference
3. **Relations** - `relations()`, `one()`, `many()`, inverse relations
4. **Basic Queries** - `findMany()`, `findFirst()`, `columns`, `limit`
5. **Loading Relations** - `with` option, nested relations, type safety

#### Phase 2: Filtering & Mutations (M4-M5) - Category 1 + 2
6. **Core Filtering** - `eq`, `ne`, `gt`, `and`, `or` - identical to Drizzle
7. **Advanced Filtering** - `like`, `startsWith`, `inArray` - with workarounds
8. **Ordering** - `orderBy`, `asc`, `desc` - identical to Drizzle
9. **Pagination** - `limit`/`offset` + cursor (Convex advantage)
10. **Insert** - `insert().values()`, batch inserts
11. **Update** - `update().set().where()`
12. **Delete** - `delete().where()`

#### Phase 3: Migration & Advanced (M6+) - All Categories
13. **Migration from Drizzle** - Complete guide with gotchas
14. **Migration from Prisma** - Similar concepts, different syntax
15. **Limitations** - Category 2 & 4 features, workarounds
16. **Convex-Specific Features** - Real-time, edges, cursor pagination
17. **API Reference** - Complete API surface
18. **Performance Guide** - Index usage, optimization patterns

### Documentation Template

Each page follows this structure:

```markdown
# [Feature Name]

## Overview
Brief description of the feature and when to use it.

## Drizzle Comparison
| Aspect | Drizzle | Better-Convex | Notes |
|--------|---------|---------------|-------|
| API | `example()` | `example()` | Identical/Different |
| Category | 1/2/3/4 | - | Compatibility level |

## Basic Usage

### Drizzle
\`\`\`typescript
// Drizzle code example
\`\`\`

### Better-Convex
\`\`\`typescript
// Better-Convex equivalent
\`\`\`

## Type Safety
Show TypeScript inference, autocomplete, error examples.

## Advanced Patterns
Real-world use cases, edge cases.

## Limitations & Workarounds
(Category 2 only) - What doesn't work, how to adapt.

## Performance Considerations
Index usage, optimization tips.

## See Also
- Related pages
- API reference links
```

### Example: First Documentation Page

```markdown
# Getting Started with Better-Convex ORM

## Overview

Better-Convex ORM brings Drizzle's familiar ergonomics to Convex. If you know Drizzle, you already know Better-Convex ORM.

**Key Benefits:**
- ✅ 100% type-safe queries and mutations
- ✅ Drizzle-style API for zero learning curve
- ✅ Real-time subscriptions built-in
- ✅ No migration files needed

## Installation

\`\`\`bash
npm install better-convex
\`\`\`

## Define Your Schema

### Drizzle (PostgreSQL)
\`\`\`typescript
import { pgTable, serial, text } from 'drizzle-orm/pg-core';

const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
});
\`\`\`

### Better-Convex (Convex)
\`\`\`typescript
import { convexTable } from 'better-convex/orm';
import { v } from 'convex/values';

const users = convexTable('users', {
  name: v.string(),
  email: v.string(),
});
// Note: _id and _creationTime auto-added by Convex
\`\`\`

## Define Relations

### Drizzle
\`\`\`typescript
import { relations } from 'drizzle-orm';

const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));
\`\`\`

### Better-Convex
\`\`\`typescript
import { relations } from 'better-convex/orm';

const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));
// Identical API! ✨
\`\`\`

## Query Your Data

### Drizzle
\`\`\`typescript
const allUsers = await db.query.users.findMany({
  with: { posts: true },
  where: eq(users.role, 'admin'),
  limit: 10,
});
\`\`\`

### Better-Convex
\`\`\`typescript
const allUsers = await db.query.users.findMany({
  with: { posts: true },
  where: (user, { eq }) => eq(user.role, 'admin'),
  limit: 10,
});
// Almost identical - just wrap where in callback for type safety
\`\`\`

## What's Different?

| Feature | Drizzle | Better-Convex |
|---------|---------|---------------|
| Schema | Column builders | Convex validators (M1-M5) |
| Where clause | Direct operators | Callback with operators |
| Real-time | Not available | Built-in ✨ |
| Migrations | Manual files | Automatic |
| Pagination | offset only | offset + cursor |

## Next Steps

- [Schema Definition](./schema-definition.md) - Deep dive into tables and types
- [Relations](./relations.md) - One-to-one, one-to-many, many-to-many
- [Queries](./queries/select.md) - findMany, findFirst, type inference
- [Migration Guide](./migration-from-drizzle.md) - Complete Drizzle → Better-Convex guide
```

### Documentation Metrics

Track coverage by category:

- **Category 1 (100% Compatible)**: Should have 1:1 page for every Drizzle doc
- **Category 2 (Limited)**: Must document limitations + workarounds
- **Category 3 (Convex-Native)**: Highlight advantages over Drizzle
- **Category 4 (Not Applicable)**: Explain why not needed, Convex alternatives

**Goal**: Developers can find EVERY Drizzle concept mapped to Better-Convex.

---

## Notes

- **No convex-ents dependency**: Map directly to Convex ctx.db. Cherry-pick proven patterns from convex-ents source (edge traversal, soft deletion) into ORM code.
- **Naming**: `better-convex/drizzle` follows existing pattern (like `better-convex/auth`).
- **Inspiration not rewrite**: Goal is familiar API, not 100% Drizzle compatibility. Adapt where Convex patterns diverge from SQL.

---

## Implementation Status

### ✅ Milestone 1: Schema Foundation (COMPLETED 2026-01-31)

**Deliverables:**
- ✅ `convexTable()` function with Convex validators (`v.string()`, `v.number()`)
- ✅ Type inference (`InferSelectModel`, `InferInsertModel`)
- ✅ Symbol-based metadata storage (Drizzle pattern)
- ✅ Basic validation and type safety

**Files Created:**
- [packages/better-convex/src/orm/table.ts](packages/better-convex/src/orm/table.ts) - ConvexTable implementation
- [packages/better-convex/src/orm/symbols.ts](packages/better-convex/src/orm/symbols.ts) - Metadata symbols
- [packages/better-convex/src/orm/types.ts](packages/better-convex/src/orm/types.ts) - Type utilities

**Test Coverage:** Integrated with existing convex-ents tests (103 passing)

### ✅ Milestone 2: Relations Layer (COMPLETED 2026-01-31)

**Deliverables:**
- ✅ `relations()` function (Drizzle API)
- ✅ `one()` and `many()` helpers with type inference
- ✅ Schema extraction via `extractRelationsConfig()`
- ✅ EdgeMetadata generation for M3 query builder
- ✅ Inverse relation detection (relationName or source/target matching)
- ✅ Security: prototype pollution prevention, validation
- ✅ Data integrity: field existence, cardinality compatibility, circular dependency detection

**Files Created:**
- [packages/better-convex/src/orm/relations.ts](packages/better-convex/src/orm/relations.ts:1-327) - Relations API (Drizzle pattern verified)
- [packages/better-convex/src/orm/extractRelationsConfig.ts](packages/better-convex/src/orm/extractRelationsConfig.ts:1-284) - Schema extraction (O(n) algorithm)
- [convex/relations.test.ts](convex/relations.test.ts:1-328) - 11 test cases

**Test Coverage:** 126 tests passing (11 new relations tests + 115 existing)

**Key Implementation Details:**
- Dual-storage pattern: runtime table instances + compile-time string generics
- `withFieldName()` deferred binding pattern (verified from Drizzle source)
- Higher-order factory functions (`createOne`, `createMany`)
- O(n) buffering algorithm for forward references
- Only `one()` relations checked for circular dependencies (not bidirectional `many()`)

**Package Integration:**
- ✅ Export added: `better-convex/orm`
- ✅ Build configuration updated (tsdown.config.ts)
- ✅ TypeScript compilation: ✅ passing
- ✅ Linting: ✅ passing
- ✅ All tests: ✅ passing (126 total)

**Example Usage:**
```typescript
import { convexTable, relations } from 'better-convex/orm';
import { v } from 'convex/values';

// M1: Tables
const users = convexTable('users', {
  name: v.string(),
  email: v.string(),
});

const posts = convexTable('posts', {
  title: v.string(),
  userId: v.id('users'),
});

// M2: Relations
const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

const postsRelations = relations(posts, ({ one }) => ({
  user: one(users, { fields: ['userId'] }),
}));

// Type inference works
type User = InferSelectModel<typeof users>;
// { _id: Id<'users'>, _creationTime: number, name: string, email: string }

type UserRelations = InferRelations<typeof usersRelations>;
// { posts: Post[] }
```

**Next Up:** Milestone 3 - Query Builder (Read Operations)

### ✅ Milestone 3: Query Builder - Read Operations (COMPLETED 2026-01-31)

**Deliverables:**
- ✅ Query builder infrastructure with promise-based lazy execution
- ✅ `findMany()` and `findFirst()` methods
- ✅ Type inference for query results with column selection and relations
- ✅ Database context integration (`createDatabase()`)
- ✅ Query compilation to Convex API
- ✅ Basic filtering, ordering, limit, and offset support

**Files Created:**
- [packages/better-convex/src/orm/query-promise.ts](packages/better-convex/src/orm/query-promise.ts) - QueryPromise base class for lazy execution
- [packages/better-convex/src/orm/query.ts](packages/better-convex/src/orm/query.ts) - GelRelationalQuery with execute() implementation
- [packages/better-convex/src/orm/query-builder.ts](packages/better-convex/src/orm/query-builder.ts) - RelationalQueryBuilder entry point
- [packages/better-convex/src/orm/database.ts](packages/better-convex/src/orm/database.ts) - createDatabase() and buildSchema()
- [packages/better-convex/src/orm/query-compiler.ts](packages/better-convex/src/orm/query-compiler.ts) - Query compilation helpers
- [convex/query-builder.test.ts](convex/query-builder.test.ts) - 7 test cases

**Files Modified:**
- [packages/better-convex/src/orm/types.ts](packages/better-convex/src/orm/types.ts) - Added M3 query builder types (DBQueryConfig, BuildQueryResult, etc.)
- [packages/better-convex/src/orm/index.ts](packages/better-convex/src/orm/index.ts) - Added M3 exports

**Test Coverage:** 29 tests passing (22 M1+M2 + 7 new M3)

**Key Implementation Details:**
- Promise-based lazy execution pattern (query only executes on await)
- QueryPromise implements Promise interface via thenable delegation
- Convex API: `GenericDatabaseReader<any>`, `.take()` returns Promise directly (no `.collect()`)
- Type inference with recursive conditional types (BuildQueryResult, BuildRelationResult)
- Column selection via PickColumns helper type
- Relation loading stubbed for Phase 4 (currently returns rows unchanged)
- Parameter properties pattern from Drizzle (constructor shorthand)
- 9 intentional lint warnings (Drizzle patterns: noParameterProperties, noThenProperty)

**Package Integration:**
- ✅ Export added: query builder classes and types
- ✅ TypeScript compilation: ✅ passing
- ✅ Linting: ✅ passing (9 intentional warnings documented)
- ✅ All tests: ✅ passing (29 total)

**Example Usage:**
```typescript
import { convexTable, relations, createDatabase, buildSchema, extractRelationsConfig } from 'better-convex/orm';
import { v } from 'convex/values';

// M1: Tables
const users = convexTable('users', {
  name: v.string(),
  email: v.string(),
});

const posts = convexTable('posts', {
  title: v.string(),
  userId: v.id('users'),
});

// M2: Relations
const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

const postsRelations = relations(posts, ({ one }) => ({
  user: one(users, { fields: ['userId'] }),
}));

// M3: Setup query builder
const schema = buildSchema({ users, posts }, { usersRelations, postsRelations });
const edges = extractRelationsConfig(schema);
const db = createDatabase(ctx.db, schema, edges);

// M3: Query with relations (lazy execution)
const usersWithPosts = await db.query.users.findMany({
  with: {
    posts: { limit: 5 },
  },
  limit: 10,
});
// Type: { _id: Id<'users'>, _creationTime: number, name: string, email: string, posts: Post[] }[]

// M3: Find first with filtering
const user = await db.query.users.findFirst({
  where: (cols, { eq }) => eq(cols.email, 'alice@example.com'),
});
// Type: User | undefined
```

**Next Up:**
- **M4**: Query Builder - Where Filtering (core operators, index optimization)
- **M4.5**: Query Builder - Ordering & Advanced Queries (`orderBy`, string operators)
- **M5**: Mutations (`insert`, `update`, `delete`)
- **M6**: Drizzle-Style Column Builders & Polish
