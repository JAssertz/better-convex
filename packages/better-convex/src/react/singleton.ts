import type { QueryClient } from '@tanstack/react-query';
import type { ConvexReactClient } from 'convex/react';

import type { AuthStore } from './auth-store';
import { ConvexQueryClient } from './client';

const globalStore = globalThis as any;

type QueryClientFactory = () => QueryClient;

/** Get/create QueryClient singleton (fresh on SSR, singleton on client) */
export const getQueryClientSingleton = (
  factory: QueryClientFactory,
  symbolKey = 'convex.queryClient'
): QueryClient => {
  const key = Symbol.for(symbolKey);
  if (typeof window === 'undefined') return factory();
  if (!globalStore[key]) globalStore[key] = factory();
  return globalStore[key] as QueryClient;
};

export type ConvexQueryClientSingletonOptions = {
  authStore?: AuthStore;
  convex: ConvexReactClient;
  queryClient: QueryClient;
  symbolKey?: string;
  /**
   * Delay in ms before unsubscribing when a query has no observers.
   * @default 3000
   */
  unsubscribeDelay?: number;
};

/** Get/create ConvexQueryClient singleton (fresh on SSR, singleton on client) */
export const getConvexQueryClientSingleton = ({
  authStore,
  convex,
  queryClient,
  symbolKey = 'convex.convexQueryClient',
  unsubscribeDelay,
}: ConvexQueryClientSingletonOptions): ConvexQueryClient => {
  const key = Symbol.for(symbolKey);
  const isServer = typeof window === 'undefined';

  let client: ConvexQueryClient;

  if (isServer) {
    client = new ConvexQueryClient(convex, { authStore, unsubscribeDelay });
  } else {
    if (globalStore[key]) {
      // Update authStore on reuse (HMR fix: jotai store may reset)
      (globalStore[key] as ConvexQueryClient).updateAuthStore(authStore);
    } else {
      globalStore[key] = new ConvexQueryClient(convex, {
        authStore,
        unsubscribeDelay,
      });
    }
    client = globalStore[key] as ConvexQueryClient;
    client.connect(queryClient);
  }

  const currentOpts = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({
    ...currentOpts,
    queries: {
      ...currentOpts.queries,
      queryFn: client.queryFn(),
      queryKeyHashFn: client.hashFn(),
    },
  });

  return client;
};
