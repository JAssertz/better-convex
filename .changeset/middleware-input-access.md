---
"better-convex": patch
---

Middleware now receives `input` and `getRawInput` parameters:

```ts
publicQuery
  .input(z.object({ projectId: zid("projects") }))
  .use(async ({ ctx, input, next }) => {
    // input.projectId is typed!
    const project = await ctx.db.get(input.projectId);
    return next({ ctx: { ...ctx, project } });
  });
```

- Middleware after `.input()` receives typed input
- Middleware before `.input()` receives `unknown`
- `getRawInput()` returns raw input before validation
- `next({ input })` allows modifying input for downstream middleware
- Non-breaking: existing middleware works unchanged
