---
"better-convex": patch
---

Add `ConvexProviderWithAuth` for `@convex-dev/auth` users (React Native):

```tsx
import { ConvexProviderWithAuth } from 'better-convex/react';

<ConvexProviderWithAuth client={convex} useAuth={useAuthFromConvexDev}>
  <App />
</ConvexProviderWithAuth>
```

Enables `skipUnauth` queries, `useAuth`, and conditional rendering components.
