---
"better-convex": patch
---

- Move hono to peerDependencies (type-only imports in package)
- Add stale cursor auto-recovery for `useInfiniteQuery` - automatically recovers from stale pagination cursors after WebSocket reconnection without losing scroll position
