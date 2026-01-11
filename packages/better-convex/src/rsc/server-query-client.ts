import { fetchAction, fetchQuery } from 'convex/nextjs';
import type { FunctionReference } from 'convex/server';

import type { ConvexQueryMeta } from '../crpc/types';
import { createHashFn } from '../internal/hash';

export type GetServerQueryClientOptionsParams = {
  /** Function to get auth token for authenticated queries. Use `caller.getToken` from your RSC setup. */
  getToken?: () => Promise<string | undefined>;
};

/**
 * Get server QueryClient options for RSC prefetching.
 *
 * @example
 * ```ts
 * const queryClient = new QueryClient({
 *   defaultOptions: {
 *     ...getServerQueryClientOptions({ getToken: caller.getToken }),
 *   },
 * });
 * ```
 */
export function getServerQueryClientOptions({
  getToken,
}: GetServerQueryClientOptionsParams = {}) {
  return {
    queries: {
      staleTime: 30_000,
      queryFn: async ({
        queryKey,
        meta,
      }: {
        queryKey: readonly unknown[];
        meta?: Record<string, unknown>;
      }) => {
        const [type, funcRef, args] = queryKey as [
          'convexQuery' | 'convexAction',
          FunctionReference<'query' | 'action'>,
          Record<string, unknown>,
        ];

        const token = await getToken?.();

        // Only skip for skipUnauth queries when not authenticated
        const skipUnauth = (meta as ConvexQueryMeta | undefined)?.skipUnauth;
        if (skipUnauth && !token) {
          return null;
        }

        // Use convex fetch directly - works for public queries too
        const opts = token ? { token } : undefined;
        return type === 'convexQuery'
          ? fetchQuery(funcRef as FunctionReference<'query'>, args, opts)
          : fetchAction(funcRef as FunctionReference<'action'>, args, opts);
      },
      queryKeyHashFn: createHashFn(),
    },
  };
}
