---
date: 2026-02-05
topic: query-api-index-strategy
status: proposed
---

# Query API Index Strategy

## What We're Building

Define the long-term query API direction before first release so index usage is both explicit and ergonomic.

The product goal is:
- Keep one clear default query style for most users.
- Preserve Convex-grade index and pagination performance controls.
- Avoid accidental full-scan behavior and unclear index intent.

The proposed shape is an object-first ORM surface (`findMany`, `findFirst`) with explicit index configuration (`index: { name, range? }`) for advanced filtering, plus `db.stream()` as the advanced composition layer for unions/joins/distinct/flatMap/filterWith workflows.

## Why This Approach

### Approach A (Recommended): Drizzle-first object API + explicit index block

Use `findMany` as the canonical path. Keep index selection and range in config, and keep streams as the advanced escape hatch.

Pros:
- One primary mental model.
- Aligned with Drizzle-first positioning.
- Lower API surface and lower maintenance risk.
- Explicit performance intent without exposing all low-level primitives everywhere.

Cons:
- Power users may miss chainable `.withIndex()` fluency in base ORM calls.

Best when:
- You want a strong default API before release and predictable onboarding.

### Approach B: Universal chainable `.withIndex()` parity across ORM

Expose Convex-style chainable index APIs broadly on ORM query builders.

Pros:
- Maximum parity with native Convex query ergonomics.
- Natural for users coming from raw Convex.

Cons:
- Two competing “main” query styles.
- Higher type and docs complexity.
- More room for behavior drift and confusion.

Best when:
- Convex-native ergonomics are prioritized over Drizzle-style consistency.

### Approach C: Dual-tier API (simple + advanced non-stream builder)

Keep `findMany` simple and add a dedicated advanced builder that is not `stream`.

Pros:
- Strong separation between common and power workflows.

Cons:
- Adds another public abstraction to design, teach, and maintain.

Best when:
- You can invest in an additional long-lived API tier.

## Key Decisions

- Canonical query surface is `findMany` / `findFirst` (object-first).
- Predicate `where(fn)` requires explicit index configuration.
- `allowFullScan` is not part of predicate `where(fn)` path.
- Pagination should support bounded reads via `maximumRowsRead`.
- `db.stream()` remains the advanced composition path.
- No universal chainable `.withIndex()` as primary ORM API before v1 release.

## Success Criteria

- Developers can quickly answer “where did `withIndex` go?” by seeing explicit `index` config in ORM calls.
- Common queries stay concise and consistent.
- Advanced queries still have a first-class path (`stream`) without forcing all users into that model.
- Performance-sensitive pagination defaults to explicit, bounded behavior.

## Open Questions

- Do we want eventual strict index-order typing for `index.range` equivalent to native Convex `IndexRangeBuilder` sequencing?
- Should we later add a non-stream advanced builder, or keep all advanced composition inside `stream` only?

## Next Steps

Move to `/workflows:plan` to convert this into a concrete implementation plan and migration scope.
