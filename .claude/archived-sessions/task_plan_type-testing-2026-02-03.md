# Task Plan: Query Type Testing Audit & Gap Analysis

**Date**: 2026-02-02
**Milestone Context**: Pre-M7 (Mutations) - Complete Query testing before mutations

## Goal

Comprehensive audit of Query-related type testing to identify gaps before implementing M7 (Mutations). Focus on:
- Type inference completeness
- Negative type tests (@ts-expect-error)
- Drizzle parity in testing methodology
- Coverage of already-implemented features (M1-M6)

## Success Criteria

- [ ] Complete inventory of existing type tests for M1-M6
- [ ] Identified gaps compared to Drizzle's testing approach
- [ ] Comprehensive list of missing type tests
- [ ] Plan for implementing missing tests
- [ ] All new tests pass (`bun typecheck`, `vitest run`)
- [ ] No regressions introduced

## Phases

### Phase 1: Research & Discovery ✅ complete

**Status**: complete
**Started**: 2026-02-02
**Completed**: 2026-02-02

**Tasks**:
- [x] Read brainstorm documents (drizzle-orm, typescript-patterns)
- [x] Clone drizzle-orm repo locally using dig skill
- [x] Study Drizzle's PostgreSQL type testing structure
- [x] Analyze existing Better-Convex type tests in convex/test-types/
- [x] Map Drizzle test coverage to Better-Convex features

**Expected Output**:
- ✅ List of Drizzle's type test files and patterns (17 PG test files identified)
- ✅ Map of which Drizzle tests apply to Better-Convex (tables.ts, select.ts most relevant)
- ✅ Inventory of existing Better-Convex type tests (14 files, ~50-60 assertions)
- ✅ Gap analysis document (findings.md updated)

**Notes**:
- Drizzle has 220+ type assertions across 17 PG test files
- Better-Convex has ~60 assertions (27% of Drizzle)
- Target: 100-110 assertions (50% of Drizzle) before M7


### Phase 2: Gap Analysis ✅ complete

**Status**: complete
**Completed**: 2026-02-02

**Tasks**:
- [x] Compare Drizzle test coverage vs Better-Convex
- [x] Identify missing Equal<> assertion tests
- [x] Identify missing @ts-expect-error negative tests
- [x] Categorize gaps by milestone (M1-M6)
- [x] Prioritize tests by impact (critical vs nice-to-have)

**Expected Output**:
- ✅ Comprehensive list of missing tests (see findings.md)
- ✅ Priority ranking (P0: 40-50 tests, P1: 10-15 tests, P2: 5-10 tests)
- ✅ Estimate of test count needed (60 new tests for 50% parity)

**Notes**:
- P0 (Critical): Table inference, query results, M5/M6 features, negatives
- P1 (High): Relation types (deferred), edge cases
- P2 (Medium): File reorganization, documentation


### Phase 3: Test Planning ✅ complete

**Status**: complete
**Completed**: 2026-02-02

**Tasks**:
- [x] Design test file structure
- [x] Plan test organization (group by feature or milestone)
- [x] Define test naming conventions
- [x] Create test templates based on Drizzle patterns
- [x] Document test methodology for future milestones

**Expected Output**:
- ✅ Test file structure plan (tables.ts, queries.ts, operators.ts, etc.)
- ✅ Test templates (Equal<> assertions, @ts-expect-error patterns)
- ✅ Testing methodology documentation (in plan document)
- ✅ Implementation plan with 6 phases

**Notes**:
- Proposed structure mirrors Drizzle (separate files per feature)
- Phases: Tables, Queries, M5/M6, Negatives, Edge Cases, Reorganization
- Estimated time: 10-16 hours total


### Phase 4: Documentation & Handoff ✅ complete

**Status**: complete
**Completed**: 2026-02-02

**Tasks**:
- [x] Update task_plan.md with final findings
- [x] Write comprehensive findings.md with all discoveries
- [x] Create detailed implementation plan in docs/plans/
- [x] Update brainstorm with deferred tests status
- [x] Final validation checklist

**Expected Output**:
- ✅ Complete plan document: [docs/plans/2026-02-02-query-type-testing-audit-plan.md](docs/plans/2026-02-02-query-type-testing-audit-plan.md)
- ✅ Updated brainstorm: Status documented in plan
- ✅ Ready-to-implement test specifications (6 phases with code examples)

**Notes**:
- Plan includes: Gap analysis, implementation phases, code examples, validation checklist
- Total 60 new tests planned (40-50 P0, 10-15 P1, 5-10 P2)
- Deferred features clearly documented (Phase 4 relation loading, M5 column exclusion)


## Current Focus

**Planning Complete**: All phases finished

**Next Action**: Review plan with user and get approval to proceed with implementation

## Errors Encountered

| Error | Phase | Attempt | Resolution |
|-------|-------|---------|------------|
| (none yet) | - | - | - |

## Open Questions

1. Should we mirror Drizzle's test file structure exactly, or adapt for Convex patterns?
2. How to handle Drizzle tests for SQL-specific features (Category 4)?
3. Should we test deferred features (relation loading) now or wait for implementation?
4. What's the right balance between type tests and runtime tests?

## References

- Brainstorm: [docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md](docs/brainstorms/2026-01-31-drizzle-orm-brainstorm.md)
- TypeScript Patterns: [docs/brainstorms/2026-01-31-typescript-patterns-from-drizzle-and-ents.md](docs/brainstorms/2026-01-31-typescript-patterns-from-drizzle-and-ents.md)
- Existing Tests: [convex/test-types/](convex/test-types/)
- M4.5 Completion Status: See brainstorm lines 637-653

## Notes

- M1-M6 completed, M7 (Mutations) next
- M4.5 had 9 deferred tests for unimplemented features
- Current test status: 147 passed, 1 skipped
- User emphasizes: "mirror Drizzle", "dig into drizzle repo", "copy ALL relevant tests"
