# better-convex

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
