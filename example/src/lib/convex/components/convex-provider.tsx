'use client';

import type { api } from '@convex/_generated/api';
import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react';
import { ConvexReactClient, type Preloaded } from 'convex/react';
import { createAtomStore } from 'jotai-x';
import React, { type ReactNode } from 'react';

import { env } from '@/env';
import { authClient, useSession } from '@/lib/convex/auth-client';
import { AuthErrorBoundary } from '@/lib/convex/components/auth-error-boundary';
import { QueryClientProvider } from '@/lib/react-query/query-client-provider';

const convex = new ConvexReactClient(env.NEXT_PUBLIC_CONVEX_URL, {
  verbose: false,
});

export const { AuthProvider, useAuthStore, useAuthValue } = createAtomStore(
  {
    preloadedUser: null as unknown as Preloaded<typeof api.user.getCurrentUser>,
    token: null as string | null,
  },
  {
    effect: AuthEffect,
    name: 'auth',
  }
);

export function ConvexProvider({
  children,
  preloadedUser,
  token,
}: {
  children: ReactNode;
  preloadedUser?: Preloaded<typeof api.user.getCurrentUser>;
  token?: string;
}) {
  return (
    <ConvexBetterAuthProvider authClient={authClient} client={convex}>
      <QueryClientProvider convex={convex}>
        <ConvexProviderInner preloadedUser={preloadedUser} token={token}>
          {children}
        </ConvexProviderInner>
      </QueryClientProvider>
    </ConvexBetterAuthProvider>
  );
}

function ConvexProviderInner({
  children,
  preloadedUser,
  token,
}: {
  children: ReactNode;
  preloadedUser?: Preloaded<typeof api.user.getCurrentUser>;
  token?: string;
}) {
  return (
    <AuthProvider preloadedUser={preloadedUser} token={token ?? null}>
      <AuthErrorBoundary>{children}</AuthErrorBoundary>
    </AuthProvider>
  );
}

function AuthEffect() {
  const { data, isPending } = useSession();
  const authStore = useAuthStore();

  React.useEffect(() => {
    if (!isPending) {
      authStore.set('token', data?.session.token ?? null);
    }
  }, [data, authStore, isPending]);

  return null;
}
