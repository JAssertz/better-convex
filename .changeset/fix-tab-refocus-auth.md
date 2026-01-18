---
"better-convex": patch
---

- Fix (`UNAUTHORIZED`) queries failing after switching tabs and returning to the app. The auth token is now preserved during session refetch instead of being cleared.
- Fix (`UNAUTHORIZED`) `useSuspenseQuery` failing on initial page load when auth is still loading. WebSocket subscriptions now wait for auth to settle before connecting.
- Fix logout setting `isAuthenticated: false` before unsubscribing to prevent query re-subscriptions.
- Add missing `dotenv` dependency for CLI.
