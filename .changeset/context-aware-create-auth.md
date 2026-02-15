---
"better-convex": minor
---

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

- Added `better-convex/orm` as the recommended DB API surface (Drizzle-style schema/query/mutation API).
  - Docs: [/docs/db/orm](https://www.better-convex.com/docs/db/orm)
  - Migration guide: [/docs/migrations/ents](https://www.better-convex.com/docs/migrations/ents)

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

## Patched

- Updated template and docs to use:
  - `better-convex/auth-client` (`convexClient`)
  - `better-convex/auth-config` (`getAuthConfigProvider`)
- Example app migration now reflects the current user-facing API (`ctx.orm`, `getAuth(ctx)`, simpler `initCRPC.create()`).

```ts
// Client import migration
// Before
import { convexClient } from "@convex-dev/better-auth/client/plugins";

// After
import { convexClient } from "better-convex/auth-client";
```
