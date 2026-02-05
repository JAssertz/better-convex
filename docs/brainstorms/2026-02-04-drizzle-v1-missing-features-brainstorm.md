---
date: 2026-02-04
topic: drizzle-v1-missing-features
---

# Drizzle v1 Missing Features (Convex-feasible)

## What We're Building

A prioritized list of **Drizzle v1 ORM features** that Better-Convex does **not** support yet, filtered to only items that are realistic in **Convex** (no SQL drivers, migrations, joins, raw SQL, prepared statements, transactions, etc.).

Goal: pick the next “high-leverage” parity gaps to close, so Drizzle examples and mental models transfer cleanly to Better-Convex.

## Why This Approach

Drizzle v1 has a large surface area, but Better-Convex intentionally targets the relational query builder + schema + mutations subset. Within that subset, we should prioritize:

1. **DX parity**: features that appear in Drizzle docs and common usage
2. **Convex feasibility**: can be implemented as runtime logic (post-fetch / mutation-time)
3. **Impact**: reduces boilerplate and prevents data bugs

## Candidate Missing Features (Ranked by DX parity value)

1. **Runtime `extras` (relational queries)**  
   Today `extras` is type-level only. Add runtime evaluation so docs/examples can include computed fields (including nested `extras` under `with`).

2. **Counts / basic aggregations usable from queries**  
   Drizzle’s relational query builder commonly pairs `with` with per-row counts. In Convex, this can be implemented either from already-loaded relations (cheap) or via additional indexed queries (more expensive, but still feasible).

3. **`onConflictDoNothing()` without `target` behaves like Drizzle**  
   Drizzle allows omitting the conflict target. Better-Convex should either (a) implement “any unique constraint” conflict detection at runtime, or (b) throw with a clear message (documented limitation). Current behavior silently does nothing.

4. **`check()` constraints (runtime enforcement)**  
   Drizzle supports `check(...)` constraints. Convex can enforce these at mutation time (and optionally reuse the same expression system as filters).

5. **Dynamic defaults**  
   Drizzle supports “database-side defaults” (ex: `defaultRandom()`, `defaultNow()`). In Convex, we can provide runtime defaults via functions (ex: `default(() => crypto.randomUUID())`, `default(() => Date.now())`) and/or convenience helpers.

6. **More “Drizzle-like” column types that map to Convex**  
   High-signal candidates: `json`/typed object, string enums, `timestamp` conventions. Keep the set small to avoid builder explosion.

7. **Column exclusion projection (`columns: { field: false }`)**  
   Low value in Convex (projection is post-fetch), but it’s a noticeable Drizzle parity gap.

## Open Questions

1. When you say “value”, should we optimize primarily for **DX parity**, **performance**, **data integrity**, or **schema expressiveness**?
2. For counts/aggregations, is it acceptable to be **potentially O(n)** unless an index makes it efficient, as long as docs clearly call it out?

## Next Steps

Pick the top 1–2 items above, then run `/workflows:plan` to define acceptance criteria and the exact API surface to mirror.

