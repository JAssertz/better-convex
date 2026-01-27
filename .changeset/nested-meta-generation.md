---
"better-convex": patch
---

Support nested file structures in meta generation:

```
convex/functions/
  todos.ts           → crpc.todos.*
  items/queries.ts   → crpc.items.queries.*
```

- Organize functions in subdirectories
- `_` prefixed files/directories are excluded
