---
name: convex-http
description: Advanced HTTP patterns - Hono integration, streaming, rate limiting, Discord bots. Load AFTER reading /docs/server/http
---

# Convex HTTP - Advanced Patterns

## Quick Reference

| Pattern                                  | Use Case                    |
| ---------------------------------------- | --------------------------- |
| `publicRoute.get('/path').query()`       | Public GET endpoint         |
| `authRoute.post('/path').mutation()`     | Auth-required POST          |
| `optionalAuthRoute.get('/path').query()` | Optional auth endpoint      |
| `.params(z.object({id}))`                | Path params `/todos/:id`    |
| `.searchParams(z.object({limit}))`       | Query params `?limit=10`    |
| `.input(z.object({...}))`                | JSON body (POST/PATCH)      |
| `.form(z.object({file, description}))`   | FormData uploads            |
| `.output(z.object({...}))`               | Response validation         |
| `.meta({ rateLimit: 'api/heavy' })`      | Procedure metadata          |
| `.use(middleware)`                       | Custom middleware           |
| `router({ endpoint1, endpoint2 })`       | Group endpoints             |

## HTTP Setup with Hono

cRPC HTTP endpoints require [Hono](https://hono.dev/) for routing and middleware. This provides CORS handling, middleware chains, and a clean API.

```typescript
// convex/functions/http.ts
import "../lib/http-polyfills";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { authMiddleware } from "better-convex/auth";
import { createHttpRouter } from "better-convex/server";
import { router } from "../lib/crpc";
import { createAuth } from "./auth";
import { todosRouter } from "../routers/todos";
import { health } from "../routers/health";

const app = new Hono();

// CORS for API routes (auth + cRPC)
app.use(
  "/api/*",
  cors({
    origin: process.env.SITE_URL!,
    allowHeaders: ["Content-Type", "Authorization", "Better-Auth-Cookie"],
    exposeHeaders: ["Set-Better-Auth-Cookie"],
    credentials: true,
  })
);

// Better Auth middleware
app.use(authMiddleware(createAuth));

// cRPC router
export const appRouter = router({
  health,
  todos: todosRouter,
});

export default createHttpRouter(app, appRouter);
```

### Key Components

| Component                          | Purpose                                    |
| ---------------------------------- | ------------------------------------------ |
| `Hono`                             | Route handling, middleware, CORS           |
| `authMiddleware(createAuth)`       | Better Auth routes middleware              |
| `createHttpRouter(app, appRouter)` | Creates Convex HttpRouter with Hono + cRPC |

### Hono Middleware

```typescript
// Custom middleware (logging, etc.)
app.use("*", async (c, next) => {
  console.log(`${c.req.method} ${c.req.path}`);
  await next();
});

// Global error handling
app.onError((err, c) => {
  console.error("Error:", err);
  return c.json({ error: err.message }, 500);
});
```

## Custom Responses with `c`

cRPC handlers receive `c` (Hono Context) for custom responses, headers, and raw request access.

### File Downloads

```typescript
export const download = authRoute
  .get("/api/todos/export/:format")
  .params(z.object({ format: z.enum(["json", "csv"]) }))
  .query(async ({ ctx, params, c }) => {
    const todos = await ctx.runQuery(api.todos.list, { limit: 100 });

    c.header(
      "Content-Disposition",
      `attachment; filename="todos.${params.format}"`
    );
    c.header("Cache-Control", "no-cache");

    if (params.format === "csv") {
      const csv = [
        "id,title,completed",
        ...todos.map((t) => `${t._id},${t.title},${t.completed}`),
      ].join("\n");
      return c.text(csv);
    }
    return c.json({ todos });
  });
```

### Redirects

```typescript
export const redirect = publicRoute
  .get("/api/old-path")
  .query(async ({ c }) => c.redirect("/api/new-path", 301));
```

## HTTP Methods

All standard HTTP methods are supported:

```typescript
// GET - queries
export const get = publicRoute.get('/api/todos/:id').query(...);

// POST - create resources
export const create = authRoute.post('/api/todos').mutation(...);

// PUT - full update
export const replace = authRoute
  .put('/api/todos/:id')
  .params(z.object({ id: zid('todos') }))
  .input(z.object({ title: z.string(), completed: z.boolean() }))
  .mutation(async ({ ctx, params, input }) => {
    await ctx.runMutation(api.todos.replace, { id: params.id, ...input });
    return { success: true };
  });

// PATCH - partial update
export const update = authRoute
  .patch('/api/todos/:id')
  .params(z.object({ id: zid('todos') }))
  .input(z.object({ title: z.string().optional(), completed: z.boolean().optional() }))
  .mutation(async ({ ctx, params, input }) => {
    await ctx.runMutation(api.todos.update, { id: params.id, ...input });
    return { success: true };
  });

// DELETE - remove resources
export const remove = authRoute
  .delete('/api/todos/:id')
  .params(z.object({ id: zid('todos') }))
  .mutation(async ({ ctx, params }) => {
    await ctx.runMutation(api.todos.delete, { id: params.id });
    return { deleted: true };
  });
```

## Schema Validation

### Output Validation

```typescript
export const status = publicRoute
  .get("/api/status")
  .output(z.object({ status: z.string(), timestamp: z.number() }))
  .query(async () => ({
    status: "ok",
    timestamp: Date.now(),
  }));
```

### Combined Schemas (params + searchParams + input)

```typescript
export const createTask = authRoute
  .post("/api/projects/:projectId/tasks")
  .params(z.object({ projectId: zid("projects") }))
  .searchParams(z.object({ notify: z.coerce.boolean().optional() }))
  .input(z.object({ title: z.string(), description: z.string().optional() }))
  .output(z.object({ taskId: zid("tasks"), projectId: zid("projects") }))
  .mutation(async ({ ctx, params, searchParams, input }) => {
    const taskId = await ctx.runMutation(api.tasks.create, {
      projectId: params.projectId,
      ...input,
    });
    if (searchParams.notify) {
      await ctx.scheduler.runAfter(0, internal.notifications.send, { taskId });
    }
    return { taskId, projectId: params.projectId };
  });
```

## Procedure Metadata

Use `.meta()` for rate limiting, analytics, and custom behavior:

```typescript
export const heavyEndpoint = publicRoute
  .meta({ rateLimit: "api/heavy" })
  .get("/api/reports")
  .query(async ({ ctx }) => {
    return ctx.runQuery(api.reports.generate, {});
  });

// Chained meta (shallow merge)
export const adminEndpoint = authRoute
  .meta({ role: "admin" })
  .meta({ rateLimit: "api/admin" })
  .delete("/api/users/:id")
  .params(z.object({ id: zid("user") }))
  .mutation(async ({ ctx, params }) => {
    await ctx.runMutation(api.admin.deleteUser, { id: params.id });
  });
```

## Middleware

Use `.use()` to add custom middleware that extends context:

```typescript
export const withTiming = publicRoute
  .use(async ({ ctx, next }) => {
    const start = Date.now();
    const result = await next({ ctx });
    console.log(`Request took ${Date.now() - start}ms`);
    return result;
  })
  .get("/api/timed")
  .query(async () => ({ ok: true }));

// Extend context with custom properties
export const withPermissions = authRoute
  .use(async ({ ctx, next }) => {
    const permissions = await ctx.runQuery(api.permissions.get, {
      userId: ctx.userId,
    });
    return next({ ctx: { ...ctx, permissions } });
  })
  .get("/api/protected")
  .query(async ({ ctx }) => {
    if (!ctx.permissions.includes("admin")) {
      throw new CRPCError({ code: "FORBIDDEN", message: "Admin required" });
    }
    return { data: "secret" };
  });
```

## Optional Auth

Use `optionalAuthRoute` when auth is optional (user may be null):

```typescript
export const publicOrAuth = optionalAuthRoute
  .get("/api/content")
  .query(async ({ ctx }) => {
    // ctx.user and ctx.userId may be null
    const userId: Id<"user"> | null = ctx.userId;

    if (userId) {
      // Authenticated user - return personalized content
      return ctx.runQuery(api.content.personalized, { userId });
    }
    // Anonymous user - return public content
    return ctx.runQuery(api.content.public, {});
  });
```

## Streaming Responses

### Server-Sent Events (SSE)

```typescript
import { streamText } from "hono/streaming";

export const stream = publicRoute
  .get("/api/stream")
  .query(async ({ ctx, c }) => {
    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");

    return streamText(c, async (stream) => {
      for (let i = 0; i < 10; i++) {
        const data = await ctx.runQuery(internal.data.getChunk, { index: i });
        await stream.write(`data: ${JSON.stringify(data)}\n\n`);
        await stream.sleep(1000);
      }
    });
  });
```

### AI Streaming

```typescript
import { stream } from "hono/streaming";

export const aiStream = publicRoute
  .post("/api/ai/stream")
  .input(z.object({ prompt: z.string() }))
  .mutation(async ({ ctx, input, c }) => {
    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");

    const aiStream = await ctx.runAction(internal.ai.streamResponse, {
      prompt: input.prompt,
    });

    return stream(c, async (stream) => {
      await stream.pipe(aiStream);
    });
  });
```

## Rate Limiting

IP-based rate limiting using `c.req.header()`:

```typescript
export const rateLimited = publicRoute
  .post("/api/public")
  .input(z.object({ data: z.string() }))
  .mutation(async ({ ctx, input, c }) => {
    const ip =
      c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
      c.req.header("CF-Connecting-IP") ??
      "unknown";

    const allowed = await ctx.runMutation(internal.rateLimit.check, {
      key: `http:${ip}`,
      limit: 100,
      window: 3600000,
    });

    if (!allowed) {
      return c.text("Rate limit exceeded", 429, {
        "Retry-After": "3600",
        "X-RateLimit-Limit": "100",
        "X-RateLimit-Remaining": "0",
      });
    }

    const result = await ctx.runMutation(internal.api.process, {
      data: input.data,
    });
    return c.json(result);
  });
```

## Webhook Patterns

### Stripe Webhook

```typescript
export const stripeWebhook = publicRoute
  .post("/webhooks/stripe")
  .mutation(async ({ ctx, c }) => {
    const signature = c.req.header("stripe-signature");
    if (!signature) {
      throw new CRPCError({ code: "BAD_REQUEST", message: "No signature" });
    }

    const body = await c.req.text();

    const isValid = await ctx.runAction(internal.stripe.verify, {
      body,
      signature,
    });
    if (!isValid) {
      throw new CRPCError({
        code: "BAD_REQUEST",
        message: "Invalid signature",
      });
    }

    const event = JSON.parse(body);

    switch (event.type) {
      case "payment_intent.succeeded":
        await ctx.runMutation(internal.payments.markPaid, {
          paymentIntentId: event.data.object.id,
        });
        break;
      case "customer.subscription.deleted":
        await ctx.runMutation(internal.subscriptions.cancel, {
          subscriptionId: event.data.object.id,
        });
        break;
    }

    return c.text("OK", 200);
  });
```

### Discord Bot

```typescript
import { verifyKey } from "discord-interactions";

const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY!;

export const discordWebhook = publicRoute
  .post("/webhooks/discord")
  .mutation(async ({ ctx, c }) => {
    const signature = c.req.header("X-Signature-Ed25519");
    const timestamp = c.req.header("X-Signature-Timestamp");

    if (!signature || !timestamp) {
      throw new CRPCError({
        code: "UNAUTHORIZED",
        message: "Missing signature",
      });
    }

    const body = await c.req.text();

    const isValid = verifyKey(body, signature, timestamp, DISCORD_PUBLIC_KEY);
    if (!isValid) {
      throw new CRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid signature",
      });
    }

    const interaction = JSON.parse(body);

    // Handle PING (Discord verification)
    if (interaction.type === 1) {
      return c.json({ type: 1 });
    }

    // Handle slash command
    if (interaction.type === 2) {
      const { name } = interaction.data;

      switch (name) {
        case "stats":
          const stats = await ctx.runQuery(internal.stats.get, {});
          return c.json({
            type: 4,
            data: { content: `Users: ${stats.users}, Posts: ${stats.posts}` },
          });

        case "create":
          await ctx.scheduler.runAfter(0, internal.discord.processCreate, {
            token: interaction.token,
          });
          return c.json({ type: 5 }); // DEFERRED

        default:
          return c.json({ type: 4, data: { content: "Unknown command" } });
      }
    }

    // Handle button clicks
    if (interaction.type === 3) {
      await ctx.runMutation(internal.discord.handleButton, {
        customId: interaction.data.custom_id,
        userId: interaction.user.id,
      });
      return c.json({ type: 7, data: { content: "Done!" } });
    }

    throw new CRPCError({
      code: "BAD_REQUEST",
      message: "Unknown interaction",
    });
  });
```

## React Client (Hybrid API)

The HTTP client uses a hybrid API with tRPC-style JSON body at root level and explicit `params`/`searchParams`. All client options go in args (1st param):

```typescript
// Input args: JSON body at root, explicit params/searchParams/headers
type HttpInputArgs = {
  params?: Record<string, string>;                // Path params (:id)
  searchParams?: Record<string, string | string[]>;     // Query string params
  form?: z.infer<TForm>;                         // Typed FormData (if .form() defined)
  fetch?: typeof fetch;                          // Custom fetch
  init?: RequestInit;                            // Request options
  headers?: Record<string, string> | (() => ...); // Headers (incl. cookies)
  [key: string]: unknown;                        // JSON body fields at root
};
```

### Query Examples

```typescript
// GET with searchParams
crpc.http.todos.list.queryOptions({ searchParams: { limit: '10' } });

// GET with path params
crpc.http.todos.get.queryOptions({ params: { id: todoId } });

// GET with custom headers (in args)
crpc.http.todos.list.queryOptions({
  searchParams: { limit: '10' },
  headers: { 'X-Custom': 'value' },
});
```

### One-Time Fetch

```typescript
// For exports/downloads (no caching, mutation semantics)
const exportTodos = useMutation(
  crpc.http.todos.export.mutationOptions()
);
exportTodos.mutate({ params: { format: 'csv' } });
```

### Mutation Examples

```typescript
// mutationOptions(opts?) - TanStack Query options only
const createTodo = useMutation(
  crpc.http.todos.create.mutationOptions({
    onSuccess: () => queryClient.invalidateQueries(...),
  })
);

// POST with JSON body at root (tRPC-style)
createTodo.mutate({ title: 'New Todo' });

// PATCH with path params + JSON body at root
updateTodo.mutate({ params: { id: '123' }, completed: true });

// DELETE with path params
deleteTodo.mutate({ params: { id: '123' } });

// File upload with typed FormData (server uses .form() builder)
uploadFile.mutate({ form: { file: selectedFile, description: 'My file' } });

// Per-call client options (headers, abort signal, etc.)
updateTodo.mutate({
  params: { id: '123' },
  completed: true,
  headers: { 'X-Custom': 'value' },
  init: { signal: controller.signal },
});
```

### Cache Invalidation

```typescript
// Access mutation variables (HttpInputArgs)
const updateTodo = useMutation(
  crpc.http.todos.update.mutationOptions({
    onSuccess: (_, vars) => {
      // vars.params?.id for path params
      queryClient.invalidateQueries(
        crpc.http.todos.get.queryFilter({ params: { id: vars.params?.id } })
      );
    },
  })
);
```

## Server-Side Calls

For server-to-server calls outside React (API routes, middleware, cron jobs):

```typescript
// Usage in API routes or middleware
import { createContext } from "@/lib/convex/server";

const ctx = await createContext({ headers: request.headers });

// Query
const users = await ctx.caller.user.list({});

// Mutation
await ctx.caller.user.create({ name: "John", email: "john@example.com" });

// Check auth state
if (ctx.isAuthenticated) {
  const me = await ctx.caller.user.getSessionUser({});
}
```

See [Server-Side Calls](/docs/server/server-side-calls) for full documentation.
