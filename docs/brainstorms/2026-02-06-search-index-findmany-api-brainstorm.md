---
date: 2026-02-06
topic: search-index-findmany-api
status: proposed
---

# Search Index Support In ORM Query API

## What We're Building

Add first-class, strongly-typed search query support to ORM `findMany` / `findFirst` so users can run Convex search-index queries without dropping down to raw `ctx.db.query(...).withSearchIndex(...)`.

Primary API direction:

- `findMany({ search: { index, query, filters? }, ... })`

This must be compile-time safe:

- `search` is only available on tables that define at least one `searchIndex`.
- `search.index` is typed as the table’s search-index names.
- `filters` is typed to the selected index’s `filterFields`.

This addresses the current gap where schema-level `searchIndex(...)` exists but ORM query docs still say search is not wrapped.

## Why This Approach

### Approach A (Chosen): `findMany({ search: ... })` with Convex-parity constraints

Keep search in the existing object config and enforce Convex semantics.

Pros:
- One primary query API (`findMany`/`findFirst`) with no extra builder to learn.
- Strongest type UX for index names and filter fields.
- Clear migration path from current ORM calls.
- Keeps performance model predictable and close to Convex behavior.

Cons:
- Some combinations stay disallowed to preserve correctness.

Best when:
- You want high confidence pre-release API behavior and strong typings.

### Approach B: Dedicated chain (`db.query.posts.search(...).findMany(...)`)

Pros:
- Search-specific fluent API can feel explicit.

Cons:
- Adds a second top-level query style and more surface to maintain.

### Approach C: Keep search outside ORM query layer

Pros:
- Minimal ORM changes.

Cons:
- Leaves a known product gap and split mental model.

## Key Decisions

- Chosen API: `findMany({ search: { index, query, filters? } })`.
- Do **not** reuse top-level `index` for search; keep search-specific config separate.
- Search is compile-time gated: available only when table has at least one `searchIndex`.
- `search.index` is typed; `search.filters` is typed from that index’s `filterFields`.
- `search + with` is allowed for eager loading only (decorate selected parent rows).
- `search + orderBy` is disallowed (Convex relevance ordering parity).
- `search + where(fn)` is disallowed.
- Relation-based filtering that changes parent set in search mode is disallowed.
- Testing strategy for implementation should be TDD with type tests first.

## Success Criteria

- Developers can execute search through ORM without raw Convex query escapes.
- Invalid search index names or filter fields fail at compile time.
- Search mode behavior is deterministic and consistent with Convex constraints.
- Relation eager-loading works on search results without breaking cursor semantics.

## Open Questions

- Should v2 allow limited object `where` merging into `search.filters` when it is exact equality on filter fields?
- Should v2 introduce an explicit opt-in post-filter mode for advanced mixed behavior with documented pagination caveats?

## Next Steps

Move to `/workflows:plan` to define exact API types, runtime validation behavior, docs/test migration scope, and compatibility notes.
