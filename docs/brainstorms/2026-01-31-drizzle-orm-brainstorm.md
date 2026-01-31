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

## Implementation Milestones

Based on Drizzle's layered architecture analysis:

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

**Goal**: Convex-adapted filtering

**Scope**:

- `where` option (adapts to Convex semantics)
- Comparison operators (`eq`, `gt`, `lt`, etc)
- Index-based filtering (maps to Convex indexes)
- Search integration

**Deliverable**: Can filter queries with type safety

**Example**:

```typescript
const result = await ctx.db.query.users.findMany({
  where: eq(users.email, "test@example.com"),
  with: { posts: true },
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

## Notes

- **No convex-ents dependency**: Map directly to Convex ctx.db. Cherry-pick proven patterns from convex-ents source (edge traversal, soft deletion) into ORM code.
- **Naming**: `better-convex/drizzle` follows existing pattern (like `better-convex/auth`).
- **Inspiration not rewrite**: Goal is familiar API, not 100% Drizzle compatibility. Adapt where Convex patterns diverge from SQL.
