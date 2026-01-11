'use client';

/**
 * Auth Store - Generic auth state management with jotai-x
 *
 * Provides token storage and auth callback configuration.
 * App configures handlers, lib hooks consume state.
 */

import { useConvexAuth } from 'convex/react';
import { createAtomStore } from 'jotai-x';
import React from 'react';

import { CRPCClientError } from '../crpc/error';

export type AuthStoreState = {
  /** Callback when mutation/action called while unauthorized. Throws by default. */
  onMutationUnauthorized: () => void;
  /** Callback when query called while unauthorized. Noop by default. */
  onQueryUnauthorized: (info: { queryName: string }) => void;
  /** Current session token */
  token: string | null;
  /** Whether Convex auth is still loading (synced from useConvexAuth) */
  isLoading: boolean;
  /** Whether user is authenticated (synced from useConvexAuth + token) */
  isAuthenticated: boolean;
  /** Guard function - returns true if blocked, else runs callback */
  guard: (callback?: () => Promise<void> | void) => boolean | undefined;
};

// HMR persistence: globalThis survives module re-evaluation
// biome-ignore lint/suspicious/noExplicitAny: globalThis symbol keys
const globalStore = globalThis as any;
const AUTH_TOKEN_KEY = Symbol.for('convex.authToken');

/** Get persisted token from globalThis (survives HMR) */
export const getPersistedToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return globalStore[AUTH_TOKEN_KEY] ?? null;
};

/** Persist token to globalThis (survives HMR) */
export const persistToken = (token: string | null) => {
  if (typeof window !== 'undefined') {
    globalStore[AUTH_TOKEN_KEY] = token;
  }
};

function AuthEffect() {
  const authStore = useAuthStore();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const token = useAuthValue('token');
  const onMutationUnauthorized = useAuthValue('onMutationUnauthorized');

  // Sync auth state from useConvexAuth to store
  React.useEffect(() => {
    authStore.set('isLoading', isLoading);
    authStore.set('isAuthenticated', isAuthenticated && !!token);
    authStore.set('guard', (callback?: () => Promise<void> | void) => {
      if (!token) {
        onMutationUnauthorized();
        return true;
      }
      return callback ? void callback() : false;
    });
  }, [isLoading, isAuthenticated, token, onMutationUnauthorized, authStore]);

  return null;
}

/** Session data type for useSyncSession */
type SessionData = { session: { token: string } } | null | undefined;

/**
 * Hook to sync session token to auth store.
 * Call this from your app's provider with your auth library's session data.
 *
 * @example
 * ```tsx
 * function AuthSync() {
 *   const session = useSession(); // from your auth client
 *   useSyncSession(session);
 *   return null;
 * }
 * ```
 */
export function useSyncSession(session: {
  data: SessionData;
  isPending: boolean;
}) {
  const authStore = useAuthStore();
  const currentToken = authStore.get('token');

  console.log('[auth useSyncSession] render:', {
    sessionData: session.data ? 'exists' : 'null',
    isPending: session.isPending,
    currentStoreToken: currentToken ? 'exists' : 'null',
    timestamp: new Date().toISOString(),
  });

  React.useEffect(() => {
    if (!session.isPending && !authStore.get('token')) {
      const token = session.data?.session.token ?? null;
      console.log('[auth useSyncSession] syncing token:', {
        newToken: token ? 'exists' : 'null',
        timestamp: new Date().toISOString(),
      });
      authStore.set('token', token);
      // Only persist valid tokens, never null (defensive against overwriting persisted token)
      if (token) {
        persistToken(token);
      }
    }
  }, [session.data, authStore, session.isPending]);
}

export const {
  authStore,
  AuthProvider,
  useAuthStore,
  useAuthState,
  useAuthValue,
} = createAtomStore(
  {
    onMutationUnauthorized: () => {
      throw new CRPCClientError({
        code: 'UNAUTHORIZED',
        functionName: 'mutation',
      });
    },
    onQueryUnauthorized: () => {},
    token: getPersistedToken(),
    enabled: false,
    isLoading: false,
    isAuthenticated: false,
    guard: () => false,
  } as AuthStoreState,
  { effect: AuthEffect, name: 'auth' as const, suppressWarnings: true }
);

export type AuthStore = ReturnType<typeof useAuthStore>;

export const useAuthStatus = () => {
  const authStore = useAuthStore();

  if (!authStore.store) {
    return {
      hasSession: false,
      isAuthenticated: false,
      isLoading: false,
    };
  }

  // During SSR/prerendering, return loading state
  if (typeof window === 'undefined') {
    return {
      hasSession: false,
      isAuthenticated: false,
      isLoading: true,
    };
  }

  // Token is ready to be used only after convex client auth is loaded
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { isAuthenticated, isLoading } = useConvexAuth();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const token = useAuthValue('token');

  return {
    hasSession: !!token,
    isAuthenticated: isAuthenticated && !!token,
    isLoading,
  };
};

export const useIsAuth = (verified?: boolean) => {
  const { hasSession, isAuthenticated } = useAuthStatus();

  if (verified) {
    return isAuthenticated;
  }

  return hasSession;
};

export const useAuthGuard = () => {
  const isAuth = useIsAuth();
  const onMutationUnauthorized = useAuthValue('onMutationUnauthorized');

  return (callback?: () => Promise<void> | void) => {
    if (!isAuth) {
      onMutationUnauthorized();

      return true;
    }

    return callback ? void callback() : false;
  };
};

/** Render children only when authenticated */
export function Authenticated({ children }: { children: React.ReactNode }) {
  const isAuth = useIsAuth();

  if (isAuth) {
    return <>{children}</>;
  }

  return null;
}

/** Render children only when not authenticated */
export function Unauthenticated({
  children,
  verified,
}: {
  children: React.ReactNode;
  /** If true, wait for auth to verify (not just session existence) */
  verified?: boolean;
}) {
  const { hasSession, isAuthenticated, isLoading } = useAuthStatus();

  if (!verified && hasSession) {
    return null;
  }
  if (verified && (isLoading || isAuthenticated)) {
    return null;
  }

  return <>{children}</>;
}
