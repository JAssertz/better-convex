---
date: 2026-02-07
topic: drizzle-exists-notexists-limitation
---

# Drizzle `exists` / `notExists` Limitation

## What We're Building

We are defining product behavior for Drizzle parity around `exists` / `notExists` in Better-Convex ORM.

Drizzle exposes `exists(query)` and `notExists(query)` as subquery operators. Convex query execution does not provide a SQL-style subquery layer; complex logic (join/aggregation/grouping patterns) is expressed in JavaScript/application logic rather than nested query expressions. Better-Convex’s current filter operators already omit `exists`/`notExists` and previous repo brainstorms flagged this as a platform limitation.

The target outcome is a clear, durable decision: treat `exists` / `notExists` as an intentional limitation in Better-Convex docs, with practical workaround guidance for equivalent business outcomes in Convex style.

## Why This Approach

### Approach A (Recommended): Explicit limitation + workaround recipes

Document `exists` / `notExists` as unsupported because Convex has no subquery primitive. Add focused guidance for alternatives (relation `where`, index-first filters, denormalized flags/counters when needed).

Pros:
- Honest semantics with no hidden behavior drift
- Low implementation risk and zero runtime complexity
- Matches existing repo direction and current operator surface

Cons:
- Leaves a parity gap in the API list

Best when: platform capability is the real constraint and predictability matters more than superficial parity.

### Approach B: Add constrained compatibility helpers

Add pseudo-`exists` helpers only for relation-backed cases (for example, parent rows where child relation matches filter), without claiming general subquery support.

Pros:
- Familiar API for a subset of use cases

Cons:
- Semantic mismatch with Drizzle’s real `exists(query)`
- Edge-case confusion and documentation burden

Best when: parity optics are prioritized and scope can stay tightly constrained.

### Approach C: Defer and track as parity backlog item

Do not expand docs now; keep gap tracked for future reconsideration.

Pros:
- No immediate writing overhead

Cons:
- Repeated user confusion remains unresolved

Best when: release pressure is extreme and docs work must be minimized.

## Key Decisions

- `exists` / `notExists` are treated as a Convex platform limitation, not an implementation bug.
- Better-Convex should not add partial/shim semantics that imply full SQL subquery parity.
- Preferred near-term action is documentation clarity with concrete workaround patterns.

## Open Questions

- Should workaround guidance live only in `limitations.mdx`, or also in `queries.mdx` and API reference operator tables?
- Do we want an explicit “unsupported operator” note in Drizzle parity matrices to reduce repeated requests?
- Should we add a short FAQ entry: “How do I model EXISTS-style checks in Convex?”

## Next Steps

-> `/workflows:plan` for implementation details (docs updates, placement, and acceptance checks).
