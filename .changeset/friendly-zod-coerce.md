---
"better-convex": minor
---

URL searchParams now auto-coerce to numbers and booleans based on Zod schema type, eliminating `z.coerce.*` boilerplate:

```ts
// Before: Required z.coerce.* boilerplate
.searchParams(z.object({
  page: z.coerce.number().optional(),
  active: z.coerce.boolean().optional(),
}))

// After: Standard Zod schemas work directly
.searchParams(z.object({
  page: z.number().optional(),
  active: z.boolean().optional(),
}))
```

Coercion behavior:

- `z.number()` - parses string to number (`"5"` → `5`)
- `z.boolean()` - parses `"true"`/`"1"` → `true`, everything else → `false`
- Works with `.optional()`, `.nullable()`, `.default()` wrappers
- `z.coerce.*` still works if preferred

### Vanilla CRPC client

`useCRPCClient()` now returns a typed proxy for direct procedural calls without React Query:

```ts
const client = useCRPCClient();

// Convex functions
const user = await client.user.get.query({ id });
await client.user.update.mutate({ id, name: "test" });

// HTTP endpoints
const todos = await client.http.todos.list.query();
await client.http.todos.create.mutate({ title: "New" });
```

Useful for event handlers, effects, or when you don't need caching/deduplication.

**Breaking:** `useCRPCClient()` return type changed from `ConvexReactClient` to typed proxy. Use `useConvex()` (now exported from `better-convex/react`) for raw client access.

### Error handling: `isCRPCError` helper

New unified error check for retry logic - returns true for any deterministic CRPC error (Convex 4xx or HTTP 4xx):

```ts
import { isCRPCError } from "better-convex/crpc";

// In query client config
retry: (failureCount, error) => {
  if (isCRPCError(error)) return false; // Don't retry client errors
  return failureCount < 3;
};
```
