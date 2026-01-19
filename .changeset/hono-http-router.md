---
"better-convex": major
---

### HTTP Router: Hono Integration

The HTTP router now wraps a Hono app, enabling full middleware support.

#### New Features

- **Hono-based routing**: `createHttpRouter(app, router)` accepts a Hono app
- **Auth middleware**: `authMiddleware(createAuth)` for Better Auth routes
- **Hono context in handlers**: Access `c.json()`, `c.text()`, `c.redirect()`, `c.req`
- **Non-JSON response support**
- **CLI watch improvements**: Watches `routers/**/*.ts` and `http.ts` for changes

#### Breaking Changes

- **Removed `response()` mode**: Return `Response` directly from handler
- **Removed per-procedure `cors()`**: Use Hono's `cors()` middleware
- **CORS via Hono**: `app.use('/api/*', cors())` instead of router options
- **Handler signature**: `{ ctx, c, input, params, query }` - `c` is Hono Context

#### Migration

Before:

```ts
import { registerRoutes } from "better-convex/auth";
import { registerCRPCRoutes } from "better-convex/server";
import { httpRouter } from "convex/server";

const http = httpRouter();

registerRoutes(http, createAuth);

export const appRouter = router({
  health,
  todos: todosRouter,
});

registerCRPCRoutes(http, appRouter, {
  httpAction,
  cors: {
    allowedOrigins: [process.env.SITE_URL!],
    allowCredentials: true,
  },
});

export default http;
```

After:

```ts
import { authMiddleware } from "better-convex/auth";
import { createHttpRouter } from "better-convex/server";
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: process.env.SITE_URL!,
    credentials: true,
  })
);

app.use(authMiddleware(createAuth));

export const appRouter = router({
  health,
  todos: todosRouter,
});

export default createHttpRouter(app, appRouter);
```

#### Handler Examples with `c`

cRPC handlers now receive `c` (Hono Context) for custom responses:

```ts
// File download with custom headers
export const download = authRoute
  .get('/api/todos/export/:format')
  .params(z.object({ format: z.enum(['json', 'csv']) }))
  .query(async ({ ctx, params, c }) => {
    const todos = await ctx.runQuery(api.todos.list, {});

    c.header('Content-Disposition', `attachment; filename="todos.${params.format}"`);

    if (params.format === 'csv') {
      return c.text(todos.map(t => `${t.id},${t.title}`).join('\n'));
    }
    return c.json({ todos });
  });

// Webhook with signature verification
export const webhook = publicRoute
  .post('/webhooks/stripe')
  .mutation(async ({ ctx, c }) => {
    const signature = c.req.header('stripe-signature');
    if (!signature) throw new CRPCError({ code: 'BAD_REQUEST' });

    const body = await c.req.text();
    await ctx.runMutation(internal.stripe.process, { body, signature });

    return c.text('OK', 200);
  });

// Redirect
export const redirect = publicRoute
  .get('/api/old-path')
  .query(async ({ c }) => c.redirect('/api/new-path', 301));
```
