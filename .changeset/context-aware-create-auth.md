---
"better-convex": minor
---

## cRPC

- Added no-arg `initCRPC.create()` support.
- `query`, `internalQuery`, `mutation`, `internalMutation`, `action`, `internalAction`, and `httpAction` now default to Convex generic builders when omitted.

## Auth

### Breaking changes

- Removed `createAuth(ctx)` in favor of `getAuth(ctx)`.
- `createApi`, `registerRoutes`, and `authMiddleware` now take a `getAuth` factory.
- Removed `authClient.httpAdapter` from `createClient()` return value.
- Configure Better Auth with `database: authClient.adapter(ctx, getAuthOptions)`.

### New features

- `createClient().adapter(ctx, getAuthOptions)` is now context-aware:
  - query/mutation contexts (`ctx.db`) use the direct DB adapter
  - action/HTTP contexts use the HTTP adapter
- This enables one `getAuth(ctx)` flow across Convex contexts.
- Support `ctx.orm`

- `createClient` and `createApi` support `dbTriggers` for `wrapDB`-based mutation wiring.
- `context` option
- Auth mutation context order is now `ctx -> dbTriggers.wrapDB(ctx) -> context(ctx)`.

### Patch

- Added auth adapter tests for query context, action context, and fallback when `ctx.db` is absent.
- Updated auth docs and auth migration docs for `getAuth(ctx)` + context-aware adapter setup.
