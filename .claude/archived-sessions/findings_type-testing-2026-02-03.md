# Research Findings: Query Type Testing Audit

**Date**: 2026-02-02
**Task**: Pre-M7 Type Testing Audit

## Executive Summary

Context from brainstorm documents:
- M1-M6 completed (Schema, Relations, Queries, Filtering, Ordering, Column Builders)
- M4.5 completed type testing audit but deferred 9 tests for unimplemented features
- Current status: 147 tests passed, 1 skipped
- Next milestone: M7 (Mutations)
- User wants comprehensive type test coverage before mutations

## Brainstorm Analysis

### Completed Milestones

From [docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md](docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md):

**M1: Schema Foundation** ✅
- convexTable() with Convex validators
- Type inference (InferSelectModel, InferInsertModel)
- Symbol-based metadata

**M2: Relations Layer** ✅
- relations() function
- one() and many() helpers
- Edge metadata generation

**M3: Query Builder - Read Operations** ✅ (partial)
- findMany() and findFirst()
- Type inference for query results
- **Deferred**: Relation loading with `with` option (runtime stubbed)

**M4: Where Filtering** ✅
- Core operators: eq, ne, gt, gte, lt, lte
- Logical operators: and, or, not
- Array/null operators: inArray, notInArray, isNull, isNotNull

**M4.5: Type Testing Audit** ✅ (with deferrals)
- Tests for implemented features only (M1, M2, M4, partial M3)
- 9 tests deferred for unimplemented features
- 147 tests passed, 1 skipped

**M5: Ordering & Advanced Queries** ✅
- orderBy with asc/desc
- String operators: like, ilike, startsWith, endsWith, contains

**M6: Column Builders** ✅
- Drizzle-style builders: text(), integer(), boolean(), id()
- Replaces v.* validators in examples

### Deferred Features (from M4.5)

Per brainstorm lines 1457-1473:

**Relation Loading** (deferred to Phase 4):
- 7 relation loading tests in db-rel.ts
- Type inference works, runtime stubbed
- Tests marked as TODO

**Column Exclusion** (deferred to M5):
- 2 column selection tests in select.ts
- Only `include === true` implemented
- Exclusion (`columns: { age: false }`) not implemented

**Type Widening** (deferred to M4.5+):
- 1 test in debug-typeof-widening.ts
- GenericId widening to string

**Negative Tests** (deferred):
- 6 negative tests for unimplemented constraints
- Relation validation, findFirst limits

### M4.5 Testing Methodology

Per brainstorm lines 550-662, the methodology was:

**Step 1**: Clone and study Drizzle-ORM
**Step 2**: Map Drizzle test structure to Better-Convex
**Step 3**: Create comprehensive test coverage in 4 categories:
- A. Type Inference Tests (Equal assertions)
- B. Runtime Behavior Tests (vitest + convex-test)
- C. Negative Type Tests (@ts-expect-error)
- D. Edge Case Coverage

**Step 4**: Fix gaps and ensure Drizzle parity
**Step 5**: Validation checklist

## Existing Type Tests

From [convex/test-types/](convex/test-types/) (based on previous session):

**Files**:
- ORIGINAL-ISSUE-never-type.ts
- VERIFY-merge-fix-works.ts
- db-rel.ts (7 deferred tests)
- debug-const-assertion.ts
- debug-typeof-columns.ts
- debug-typeof-widening.ts (1 deferred test)
- filter-operators.ts
- get-column-data.ts
- minimal-builderToType-test.ts
- minimal-inferModel-test.ts
- minimal-notNull-test.ts
- select.ts (2 deferred tests)
- tables-rel.ts
- utils.ts

**Status**: Need to inspect each file to understand current coverage

## Next Steps

1. Clone drizzle-orm repo using dig skill
2. Study Drizzle's PostgreSQL type test files
3. Inspect existing Better-Convex type tests
4. Create gap analysis comparing the two
5. Build comprehensive test plan

## Questions to Answer

- Which Drizzle test files are most relevant for Better-Convex?
- What patterns should we copy exactly vs adapt?
- How to organize tests (by feature vs milestone)?
- What's the right test count target?

## Drizzle ORM Type Testing Analysis

**Source**: Explore agent analysis of `/tmp/cc-repos/drizzle-orm`

### Test File Structure

**Location**: `drizzle-orm/type-tests/pg/` (17 test files)

**Key Files**:
1. `tables.ts` (39KB) - Table definitions, InferSelectModel, InferInsertModel
2. `select.ts` (30KB) - SELECT queries, joins, nullability propagation
3. `insert.ts` (6.7KB) - INSERT operations, RETURNING clauses
4. `update.ts` (6.5KB) - UPDATE operations
5. `delete.ts` (2.6KB) - DELETE operations
6. `db-rel.ts` (2.3KB) - Relational queries
7. `tables-rel.ts` (3.1KB) - Relational table definitions
8. Plus: `with.ts`, `subquery.ts`, `count.ts`, `array.ts`, `generated-columns.ts`, etc.

### Testing Patterns

**Core Type Utilities** (`utils.ts`):
```typescript
// Type equality check (distributive conditional)
export type Equal<X, Y extends X> =
  (<T>() => T extends X ? 1 : 2) extends
  (<T>() => T extends Y ? 1 : 2) ? true : false;

// Assertion function
export function Expect<T extends true>() {}
```

**Usage**:
```typescript
Expect<Equal<InferSelectModel<typeof users>, typeof users['$inferSelect']>>;
```

### Test Coverage

**What Drizzle Tests**:
- InferSelectModel / InferInsertModel
- `$inferSelect` and `_['inferSelect']` property access
- Query result types (SELECT, INSERT with RETURNING, UPDATE, DELETE)
- Join types (LEFT, RIGHT, INNER, FULL) with nullability propagation
- Partial projections `.returning({id, name})`
- Prepared statements
- Subqueries and CTEs
- Generated columns
- Array types, enum types
- Nullability rules through joins

**Negative Tests** (@ts-expect-error):
- Double method calls (`.where().where()`)
- Generated column restrictions in UPDATE
- Invalid column access
- Type mismatches in operators

### Key Patterns to Copy

1. **Equal<> utility for type assertions**
2. **Test both InferSelectModel AND `$inferSelect` property**
3. **Test query result types, not just table types**
4. **Test nullability propagation (joins, optional fields)**
5. **Negative tests with @ts-expect-error**
6. **Separate files per feature** (tables, select, insert, etc.)
7. **Run with `tsc --noEmit` in CI**

### Recommendations for Better-Convex

**Copy**:
- Equal<> and Expect<> utilities
- File structure (tables.ts, select.ts, etc.)
- Test both inference utilities AND branded properties
- Nullability testing patterns
- Negative test patterns

**Adapt**:
- No JOIN types (Convex uses edge traversal)
- No column selection (Convex returns full documents)
- Test edge loading instead of SQL joins
- Test Convex-specific features (GenericId, system fields)

**Skip**:
- SQL-specific features (views, CTEs, subqueries, UNION)
- Database drivers and connection testing
- Prepared statements (Convex auto-optimizes)

## Better-Convex Existing Type Tests Analysis

**Current Coverage** (14 test files):

### Test Utilities
**utils.ts** (9 lines):
- ✅ Equal<X, Y> type (same as Drizzle)
- ✅ Expect<T extends true>() function

### Table & Schema Tests
1. **minimal-inferModel-test.ts** (56 lines):
   - InferModelFromColumns with actual columns
   - Test with convexTable
   - System fields (_id, _creationTime)
   - Nullable vs notNull fields
   - GenericId brand preservation

2. **tables-rel.ts** (schema fixtures):
   - Table definitions with relations
   - Used by other tests
   - Not type assertions itself

3. **minimal-notNull-test.ts**:
   - NotNull brand preservation
   - Nullable field handling

4. **minimal-builderToType-test.ts**:
   - Column builder type extraction
   - Mode-based types ('query' vs 'raw')

5. **get-column-data.ts** (142 lines):
   - GetColumnData in 'raw' mode (15 tests)
   - All column types: text, integer, boolean, bigint, id
   - Nullable vs notNull
   - Array types for inArray operator

### Query Tests
6. **select.ts** (372 lines) - **MOST COMPREHENSIVE**:
   - ✅ WHERE clause tests (9 tests)
   - ✅ ORDER BY tests (2 tests)
   - ✅ LIMIT/OFFSET tests (3 tests)
   - ✅ Column selection (1 test)
   - ✅ Combined queries (1 test)
   - ✅ **Negative tests** (11 @ts-expect-error directives)
   - ⏸️ Column exclusion (deferred - 1 test commented)
   - ⏸️ Nested relations with where (deferred - 1 test commented)

7. **filter-operators.ts**:
   - FilterOperators interface validation
   - References GetColumnData tests

8. **db-rel.ts** (relation loading):
   - ⏸️ ALL tests deferred to Phase 4
   - Type inference works, runtime stubbed
   - 7+ relation loading tests commented out

### Debug/Investigation Tests
9. **debug-const-assertion.ts**
10. **debug-typeof-columns.ts**
11. **debug-typeof-widening.ts**
12. **ORIGINAL-ISSUE-never-type.ts**
13. **VERIFY-merge-fix-works.ts**

## Gap Analysis: Drizzle vs Better-Convex

### What We Have ✅
1. **Core type utilities**: Equal<>, Expect<> (same as Drizzle)
2. **Table inference**: InferSelectModel, InferInsertModel
3. **Column builders**: All types tested with GetColumnData
4. **Query result types**: SELECT with where, orderBy, limit
5. **Negative tests**: 11 @ts-expect-error tests in select.ts
6. **Nullability**: Nullable vs notNull field handling

### Critical Gaps 🔴

#### 1. Missing Test Organization
**Drizzle**: Separate files per feature (tables.ts, select.ts, insert.ts, update.ts, delete.ts)
**Better-Convex**: Mixed organization, debug files, no clear structure

**Recommendation**: Reorganize into:
- `tables.ts` - Table inference tests
- `queries.ts` - Query result tests (rename select.ts)
- `mutations.ts` - Insert/update/delete (for M7)
- `relations.ts` - Relation loading (Phase 4)
- `utils.ts` - Keep as is

#### 2. Insufficient InferSelectModel / InferInsertModel Coverage
**Drizzle**: Tests both `InferSelectModel<typeof table>` AND `table.$inferSelect`
**Better-Convex**: Only tests InferModelFromColumns utility

**Missing Tests**:
- InferSelectModel vs `$inferSelect` property equivalence
- InferInsertModel vs `$inferInsert` property equivalence
- Insert vs Select type differences (no _id in insert, _id in select)

#### 3. No Comprehensive Table Definition Tests
**Drizzle**: `tables.ts` (39KB) tests all table features
**Better-Convex**: Only minimal-inferModel-test.ts

**Missing Tests**:
- All column builder types (text, integer, boolean, bigint, id, number)
- System fields always present
- Optional vs required fields
- Default values
- Column constraints

#### 4. Missing Query Result Type Tests
**Drizzle**: Tests every query variation's result type
**Better-Convex**: Has basic tests but missing:
- findFirst() result type (T | undefined)
- Multiple orderBy fields
- Complex where clause combinations
- Empty result handling

#### 5. Insufficient Negative Tests
**Drizzle**: Extensive @ts-expect-error coverage for:
- Double method calls
- Generated column restrictions
- Invalid column operations

**Better-Convex**: 11 negative tests in select.ts

**Missing Negative Tests**:
- Invalid table access
- Invalid column in columns option
- Type mismatch in all operators (only have eq, gt, inArray)
- Invalid orderBy field
- Limit/offset with wrong types
- findFirst with array result (should be single item)
- Invalid relation names in with option

#### 6. No Tests for M5 Features
**M5**: orderBy, string operators (like, ilike, startsWith, etc.)
**Current**: Only 2 basic orderBy tests (asc, desc)

**Missing Tests**:
- Multi-field orderBy
- String operator type safety
- orderBy with nullable fields

#### 7. No Tests for M6 Column Builders
**M6**: Drizzle-style builders (text(), integer(), etc.)
**Current**: Tests use builders but don't validate:
- Builder method chaining (.notNull(), .default())
- Default value type inference
- Builder vs validator equivalence

### Medium Priority Gaps 🟡

#### 1. Edge Case Coverage
**Drizzle**: Explicit edge case tests
**Better-Convex**: Scattered in debug files

**Missing**:
- Circular relation detection
- Deeply nested relations
- Union types in relations
- Empty result arrays
- Null handling in complex queries

#### 2. Runtime Behavior Tests
**Drizzle**: Separate from type tests (integration-tests/)
**Better-Convex**: Mixed (convex/*.test.ts with vitest)

**Status**: We have runtime tests (147 passing), but no clear separation

### Low Priority Gaps 🟢

#### 1. Alternative Testing Patterns
**Drizzle**: Also uses vitest expectTypeOf in integration tests
**Better-Convex**: Only uses Expect<Equal<>>

**Recommendation**: Keep current approach, optionally add expectTypeOf later

#### 2. strictNullChecks Variations
**Drizzle**: Tests with strictNullChecks: false
**Better-Convex**: Only strict mode

**Recommendation**: Low priority, strict mode is best practice

## Priority Ranking for Missing Tests

### P0 - Critical (Before M7)
1. Table inference tests (InferSelectModel, InferInsertModel, `$inferSelect`, `$inferInsert`)
2. Column builder tests (all types, notNull, default values)
3. Query result type tests (findMany, findFirst)
4. Negative tests (invalid columns, type mismatches, invalid operations)
5. M5 feature tests (orderBy variations, string operators)
6. M6 feature tests (builder method chaining)

### P1 - High (Before Phase 4)
1. Relation type inference (deferred tests in db-rel.ts)
2. Edge case coverage (null handling, empty results)
3. Complex query combinations

### P2 - Medium (Future)
1. Test file reorganization
2. Integration test patterns
3. Documentation of test methodology

## Estimated Test Count

**Current**: ~14 test files, ~50-60 type assertions
**Drizzle PG**: 17 files, 200+ type assertions

**Target for M7 Readiness**:
- Add ~40-50 new type assertions
- Focus on P0 categories
- Total: ~100-110 type assertions (50% of Drizzle parity)

## Deep Dive: Type Testing Tools & Patterns (2026-02-02)

**Full Research:** [docs/research/type-testing-research.md](docs/research/type-testing-research.md)

### Key Findings

1. **Drizzle uses plain `tsc` for type tests** - Not vitest expectTypeOf
2. **Custom utilities are the gold standard** - `Expect<Equal<...>>` pattern used by Zod, TanStack Query, zustand, tRPC, MUI
3. **Pattern: Write actual code → Assert inferred type** - Tests BOTH compilation AND inference
4. **Custom error types improve DX** - `DrizzleTypeError<"message">` for friendly errors
5. **Comprehensive coverage is key** - 4,891 lines across Drizzle's pg tests alone

### Patterns to Copy

1. ✅ **Custom Expect/Equal utility** (zero deps, proven pattern)
2. ✅ **Actual code + type assertion** (tests compilation + inference)
3. ✅ **@ts-expect-error for negative tests** (standard TypeScript feature)
4. ✅ **Custom type errors** (better error messages, testable)
5. ✅ **Comprehensive coverage by operation** (separate files per feature)
6. ✅ **Edge case testing** (no-strict-null-checks, etc.)

### Patterns to Adapt

1. 🔄 **Test file naming** - Use `type-tests/*.ts` for clarity
2. 🔄 **Dynamic query testing** - Test builder patterns maintain types
3. 🔄 **Generated column testing** - Test computed fields excluded from insert

### Patterns to Avoid

1. ❌ **Extremely long test files** - Split by feature (Drizzle's select.ts is 1,458 lines!)
2. ❌ **Testing internal types** - Test public API only
3. ❌ **Mixing type/runtime tests** - Separate directories

### Missing Approaches in Our Plan

1. 🆕 **Type narrowing tests** - Test that type guards work
2. 🆕 **Discriminated union handling** - If we have error types
3. 🆕 **Recursive type testing** - For deeply nested edge loading
4. 🆕 **Generic constraint testing** - Test builder constraints propagate
5. 🆕 **ThisType and method chaining** - Critical for builder pattern!
6. 🆕 **Utility type compatibility** - Test with Partial, Pick, etc.

### Tooling Comparison

| Tool | Pros | Cons | Drizzle Uses? |
|------|------|------|---------------|
| **Plain tsc** | Zero deps, fast, proven | Manual utilities | ✅ Yes |
| **vitest expectTypeOf** | Rich API, integrated | Requires Vitest | ❌ No |
| **tsd** | Dedicated tool | Another dep | ❌ No |
| **conditional-type-checks** | Reusable utilities | Limited adoption | ❌ No |

**Recommendation:** Start with plain `tsc` (Drizzle approach), add vitest later if needed.

### Implementation Phases

**Phase 1: Infrastructure (Immediate)**
1. Create `type-tests/` directory
2. Add `utils.ts` with Expect, Equal, ConvexTypeError
3. Add `tsconfig.json` for type tests
4. Add script: `"test:types": "tsc --project type-tests"`

**Phase 2: Core Tests (M5)**
5. Basic query tests
6. Nullable convention tests
7. Filtering tests
8. Mutation tests
9. Relation tests
10. Negative tests for each

**Phase 3: CI Integration (M5)**
11. Add to GitHub Actions
12. Add pre-commit hook
13. Configure Turborepo

**Phase 4: Extended Coverage (M6)**
14. Advanced query tests
15. Index-based query tests
16. Custom error tests
17. Edge case tests

### Resources

**TypeScript Type Testing:**
- [Vitest Testing Types Guide](https://vitest.dev/guide/testing-types)
- [Frontend Masters: Testing Types in TypeScript](https://frontendmasters.com/blog/testing-types-in-typescript/)
- [Total TypeScript: @ts-expect-error](https://www.totaltypescript.com/concepts/how-to-use-ts-expect-error)
- [TypeScript Conditional Types](https://www.typescriptlang.org/docs/handbook/2/conditional-types.html)

**Type Testing Libraries:**
- [tsd - Check TypeScript type definitions](https://github.com/tsdjs/tsd)
- [tsd-lite - Test TypeScript types easily](https://github.com/mrazauskas/tsd-lite)
- [conditional-type-checks](https://github.com/dsherret/conditional-type-checks)

**Advanced Patterns:**
- [Mastering TypeScript Generics](https://leapcell.io/blog/mastering-typescript-generics-conditions-mappings-and-inference)
- [Guide to Conditional Types](https://blog.logrocket.com/guide-conditional-types-typescript/)
- [Understanding infer in TypeScript](https://blog.logrocket.com/understanding-infer-typescript/)

---

## References

- Drizzle ORM: https://github.com/drizzle-team/drizzle-orm
- Convex Ents: https://github.com/get-convex/convex-ents
- Convex Backend: https://github.com/get-convex/convex-backend
- Explore Agent: ad1a587 (can resume for more details)
- **Full Type Testing Research:** [docs/research/type-testing-research.md](docs/research/type-testing-research.md)
