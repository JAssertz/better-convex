'use client';

/**
 * CRPC Context and Provider
 *
 * Provides React context for the CRPC proxy, similar to tRPC's createTRPCContext.
 */

import type { ConvexReactClient } from 'convex/react';
import { createContext, type ReactNode, useContext, useMemo } from 'react';

import type { CRPCClient, FnMeta, Meta } from '../crpc/types';
import type { ConvexQueryClient } from './client';
import { createCRPCOptionsProxy } from './proxy';

// ============================================================================
// ConvexQueryClient Context
// ============================================================================

const ConvexQueryClientContext = createContext<ConvexQueryClient | null>(null);

/** Access ConvexQueryClient (e.g., for logout cleanup) */
export const useConvexQueryClient = () => useContext(ConvexQueryClientContext);

// ============================================================================
// Meta Context (shared across all CRPC instances)
// ============================================================================

const MetaContext = createContext<Meta | undefined>(undefined);

/**
 * Hook to access the meta object from context.
 * Returns undefined if meta was not provided to createCRPCContext.
 */
export function useMeta(): Meta | undefined {
  return useContext(MetaContext);
}

/**
 * Hook to get auth type for a function from meta.
 */
export function useFnMeta(): (
  namespace: string,
  fnName: string
) => FnMeta | undefined {
  const meta = useMeta();

  return (namespace: string, fnName: string) => meta?.[namespace]?.[fnName];
}

// ============================================================================
// Context Factory
// ============================================================================

/**
 * Create CRPC context, provider, and hooks for a Convex API.
 *
 * @param api - The Convex API object (from `@convex/api`)
 * @returns Object with CRPCProvider, useCRPC, and useCRPCClient
 *
 * @example
 * ```tsx
 * // lib/crpc.ts
 * import { api } from '@convex/api';
 * import { createCRPCContext } from './crpc';
 *
 * export const { CRPCProvider, useCRPC, useCRPCClient } = createCRPCContext(api);
 *
 * // app/providers.tsx
 * <CRPCProvider>
 *   <App />
 * </CRPCProvider>
 *
 * // components/user-profile.tsx
 * function UserProfile({ id }) {
 *   const crpc = useCRPC();
 *   const { data } = useQuery(crpc.user.get.queryOptions({ id }));
 * }
 * ```
 */
export function createCRPCContext<TApi extends Record<string, unknown>>(
  api: TApi,
  meta: Meta
) {
  // Create contexts
  const CRPCProxyContext = createContext<CRPCClient<TApi> | null>(null);
  const CRPCClientContext = createContext<ConvexReactClient | null>(null);

  /** Inner provider */
  function CRPCProviderInner({
    children,
    convexClient,
    convexQueryClient,
  }: {
    children: ReactNode;
    convexClient: ConvexReactClient;
    convexQueryClient: ConvexQueryClient;
  }) {
    // Memoize the proxy to prevent recreation on every render
    const proxy = useMemo(() => createCRPCOptionsProxy(api, meta), []);

    return (
      <ConvexQueryClientContext.Provider value={convexQueryClient}>
        <MetaContext.Provider value={meta}>
          <CRPCClientContext.Provider value={convexClient}>
            <CRPCProxyContext.Provider value={proxy}>
              {children}
            </CRPCProxyContext.Provider>
          </CRPCClientContext.Provider>
        </MetaContext.Provider>
      </ConvexQueryClientContext.Provider>
    );
  }

  /**
   * Provider component that wraps the app with CRPC context.
   * For auth, wrap with ConvexAuthProvider (or AuthProvider) above this.
   */
  function CRPCProvider({
    children,
    convexClient,
    convexQueryClient,
  }: {
    children: ReactNode;
    convexClient: ConvexReactClient;
    convexQueryClient: ConvexQueryClient;
  }) {
    return (
      <CRPCProviderInner
        convexClient={convexClient}
        convexQueryClient={convexQueryClient}
      >
        {children}
      </CRPCProviderInner>
    );
  }

  /**
   * Hook to access the CRPC proxy for building query/mutation options.
   *
   * @returns The typed CRPC proxy
   * @throws If used outside of CRPCProvider
   *
   * @example
   * ```tsx
   * const crpc = useCRPC();
   * const { data } = useQuery(crpc.user.get.queryOptions({ id }));
   * ```
   */
  function useCRPC(): CRPCClient<TApi> {
    const ctx = useContext(CRPCProxyContext);

    if (!ctx) {
      throw new Error('useCRPC must be used within CRPCProvider');
    }

    return ctx;
  }

  /**
   * Hook to access the underlying Convex client directly.
   *
   * @returns The ConvexReactClient
   * @throws If used outside of CRPCProvider
   *
   * @example
   * ```tsx
   * const client = useCRPCClient();
   * // Direct Convex client access for edge cases
   * ```
   */
  function useCRPCClient(): ConvexReactClient {
    const ctx = useContext(CRPCClientContext);

    if (!ctx) {
      throw new Error('useCRPCClient must be used within CRPCProvider');
    }

    return ctx;
  }

  return {
    CRPCProvider,
    useCRPC,
    useCRPCClient,
  };
}
