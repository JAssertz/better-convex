# Task Plan: ORM Performance Review (2026-02-05)

## Goal
Review ORM code for non-scalable performance patterns, document findings, and create todos. No package code changes.

## Current Phase
Complete

## Phases

### Phase 1: Review Target & Setup
- [x] Determine review target (current branch)
- [x] Attempt PR metadata lookup
- [x] Load Convex performance guidance docs
- **Status:** complete

### Phase 2: Scan ORM For Non-Scalable Patterns
- [x] Review relation loading and query execution
- [x] Review update/delete builders and FK cascade utilities
- **Status:** complete

### Phase 3: Synthesis & Todo Creation
- [x] Consolidate findings by severity
- [x] Create todo files in `todos/` (006-009)
- **Status:** complete

### Phase 4: Summary & Reporting
- [x] Deliver review summary and testing offer
- **Status:** complete

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `gh pr view` unknown JSON field `linkedIssues` | 1 | Retried without field |
| `gh pr view` no PR found for branch | 1 | Proceeded with branch review |

---

# Task Plan: Replace Native Convex Schema in Tests

## Goal
Create a comprehensive Drizzle-style SchemaDefinition (with full field/relations coverage) for convex-test codegen and update tests to use it, while keeping schema-independent tests in /test.

## Current Phase
Phase 4

## Phases

### Phase 1: Requirements & Discovery
- [x] Understand current test layout and moved files
- [x] Identify schema-dependent vs schema-independent tests
- [x] Inspect existing schema helpers (example/convex/lib/ents.ts, example/convex/lib/crpc.ts)
- [x] Document findings in findings.md
- **Status:** complete

### Phase 2: Schema Design & API Decisions
- [x] Define full-coverage SchemaDefinition (fields, relations, edges)
- [x] Choose ctx ORM accessor name (ctx.table vs alternative)
- [x] Ensure export default schema for codegen in example/convex/functions/schema.ts
- [x] Document decisions with rationale
- **Status:** complete

### Phase 3: Implementation
- [x] Implement or update schema file(s) for codegen
- [x] Move/update schema-dependent tests under /test/types
- [x] Move schema-independent tests under /test (name appropriately)
- [x] Update test setup utilities to use new schema and ctx accessor
- **Status:** complete

### Phase 4: Testing & Verification
- [x] Run bun convex codegen and confirm success
- [x] Run relevant tests (type-only + runtime as applicable)
- [x] Document test results in progress.md
- [x] Fix any issues found
- **Status:** complete

### Phase 5: Delivery
- [ ] Review all modified files for correctness
- [ ] Summarize changes and remaining follow-ups
- **Status:** pending

## Key Questions
1. Which tests are truly schema-independent and can live in /test?
2. What should the canonical SchemaDefinition cover to hit 100% API coverage?
3. What ctx accessor name best fits current conventions (ctx.table vs alternative)?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| `ctx.table` as ORM accessor | Matches convex-ents and avoids `ctx.db` collision. |
| Shared schema in `convex/schema.ts` | Single source for runtime tests, type tests, and codegen. |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| session-catchup.py missing at ${CLAUDE_PLUGIN_ROOT}/scripts | 1 | Used repo skill path /Users/zbeyens/GitHub/better-convex/.claude/skills/planning-with-files/scripts/session-catchup.py |
| `bun convex codegen` failed: local backend not running | 1 | Needs `convex dev` running (see progress.md) |
| `bun convex dev --once --env-file .env.local` failed: non-interactive login prompt | 1 | Requires authenticated session; not possible in non-interactive run |

## Notes
- Update phase status as you progress: pending → in_progress → complete
- Re-read this plan before major decisions
- Log ALL errors
