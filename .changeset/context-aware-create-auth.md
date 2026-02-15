---
"better-convex": minor
---

- Added `better-convex/orm` as the recommended DB API surface (Drizzle-style schema/query/mutation API).
  - Docs: [/docs/db/orm](https://www.better-convex.com/docs/db/orm)
  - Migration guide: [/docs/migrations/convex](https://www.better-convex.com/docs/migrations/convex)

## Breaking changes

- `createAuth(ctx)` is removed. Use `getAuth(ctx)` for query/mutation/action/http.

```ts
// Before
export const createAuth = (ctx: ActionCtx) =>
  betterAuth(createAuthOptions(ctx));
app.use(authMiddleware(createAuth));

// After
export const getAuth = (ctx: GenericCtx) => betterAuth(getAuthOptions(ctx));
app.use(authMiddleware(getAuth));
```

- `authClient.httpAdapter` is no longer needed. Use context-aware `adapter(...)`.

```ts
// Before
database: authClient.httpAdapter(ctx);

// After
database: authClient.adapter(ctx, getAuthOptions);
```

- cRPC templates now use `ctx.orm` (not `ctx.table`) and string IDs at the API boundary.

```ts
// Before
input: z.object({ id: zid("user") });
const user = await ctx.table("user").get(input.id);

// After
input: z.object({ id: z.string() });
const user = await ctx.orm.query.user.findFirst({ where: { id: input.id } });
```

- cRPC/auth context ID types are now string-based at the procedure boundary (`ctx.userId`, params, input/output IDs).

```ts
// Before
const userId: Id<"user"> = ctx.userId;

// After
const userId: string = ctx.userId;
```

- `getAuthConfigProvider` should be imported from `better-convex/auth-config`.
  (instead of legacy `@convex-dev/better-auth/auth-config`, or old `better-convex/auth` docs)

```ts
// Before
import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";

// After
import { getAuthConfigProvider } from "better-convex/auth-config";
```

- Remove legacy `@convex-dev/better-auth` app dependency (and old `convex-ents` if present).

```sh
bun remove @convex-dev/better-auth convex-ents
```

## Features

- `initCRPC.create()` supports default Convex builders, so old manual wiring is usually unnecessary.

```ts
// Before (remove this boilerplate)
const c = initCRPC.create({
  query,
  internalQuery,
  mutation,
  internalMutation,
  action,
  internalAction,
  httpAction,
});
const internalMutationWithTriggers = customMutation(...);

// After
const c = initCRPC.create();
// or when needed:
const cWithTriggers = initCRPC.create({ triggers });
```

- cRPC now supports wire transformers end-to-end (Date codec included by default).
  - Supported in `initCRPC.create({ transformer })`, HTTP proxy, server caller, React client, and RSC query client.

```ts
const c = initCRPC.create({ transformer: superjson });

const http = createHttpProxy({
  convexSiteUrl,
  routes,
  transformer: superjson,
});
```

- Auth setup now supports `dbTriggers` and `context` in both `createClient` and `createApi`.

```ts
const authClient = createClient({
  authFunctions,
  schema,
  dbTriggers: triggers,
  context: getOrmCtx,
});

const authApi = createApi(schema, getAuth, {
  dbTriggers: triggers,
  context: getOrmCtx,
});
```

- `createEnv` can replace manual env parsing/throw boilerplate.

```ts
// Before
export const getEnv = () => {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) throw new Error("Invalid environment variables");
  return parsed.data;
};

// After
export const getEnv = createEnv({ schema: envSchema });
```

- Added new public server helpers: context guards (`isActionCtx`/`requireActionCtx`, etc.).

## Patched

- Updated template and docs to use:
  - `better-convex/auth-client` (`convexClient`)
  - `better-convex/auth-config` (`getAuthConfigProvider`)
- Example app migration now reflects the current user-facing API (`ctx.orm`, `getAuth(ctx)`, simpler `initCRPC.create()`).
- cRPC/server error handling now normalizes known causes into deterministic CRPC errors:
  - `OrmNotFoundError` -> `NOT_FOUND`
  - `APIError` status/statusCode -> mapped cRPC code
  - standard `Error.message`/stack preservation on wrapped errors
- HTTP route validation errors (params/query/body/form) now return `BAD_REQUEST` consistently.
- `createAuthMutations` now throws `AUTH_STATE_TIMEOUT` when auth token never appears after sign-in/up flow.
- `getSession` now returns `null` when no session id is present (instead of attempting invalid DB lookups).
- CLI reliability improvements (`better-convex dev/codegen/env`): argument parsing and entrypoint resolution are more robust across runtime/symlink setups.

```ts
// Client import migration
// Before
import { convexClient } from "@convex-dev/better-auth/client/plugins";

// After
import { convexClient } from "better-convex/auth-client";
```

```ts
// Retry only non-deterministic errors
import { isCRPCError } from "better-convex/crpc";

retry: (count, error) => !isCRPCError(error) && count < 3;
```
