# Type-Only Testing for Better Convex ORM

Comprehensive guide to compile-time type verification using mock database pattern, Better Convex type system specifics, and Drizzle-style testing methodology.

## Table of Contents

- [Mock Database Pattern](#mock-database-pattern)
- [Better Convex Type System Specifics](#better-convex-type-system-specifics)
- [Type Testing Methodology](#type-testing-methodology)
- [File Structure](#file-structure)
- [Patterns](#patterns)
- [Implementation Workflow](#implementation-workflow)
- [References](#references)

---

## Mock Database Pattern

### Problem

When testing TypeScript types for ORM queries, you need to verify that query result types are correct without actually executing database queries or setting up a real database connection.

### When to Use

- Testing ORM query result types (findMany, findFirst, etc.)
- Verifying InferSelectModel, InferInsertModel, or similar type utilities
- Need type-only tests without runtime execution
- Working with Better Convex ORM type inference

### Solution

#### 1. Create Mock Database

Mock the database reader/connection using type casting:

```typescript
import type { GenericDatabaseReader } from 'convex/server';
import { createDatabase, buildSchema } from 'better-convex/orm';
import * as schema from './schema';

// Mock database reader - empty object cast to correct type
const mockDb = {} as GenericDatabaseReader<any>;

// Create database instance with schema
const schemaConfig = buildSchema(schema);
const db = createDatabase(mockDb, schemaConfig);
```

#### 2. Use `await` for Type Inference

Use `await` to extract the return type without execution:

```typescript
import { type Equal, Expect } from './utils';

// Test query result type
{
  const result = await db.query.users.findMany({
    where: (users, { eq }) => eq(users.name, 'Alice'),
  });

  type Expected = UserRow[];
  Expect<Equal<typeof result, Expected>>;
}
```

#### 3. Test Utilities (Equal/Expect Pattern)

Use Drizzle-style type assertion utilities:

```typescript
// utils.ts
export function Expect<T extends true>() {}

export type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;
```

#### 4. Verify Field Types

Extract and test individual field types:

```typescript
{
  const result = await db.query.users.findFirst();

  type User = typeof result; // User | undefined
  type NameType = NonNullable<User>['name']; // string

  Expect<Equal<NameType, string>>;
}
```

### Key Insights

1. **Mock is type-only**: The empty object `{}` is never executed, only used for type inference
2. **`await` extracts types**: TypeScript infers the return type from the promise without awaiting
3. **No runtime cost**: Tests run via `tsc --noEmit`, zero runtime overhead
4. **Works with all ORMs**: Pattern applies to any TypeScript ORM with typed query builders

### Complete Example

```typescript
import { buildSchema, createDatabase } from 'better-convex/orm';
import type { GenericDatabaseReader } from 'convex/server';
import * as schema from './schema';
import { type Equal, Expect } from './utils';
import { UserRow } from './fixtures/types';

// Mock database
const mockDb = {} as GenericDatabaseReader<any>;
const schemaConfig = buildSchema(schema);
const db = createDatabase(mockDb, schemaConfig);

// Test: findMany returns array
{
  const result = await db.query.users.findMany({
    where: (users, { eq }) => eq(users.name, 'Alice'),
  });

  type Expected = UserRow[];
  Expect<Equal<typeof result, Expected>>;
}

// Test: findFirst returns T | undefined
{
  const result = await db.query.users.findFirst();

  type Expected = UserRow | undefined;
  Expect<Equal<typeof result, Expected>>;
}

// Test: columns selection narrows type
{
  const result = await db.query.users.findMany({
    columns: { name: true, email: true },
  });

  type Row = typeof result[number];
  type Expected = { name: string; email: string };

  Expect<Equal<Row, Expected>>;
}

export {};
```

---

## Better Convex Type System Specifics

Better Convex ORM has type inference conventions that differ from other ORMs (Drizzle, Prisma), leading to type errors when using common patterns.

### When to Use This Guide

- Type errors: `Type 'string' is not assignable to type 'Id<"users">'`
- InferInsertModel tests failing (expected optional fields are required)
- Default values don't make insert fields optional
- _id field showing as `string` instead of GenericId brand

### Key Type System Rules

#### 1. _id is GenericId, Not String

**Rule**: System `_id` field uses branded GenericId type, not plain string.

```typescript
import { InferSelectModel } from 'better-convex/orm';
import type { GenericId } from 'convex/values';

const users = convexTable('users', {
  name: text().notNull(),
});

type User = InferSelectModel<typeof users>;

// ❌ WRONG
type Expected = {
  _id: string;  // Type error!
  _creationTime: number;
  name: string;
};

// ✅ CORRECT
type Expected = {
  _id: GenericId<'users'>;  // Branded type with table name
  _creationTime: number;
  name: string;
};
```

**Why**: GenericId provides type safety - can't accidentally use wrong table's ID.

#### 2. InferInsertModel: Nullable Fields Are Required

**Rule**: Nullable columns are required in insert type with `| null`, not optional.

```typescript
const users = convexTable('users', {
  name: text().notNull(),
  age: integer(),  // nullable
});

type Insert = InferInsertModel<typeof users>;

// ❌ WRONG (Drizzle convention)
type Expected = {
  name: string;
  age?: number | null;  // Optional with ?
};

// ✅ CORRECT (Better Convex convention)
type Expected = {
  name: string;
  age: number | null;  // Required, not optional
};
```

**Why**: Better Convex requires explicit null handling - can't omit nullable fields.

#### 3. Default Values Don't Change Nullability

**Rule**: `.default()` doesn't make fields optional in insert or non-null in select.

```typescript
const posts = convexTable('posts', {
  title: text().notNull(),
  status: text().default('draft'),  // Has default
});

// Insert type
type Insert = InferInsertModel<typeof posts>;
type Expected = {
  title: string;
  status: string | null;  // Still nullable, NOT optional
};

// Select type
type Post = InferSelectModel<typeof posts>;
type StatusType = Post['status'];  // string | null (not just string)
```

**Why**: Defaults are runtime values, not type-level guarantees.

#### 4. Method Chaining: notNull() Removes Nullability

**Rule**: Use `.notNull()` to remove null from type, even with defaults.

```typescript
const posts = convexTable('posts', {
  title: text().notNull(),
  status: text().notNull().default('draft'),  // notNull + default
});

type Insert = InferInsertModel<typeof posts>;
type Expected = {
  title: string;
  status: string;  // No | null because of notNull()
};
```

#### 5. GenericId Brand Preservation

**Rule**: GenericId brands never widen to string in type operations.

```typescript
const users = convexTable('users', {
  cityId: id('cities').notNull(),
});

type User = InferSelectModel<typeof users>;
type CityIdType = User['cityId'];

// Verify brand not widened
type IsString = string extends CityIdType ? true : false;
Expect<Equal<IsString, false>>;  // ✅ Not widened

// Correct type
Expect<Equal<CityIdType, GenericId<'cities'>>>;  // ✅
```

**Why**: Merge<> utility preserves phantom brands (not `&` operator).

### Comparison with Other ORMs

| Feature              | Better Convex      | Drizzle/Prisma     |
| -------------------- | ------------------ | ------------------ |
| _id type             | GenericId<'table'> | string             |
| Nullable in insert   | Required with null | Optional with `?`  |
| Default makes        | Nothing            | Field optional     |
| notNull() + default  | Required           | Required           |

### Common Type Errors and Fixes

#### Error: "Type 'string' is not assignable to type 'Id<"users">'"

```typescript
// ❌ Wrong
const user: User = {
  _id: '123',  // Plain string
  ...
};

// ✅ Fix: Cast to GenericId
const user: User = {
  _id: '123' as GenericId<'users'>,
  ...
};
```

#### Error: "Property 'age' is missing"

```typescript
// ❌ Wrong: Omitting nullable field
const insert: Insert = {
  name: 'Alice',
  // Missing age
};

// ✅ Fix: Include with null
const insert: Insert = {
  name: 'Alice',
  age: null,
};
```

#### Error: "Type 'false' does not satisfy constraint 'true'"

This means your type assertion is wrong. Check:
1. Is _id using GenericId not string?
2. Are nullable fields required (not optional)?
3. Do defaults still include | null?

### Notes

- Better Convex prioritizes explicitness over convenience
- Phantom type brands (_id, columns) preserved through Merge<> utility
- Use fixtures/types.ts to share expected types across tests
- For optional insert fields, use `.notNull().default()` not just `.default()`

---

## Type Testing Methodology

Type-only tests for Better Convex ORM, following Drizzle patterns.

### Running Tests

```bash
bun typecheck  # Runs tsc --noEmit on all test files
```

### File Structure

- `utils.ts` - Shared test utilities (Equal<>, Expect<>)
- `tables-rel.ts` - Test table fixtures with relations
- `select.ts` - Query result type tests (WHERE, ORDER BY, LIMIT, columns)
- `filter-operators.ts` - Operator type tests
- `get-column-data.ts` - GetColumnData utility tests
- `minimal-*.ts` - Minimal focused tests for specific utilities
- `db-rel.ts` - Relation loading tests (deferred to Phase 4)
- `fixtures/` - Shared test data types (UserRow, PostRow, etc.)
- `debug/` - Investigation artifacts (not production tests)

### Patterns

#### Type Assertions

Use `Expect<Equal<Actual, Expected>>` pattern from Drizzle:

```typescript
import { Expect, Equal } from './utils';
import { InferSelectModel } from 'better-convex/orm';

const users = convexTable('users', {
  name: text().notNull(),
  age: integer(),
});

type User = InferSelectModel<typeof users>;

Expect<Equal<User, {
  _id: string;
  _creationTime: number;
  name: string;
  age: number | null;
}>>;
```

#### Negative Tests

Use `@ts-expect-error` on line immediately before error:

```typescript
// ✅ CORRECT: Directive on line immediately before error
db.query.users.findMany({
  where: (users, { eq }) =>
    // @ts-expect-error - Property 'invalid' does not exist
    eq(users.invalid, 'test'),
});

// ❌ WRONG: Directive not on line immediately before error
db.query.users.findMany({
  // @ts-expect-error - Property 'invalid' does not exist
  where: (users, { eq }) => eq(users.invalid, 'test'),
});
```

#### Section Organization

Use Drizzle-style 80-char separators for major sections:

```typescript
// ============================================================================
// WHERE CLAUSE TYPE TESTS
// ============================================================================

// Test 1: eq operator
{
  const result = await db.query.users.findMany({
    where: (users, { eq }) => eq(users.name, 'Alice'),
  });

  type Expected = UserRow[];
  Expect<Equal<Expected, typeof result>>;
}
```

### Anti-Patterns

❌ **Don't repeat type definitions** - use `fixtures/types.ts`:

```typescript
// ❌ BAD: Repeated type definition
type Expected = Array<{
  _id: string;
  _creationTime: number;
  name: string;
  // ... 10+ lines repeated 10 times
}>;

// ✅ GOOD: Import shared type
import { UserRow } from './fixtures/types';
type Expected = UserRow[];
```

❌ **Don't mix debug files with production** - use `debug/` subdirectory

❌ **Don't use incorrect @ts-expect-error positioning** - must be on line immediately before error

### Test Coverage

Current coverage (Phases 0-5 complete):
- ✅ Table inference: InferSelectModel, InferInsertModel (28 assertions)
- ✅ Column builders: All types with GetColumnData (included in tables)
- ✅ Query results: WHERE, ORDER BY, LIMIT/OFFSET, columns (38 assertions)
- ✅ Filter operators: eq, gt, lt, inArray, isNull, isNotNull
- ✅ M5 features: String operators, extended orderBy (9 assertions)
- ✅ M6 features: Method chaining, defaults (included in tables)
- ✅ Negative tests: 20+ @ts-expect-error tests
- ✅ Edge cases: Empty results, null handling, GenericId preservation (5 assertions)
- ⏸️ Relation loading: Deferred to Phase 4
- ⏸️ Column exclusion: Deferred to M5+

**Progress**: 126 assertions / 144 target = **88% toward 65% Drizzle parity**

### Core Principles

1. **Mirror Drizzle** - Copy all applicable test patterns from drizzle-orm
2. **Use Equal<>/Expect<>** - Industry standard pattern (Drizzle, Zod, TanStack Query, tRPC, MUI)
3. **Test public API only** - Don't test internal implementation details
4. **Negative tests** - Use @ts-expect-error to prevent common mistakes
5. **Shared types** - Extract repeated types to fixtures/
6. **Plain tsc** - Zero dependencies, run with `bun typecheck`

### How to Calculate Progress & Parity

**Step 1: Baseline Count**
- Clone Drizzle ORM: `git clone https://github.com/drizzle-team/drizzle-orm.git /tmp/cc-repos/drizzle-orm`
- Count their PostgreSQL type assertions: `grep -r "Expect<Equal<" /tmp/cc-repos/drizzle-orm/type-tests/pg/ | wc -l`
- Result: ~220 assertions for PostgreSQL

**Step 2: Set Target Parity**
- Not all Drizzle tests apply (SQL-specific: views, CTEs, joins, subqueries)
- Choose realistic target: **65% parity** = 144 assertions
- This covers all applicable features for a Convex ORM

**Step 3: Count Current Assertions**
```bash
# Count all Expect<Equal<> assertions in test files
grep -r "Expect<Equal<" convex/test-types/*.ts | wc -l

# Result: 126 assertions (60 baseline + 66 new from Phases 0-5)
```

**Step 4: Calculate Progress**
```
Progress = (Current / Target) × 100
         = (126 / 144) × 100
         = 87.5% ≈ 88%
```

### How to Mirror Drizzle for New Milestones

**Phase 1: Research** (2-3 hours)
1. **Explore Drizzle's type tests**: Browse `/tmp/cc-repos/drizzle-orm/type-tests/pg/`
2. **Identify relevant files**: Focus on files matching your milestone (e.g., `insert.ts` for M7 Mutations)
3. **Count test patterns**: `grep -c "Expect<Equal<" [filename]` to understand scope
4. **Read test structure**: Study how Drizzle organizes tests (sections, comments, patterns)

**Phase 2: Gap Analysis** (1-2 hours)
1. **List Drizzle's tests**: Extract all test descriptions/comments
2. **Filter applicable tests**: Remove SQL-specific features
3. **Check existing coverage**: `grep -r "[test pattern]" convex/test-types/`
4. **Identify gaps**: Create list of missing tests

**Phase 3: Implementation** (4-8 hours per milestone)
1. **Create/expand test file**: Follow naming convention (e.g., `insert.ts`, `mutations.ts`)
2. **Copy test structure**: Use Drizzle's section separators and organization
3. **Adapt for Convex**: Replace SQL concepts with Convex equivalents:
   - `db.insert()` → `db.insert()`
   - `RETURNING` → return value
   - `GenericId` instead of numeric IDs
4. **Add institutional learnings**: Include tests preventing known regressions
5. **Validate incrementally**: Run `bun typecheck` after each section

**Phase 4: Validation** (30 min)
1. Count assertions: `grep -c "Expect<Equal<" [new file]`
2. Update progress calculation
3. Run `bun typecheck` and `bun run test`
4. Update README with new coverage

### Example: Adding M7 Mutations Tests

```bash
# 1. Research Drizzle's insert patterns
cd /tmp/cc-repos/drizzle-orm
cat type-tests/pg/insert.ts | grep "// Test" | head -20

# 2. Count scope
grep -c "Expect<Equal<" type-tests/pg/insert.ts
# Output: 45 assertions

# 3. Filter applicable (remove RETURNING, ON CONFLICT, etc.)
# Estimated applicable: ~30 assertions (67%)

# 4. Create test file
cat > convex/test-types/insert.ts << 'EOF'
import { convexTable, text, integer, InferInsertModel } from 'better-convex/orm';
import { Expect, Equal } from './utils';

// ============================================================================
// INSERT TYPE INFERENCE TESTS
// ============================================================================

// Test 1: Basic insert type
{
  const users = convexTable('users', {
    name: text().notNull(),
    age: integer(),
  });

  type InsertUser = InferInsertModel<typeof users>;

  Expect<Equal<InsertUser, {
    name: string;
    age: number | null;
  }>>;
}
EOF

# 5. Validate
bun typecheck

# 6. Update README progress
# Old: 126/144 = 88%
# New: 156/174 = 90% (if target increases to 70% of Drizzle's ~250 total)
```

### Maintaining Parity Over Time

**When Drizzle adds new tests**:
1. Watch Drizzle releases: https://github.com/drizzle-team/drizzle-orm/releases
2. Check `type-tests/` changes: `git diff v0.x.0..v0.y.0 type-tests/`
3. Evaluate applicability to Convex
4. Add corresponding tests if applicable

**When Better Convex adds features**:
1. Check if Drizzle has equivalent feature
2. Copy test patterns if they exist
3. Create custom tests if Convex-specific
4. Update target count if needed

**Annual audit**:
- Re-count Drizzle's total assertions (may grow)
- Adjust target parity % if needed
- Identify new test patterns worth adopting

---

## Implementation Workflow

This is the proven workflow used to achieve 88% progress toward 65% Drizzle parity. Use this for future milestones.

### Phase 0: Pre-Implementation Cleanup (CRITICAL)
**Time**: 1-3 hours | **Blocking**: Must complete before Phase 1

**Goal**: Clean baseline prevents tech debt at scale

**Tasks**:
1. **Extract shared types** to `fixtures/types.ts`:
   - Identify repeated type definitions (10+ lines repeated 5+ times)
   - Create shared types (UserRow, PostRow, etc.)
   - Replace all repetitions with imports
   - **Impact**: Removed 100+ lines of duplication

2. **Move debug files** to `debug/` subdirectory:
   - Separate investigation artifacts from production tests
   - Use `git mv` to preserve history
   - Fix import paths (`./utils` → `../utils`)

3. **Fix @ts-expect-error directives**:
   - Check for unused directives: `bun typecheck 2>&1 | grep "Unused '@ts-expect-error'"`
   - Fix positioning (must be on line immediately before error)
   - Remove if code actually type-checks

4. **Standardize section separators**:
   ```typescript
   // ============================================================================
   // SECTION NAME
   // ============================================================================
   ```

5. **Create/update README.md** with patterns and anti-patterns

**Validation**: `bun typecheck` passes, git commits clean

---

### Phase 1: Core Type Inference Tests
**Time**: 3-4 hours | **Priority**: P0

**Goal**: Table and model type inference with institutional learnings

**File**: Create `tables.ts` (or milestone-specific file)

**Test Coverage**:
- InferSelectModel (6+ tests)
- InferInsertModel (5+ tests)
- Column builders (6+ tests)
- Negative tests (3+ tests)
- Institutional learnings (4+ tests from past regressions)

**Key Pattern**:
```typescript
// Test: InferSelectModel with system fields
{
  const users = convexTable('users', {
    name: text().notNull(),
  });

  type Result = InferSelectModel<typeof users>;

  Expect<Equal<Result, {
    _id: GenericId<'users'>;
    _creationTime: number;
    name: string;
  }>>;
}
```

**Validation**: `bun typecheck` passes after each section

---

### Phase 2: Query/Operation Result Types
**Time**: 3-4 hours | **Priority**: P0

**Goal**: Comprehensive result type tests for all operations

**File**: Expand `select.ts` (or create `insert.ts`, `update.ts`, etc.)

**Test Coverage**:
- Basic operations (findMany, findFirst, etc.) (6+ tests)
- Result type variations (with/without selections) (4+ tests)
- Complex combinations (where + orderBy + limit) (4+ tests)
- Negative tests (4+ tests)

**Key Pattern**:
```typescript
// Test: findFirst returns T | undefined
{
  const result = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.name, 'Alice'),
  });

  type Expected = UserRow | undefined;
  Expect<Equal<typeof result, Expected>>;
}
```

---

### Phase 3: Milestone-Specific Features
**Time**: 2-3 hours | **Priority**: P0

**Goal**: Test new features introduced in current milestone

**Examples**:
- M5: orderBy variations, string operators
- M6: Column builder method chaining
- M7: Insert operations, defaults

**Test Coverage**:
- Feature variations (3+ tests per feature)
- Edge cases (2+ tests)
- Negative tests (2+ tests)

---

### Phase 4: Comprehensive Negative Tests
**Time**: 2-3 hours | **Priority**: P0

**Goal**: Prevent common mistakes with type errors

**Test Coverage**:
- Invalid column access (4+ tests)
- Type mismatches (4+ tests)
- Invalid operations (4+ tests)
- Invalid config options (3+ tests)

**Key Pattern**:
```typescript
// Invalid column in where clause
db.query.users.findMany({
  // @ts-expect-error - Property 'invalidField' does not exist
  where: (users, { eq }) => eq(users.invalidField, 'test'),
});
```

**Critical**: @ts-expect-error must be on line immediately before error

---

### Phase 5: Edge Cases & Documentation
**Time**: 1-2 hours | **Priority**: P1

**Goal**: Test boundary conditions and document methodology

**Test Coverage**:
- Empty results (Array<T> not undefined)
- Null handling in complex scenarios
- System field behavior
- GenericId preservation across tables
- Deeply nested configurations

**Documentation**:
- Update README with new coverage
- Document deferred tests with TODO markers
- Update progress calculation

---

### Validation Checklist (After Each Phase)

```bash
# 1. Typecheck passes
bun typecheck

# 2. All tests pass
bun run test

# 3. Lint passes
bun lint:fix

# 4. Count assertions
grep -r "Expect<Equal<" convex/test-types/*.ts | wc -l

# 5. Calculate progress
# Progress = (current / target) × 100
# Example: 126 / 144 = 87.5% ≈ 88%

# 6. Commit
git add convex/test-types/
git commit -m "feat(types): add [milestone] type tests (Phase X)"
```

---

## References

- [Drizzle ORM Type Tests](https://github.com/drizzle-team/drizzle-orm/tree/main/drizzle-orm/type-tests/pg)
- [Convex GenericId Documentation](https://docs.convex.dev/database/document-ids)
- [TypeScript Branded Types](https://egghead.io/blog/using-branded-types-in-typescript)
- [TypeScript Conditional Types](https://www.typescriptlang.org/docs/handbook/2/conditional-types.html)
