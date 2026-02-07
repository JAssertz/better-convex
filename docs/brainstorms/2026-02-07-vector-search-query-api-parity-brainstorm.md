---
date: 2026-02-07
topic: vector-search-query-api-parity
status: proposed
---

# Vector Search Query API Parity

## What We're Building

Add first-class vector search support to ORM queries through `findMany({ vectorSearch: ... })`, so users can query vector indexes without dropping down to raw `ctx.vectorSearch(...)`.

Proposed API:

```ts
const rows = await db.query.posts.findMany({
  vectorSearch: {
    index: 'embedding_vec',
    vector: args.embedding,
    limit: 10,
    filter: (q) => q.eq('type', 'news'),
  },
  with: { author: true },
});
```

This closes the largest Convex parity gap on the ORM read path: schema-level `vectorIndex(...)` exists today, but query-time vector search does not.

## Why This Approach

### Approach A (Recommended): `findMany({ vectorSearch: ... })` mode

Add vector search as a first-class `findMany` config mode, parallel to existing `search` mode.

**Pros:**
- Matches user expectation and Convex mental model.
- Reuses existing ORM query surface (`findMany`) instead of adding a new top-level API.
- Keeps `with`, `columns`, and `extras` available on vector results.

**Cons:**
- Adds another exclusive query mode with guardrails.
- Requires additional type plumbing for vector index metadata.

**Best when:**
- Goal is parity + minimal API sprawl before stable release.

### Approach B: Dedicated `vectorSearch()` query method

Introduce a separate method (`db.query.posts.vectorSearch(...)`) outside `findMany`.

**Pros:**
- Very explicit semantics and fewer overloaded option combinations.

**Cons:**
- Fragments query API and increases docs/maintenance overhead.

**Best when:**
- Explicit mode separation is more important than single-surface ergonomics.

### Approach C: Low-level passthrough helper only

Expose `db.vectorSearch(table, index, query)` and keep ORM query builder unchanged.

**Pros:**
- Fastest to ship.

**Cons:**
- Leaves ORM parity gap mostly unresolved (`with`/projection/type flow not unified).

**Best when:**
- Short-term stopgap is acceptable.

## Key Decisions

- Choose **Approach A**.
- Add `vectorSearch` to `findMany` as an exclusive mode.
- In vector mode, disallow `orderBy`, `paginate`, `index`, and predicate `where`.
- Keep `with`, `columns`, and `extras` available.
- Require explicit `limit` in API (bounded by vector search constraints; no implicit default).
- Strongly type `vectorSearch.index` from table vector index names.
- Strongly type `vectorSearch.filter` from selected index `filterFields`.
- Keep v1 return shape as standard rows ordered by similarity; score exposure is deferred.
- Scope this parity change to `findMany` first.

## Open Questions

- Should vector search score (`_score`) be exposed in v1 (always or opt-in)?
- Should object `where` be fully disallowed in vector mode, or allowed only when mergeable into vector filter equality constraints?
- Should `findFirst({ vectorSearch })` be included in the same release or deferred?

## Next Steps

Move to `/workflows:plan` for implementation details, including:
- type updates for vector-search config and vector index inference,
- runtime guardrails and compatibility matrix,
- test/doc updates mirroring existing `search` coverage.
