# better-convex

## 0.3.0

### Minor Changes

- [#27](https://github.com/udecode/better-convex/pull/27) [`6309e68`](https://github.com/udecode/better-convex/commit/6309e688b3f92b07877966a6f6f7929f2cb7ade0) Thanks [@zbeyens](https://github.com/zbeyens)! - ### HTTP Router: Hono Integration

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
    }),
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
    .get("/api/todos/export/:format")
    .params(z.object({ format: z.enum(["json", "csv"]) }))
    .query(async ({ ctx, params, c }) => {
      const todos = await ctx.runQuery(api.todos.list, {});

      c.header(
        "Content-Disposition",
        `attachment; filename="todos.${params.format}"`,
      );

      if (params.format === "csv") {
        return c.text(todos.map((t) => `${t.id},${t.title}`).join("\n"));
      }
      return c.json({ todos });
    });

  // Webhook with signature verification
  export const webhook = publicRoute
    .post("/webhooks/stripe")
    .mutation(async ({ ctx, c }) => {
      const signature = c.req.header("stripe-signature");
      if (!signature) throw new CRPCError({ code: "BAD_REQUEST" });

      const body = await c.req.text();
      await ctx.runMutation(internal.stripe.process, { body, signature });

      return c.text("OK", 200);
    });

  // Redirect
  export const redirect = publicRoute
    .get("/api/old-path")
    .query(async ({ c }) => c.redirect("/api/new-path", 301));
  ```

## 0.2.1

### Patch Changes

- [#24](https://github.com/udecode/better-convex/pull/24) [`b5555ea`](https://github.com/udecode/better-convex/commit/b5555eac9e67ef06328f5e122ce2d4512f3b3c7f) Thanks [@zbeyens](https://github.com/zbeyens)! - - Fix (`UNAUTHORIZED`) queries failing after switching tabs and returning to the app. The auth token is now preserved during session refetch instead of being cleared.
  - Fix (`UNAUTHORIZED`) `useSuspenseQuery` failing on initial page load when auth is still loading. WebSocket subscriptions now wait for auth to settle before connecting.
  - Fix logout setting `isAuthenticated: false` before unsubscribing to prevent query re-subscriptions.
  - Add missing `dotenv` dependency for CLI.

## 0.2.0

### Minor Changes

- [#22](https://github.com/udecode/better-convex/pull/22) [`27d355e`](https://github.com/udecode/better-convex/commit/27d355e4ac067503e00bf534164c6ce2974a8a46) Thanks [@zbeyens](https://github.com/zbeyens)! - **BREAKING:** Refactored `createCRPCContext` and `createServerCRPCProxy` to use options object:

  Before:

  ```ts
  createCRPCContext(api, meta);
  createServerCRPCProxy(api, meta);
  ```

  After:

  ```ts
  createCRPCContext<Api>({ api, meta, convexSiteUrl });
  createServerCRPCProxy<Api>({ api, meta });
  ```

  **BREAKING:** `getServerQueryClientOptions` now requires `convexSiteUrl`:

  ```ts
  getServerQueryClientOptions({
    getToken: caller.getToken,
    convexSiteUrl: env.NEXT_PUBLIC_CONVEX_SITE_URL,
  });
  ```

  **Feature:** Added type-safe HTTP routes with tRPC-style client:

  ```ts
  // 1. Pass httpAction to initCRPC.create()
  const c = initCRPC.dataModel<DataModel>().create({
    query, mutation, action, httpAction,
  });
  export const publicRoute = c.httpAction;
  export const authRoute = c.httpAction.use(authMiddleware);
  export const router = c.router;

  // 2. Define routes with .get()/.post()/.patch()/.delete()
  export const health = publicRoute
    .get('/api/health')
    .output(z.object({ status: z.string() }))
    .query(async () => ({ status: 'ok' }));

  // 3. Use .params(), .searchParams(), .input() for typed inputs
  export const todosRouter = router({
    list: publicRoute.get('/api/todos')
      .searchParams(z.object({ limit: z.coerce.number().optional() }))
      .query(...),
    get: publicRoute.get('/api/todos/:id')
      .params(z.object({ id: zid('todos') }))
      .query(...),
    create: authRoute.post('/api/todos')
      .input(z.object({ title: z.string() }))
      .mutation(...),
  });

  // 4. Register with CORS
  registerCRPCRoutes(http, appRouter, {
    httpAction,
    cors: { allowedOrigins: [process.env.SITE_URL!], allowCredentials: true },
  });

  // 5. Add to Api type for inference
  export type Api = WithHttpRouter<typeof api, typeof appRouter>;

  // 6. Client: TanStack Query integration via crpc.http.*
  const crpc = useCRPC();
  useSuspenseQuery(crpc.http.todos.list.queryOptions({ limit: 10 }));
  useMutation(crpc.http.todos.create.mutationOptions());
  queryClient.invalidateQueries(crpc.http.todos.list.queryFilter());

  // 7. RSC: prefetch helper
  prefetch(crpc.http.health.queryOptions({}));
  ```

  **Fix:** Improved authentication in `ConvexAuthProvider`:
  - **FetchAccessTokenContext**: New context passes `fetchAccessToken` through React tree - eliminates race conditions where token wasn't available during render
  - **Token Expiration Tracking**: Added `expiresAt` field with `decodeJwtExp()` - 60s cache leeway prevents unnecessary token refreshes
  - **SSR Hydration Fix**: Defensive `isLoading` check prevents UNAUTHORIZED errors when Better Auth briefly returns null during hydration
  - **Removed HMR persistence**: No more globalThis Symbol storage (`getPersistedToken`/`persistToken`)
  - **Simplified AuthStore**: Removed `guard` method and `AuthEffect` - state synced via `useConvexAuth()` directly

## 0.1.0

### Minor Changes

- [#18](https://github.com/udecode/better-convex/pull/18) [`681e9ba`](https://github.com/udecode/better-convex/commit/681e9bafdeaa62928f15fe9781f944d42ce2d2b4) Thanks [@zbeyens](https://github.com/zbeyens)! - Initial release
