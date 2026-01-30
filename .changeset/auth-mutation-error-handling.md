---
"better-convex": patch
---

Auth mutation hooks now properly trigger `onError` when Better Auth returns errors (401, 422, etc.).

```tsx
// Before: onSuccess always ran, even on errors
// After: onError fires on auth failures

const signUp = useMutation(useSignUpMutationOptions({
  onSuccess: () => router.push('/'),  // Only on success now
  onError: (error) => toast.error(error.message)  // Fires on auth errors
}));
```

New exports: `AuthMutationError` class and `isAuthMutationError` type guard for error handling.
