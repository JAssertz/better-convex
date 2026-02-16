---
date: 2026-02-07
topic: find-unique-method
---

# findUnique() Method

## What We're Building
Add an optional `findUnique()` query method to Better-Convex ORM for single-row lookups where callers intend uniqueness.
The method should return the same runtime shape as `findFirst()` (`T | undefined`) while rejecting non-unique selectors at type level.
This is a Better-Convex extension, not strict Drizzle parity: as of 2026-02-07, Drizzle RQB docs/source document `findMany()` and `findFirst()` only.

Goal: improve safety and migration ergonomics for teams that distinguish unique lookups, while keeping the core query model simple.

## Why This Approach
We considered three options:

### Approach A: Full unique-selector enforcement across PK + all declared unique constraints
Add `findUnique()` that accepts only selectors matching primary key or any declared unique constraint (including composite).

Pros:
- Strongest type safety
- Best developer intent signaling

Cons:
- Highest type-level complexity
- Greater risk of edge-case typing regressions

Best when:
- Maximum compile-time correctness matters more than initial delivery speed

### Approach B (Recommended): Scoped `findUnique()` for PK + explicitly typed unique indexes first
Ship `findUnique()` with strict compile-time support for `_id` and named unique indexes that are already statically represented, then expand later if needed.

Pros:
- Small scope and predictable typing
- Fastest path to value
- Lower regression risk

Cons:
- Initial coverage may not include every unique declaration form

Best when:
- We want meaningful safety now with minimal risk and clean v1 velocity

### Approach C: No new API; keep `findFirst()` and document unique lookup conventions
Preserve current API and rely on docs/conventions for unique-intent queries.

Pros:
- Strict Drizzle parity
- Zero API surface growth

Cons:
- No type-level uniqueness guarantee
- Weaker intent signaling

Best when:
- API minimalism and parity are higher priority than unique-intent ergonomics

Recommendation: Approach B. It gives immediate value without forcing high-complexity type plumbing before v1 stability.

## Key Decisions
- Treat `findUnique()` as an intentional Better-Convex extension, not a Drizzle parity requirement.
- Keep return type aligned with existing behavior: `T | undefined`.
- Require uniqueness intent to be explicit and type-checked; avoid permissive fallback to generic `where`.
- Start with constrained scope (PK + typed unique indexes) and defer broader unique-source support if needed.
- Keep `findFirst()` unchanged as the generic single-row method.

## Open Questions
- Should `findUnique()` ship in v1 or first v1.x minor?
- Must v1 include composite unique selectors, or can that follow?
- Should `.unique()` and `unique()` declarations be fully reflected in compile-time selector typing in v1?
- Do we need a future `findUniqueOrThrow()` companion, or is that out of scope?

## Next Steps
-> `/workflows:plan` to define exact API shape, type constraints, tests, docs updates, and migration messaging.
