---
"better-convex": patch
---

Fix `MiddlewareBuilder` generic parameter mismatch causing typecheck failures when using reusable middleware with `.use()`. Factory functions now correctly pass through the `TInputOut` parameter added in v0.5.1.
