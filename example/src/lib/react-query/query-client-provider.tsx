'use client';

import {
  type QueryClient,
  QueryClientProvider as TanstackQueryClientProvider,
} from '@tanstack/react-query';

import type { ConvexReactClient } from 'convex/react';
import type React from 'react';

import { createQueryClient } from '@/lib/react-query/query-client';

let clientQueryClientSingleton: QueryClient | undefined;
const getQueryClient = ({ convex }: { convex?: ConvexReactClient }) => {
  if (typeof window === 'undefined') {
    // Server: always make a new query client
    return createQueryClient({ convex });
  }
  // Browser: use singleton pattern to keep the same query client
  // biome-ignore lint/suspicious/noAssignInExpressions: lib
  return (clientQueryClientSingleton ??= createQueryClient({ convex }));
};

export function QueryClientProvider(props: {
  children: React.ReactNode;
  convex?: ConvexReactClient;
}) {
  const queryClient = getQueryClient({ convex: props.convex });

  return (
    <TanstackQueryClientProvider client={queryClient}>
      {props.children}
    </TanstackQueryClientProvider>
  );
}
