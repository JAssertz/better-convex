'use client';

import type { AuthClient } from '@convex-dev/better-auth/react';
import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react';
import type { ConvexReactClient } from 'convex/react';
import type { ReactNode } from 'react';
import { CRPCClientError } from '../crpc/error';
import {
  AuthProvider,
  getPersistedToken,
  persistToken,
} from '../react/auth-store';

export type ConvexAuthProviderProps = {
  children: ReactNode;
  /** Convex client instance */
  client: ConvexReactClient;
  /** Better Auth client instance */
  authClient: AuthClient;
  /** Initial session token (from SSR) */
  initialToken?: string;
  /** Callback when mutation called while unauthorized */
  onMutationUnauthorized?: () => void;
  /** Callback when query called while unauthorized */
  onQueryUnauthorized?: (info: { queryName: string }) => void;
};

const defaultMutationHandler = () => {
  throw new CRPCClientError({
    code: 'UNAUTHORIZED',
    functionName: 'mutation',
  });
};

/**
 * Combined auth provider merging ConvexBetterAuthProvider + AuthProvider.
 * Single provider for consumers to configure all auth behavior.
 */
export function ConvexAuthProvider({
  children,
  client,
  authClient,
  initialToken,
  onMutationUnauthorized,
  onQueryUnauthorized,
}: ConvexAuthProviderProps) {
  // Use persisted token from globalThis when initialToken is undefined (HMR case)
  const effectiveToken = initialToken ?? getPersistedToken();

  // Persist token to globalThis for HMR survival
  if (effectiveToken) {
    persistToken(effectiveToken);
  }

  console.log('[auth ConvexAuthProvider] render:', {
    initialToken: initialToken ? 'exists' : 'undefined',
    persistedToken: getPersistedToken() ? 'exists' : 'null',
    effectiveToken: effectiveToken ? 'exists' : 'null',
    timestamp: new Date().toISOString(),
  });

  return (
    <ConvexBetterAuthProvider
      authClient={authClient}
      client={client}
      initialToken={effectiveToken}
    >
      <AuthProvider
        initialValues={{
          isLoading: true,
          token: effectiveToken ?? null,
        }}
        onMutationUnauthorized={
          onMutationUnauthorized ?? defaultMutationHandler
        }
        onQueryUnauthorized={onQueryUnauthorized ?? (() => {})}
      >
        {children}
      </AuthProvider>
    </ConvexBetterAuthProvider>
  );
}
