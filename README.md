# Better Convex

A complete framework for building type-safe, real-time applications with Convex.

### <a href="https://better-convex.com">Read the docs →</b></a>

## What's Included

| Layer        | Feature     | Description                                                        |
| ------------ | ----------- | ------------------------------------------------------------------ |
| **Server**   | cRPC        | tRPC-style procedure builder with `.input()`, `.use()`, middleware |
| **Database** | Ents        | Relationships, fluent queries, `ctx.table()`                       |
| **Database** | Triggers    | Automatic side effects on data changes                             |
| **Database** | Aggregates  | O(log n) counts, sums, leaderboards                                |
| **Client**   | React       | TanStack Query integration with real-time sync                     |
| **Client**   | Next.js     | RSC prefetching, hydration, server caller                          |
| **Auth**     | Better Auth | Lifecycle hooks, session management, guards                        |
| **CLI**      | Codegen     | Procedure metadata for auth-aware queries                          |

## Quick Look

```tsx
// Server: Define a procedure
export const list = authQuery
  .input(z.object({ limit: z.number().optional() }))
  .query(async ({ ctx, input }) => {
    return ctx.table("posts").take(input.limit ?? 10);
  });

// Client: Use it with TanStack Query
const { data: posts } = useQuery(crpc.posts.list.queryOptions({ limit: 10 }));
```
