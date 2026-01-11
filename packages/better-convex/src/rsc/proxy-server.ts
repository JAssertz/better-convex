/**
 * Server-compatible CRPC Proxy for RSC
 *
 * Provides a proxy that works in React Server Components.
 */

import { type FunctionReference, getFunctionName } from 'convex/server';

import { convexInfiniteQueryOptions, convexQuery } from '../crpc/query-options';
import type { CRPCClient, InfiniteQueryOptsParam, Meta } from '../crpc/types';

function getFuncRef(
  api: Record<string, unknown>,
  path: string[]
): FunctionReference<'query' | 'mutation' | 'action'> {
  let current: unknown = api;

  for (const key of path) {
    if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[key];
    } else {
      throw new Error(`Invalid CRPC path: ${path.join('.')}`);
    }
  }

  return current as FunctionReference<'query' | 'mutation' | 'action'>;
}

function createRecursiveProxy(
  api: Record<string, unknown>,
  path: string[],
  meta: Meta
): unknown {
  return new Proxy(() => {}, {
    get(_target, prop: string | symbol) {
      if (typeof prop === 'symbol') return;
      if (prop === 'then') return;

      if (prop === 'queryOptions') {
        return (args: unknown = {}, opts?: { skipUnauth?: boolean }) => {
          const funcRef = getFuncRef(api, path);
          // Use convexQuery (non-hook) for RSC compatibility
          return convexQuery(
            funcRef as FunctionReference<'query'>,
            args as Record<string, unknown>,
            meta,
            opts
          );
        };
      }

      // Terminal method: infiniteQueryOptions (for paginated queries)
      if (prop === 'infiniteQueryOptions') {
        return (
          args: Record<string, unknown> = {},
          opts: InfiniteQueryOptsParam = {}
        ) => {
          const funcRef = getFuncRef(api, path) as FunctionReference<'query'>;
          return convexInfiniteQueryOptions(funcRef, args, opts, meta);
        };
      }

      // Terminal method: infiniteQueryKey (for paginated queries)
      if (prop === 'infiniteQueryKey') {
        return (args?: Record<string, unknown>) => {
          const funcRef = getFuncRef(api, path);
          const funcName = getFunctionName(funcRef);
          return ['convexQuery', funcName, args ?? {}];
        };
      }

      // Terminal property: meta (function metadata)
      if (prop === 'meta' && path.length >= 2) {
        const [namespace, fnName] = path;
        return meta[namespace]?.[fnName];
      }

      return createRecursiveProxy(api, [...path, prop], meta);
    },
  });
}

/**
 * Create a server-compatible CRPC proxy for RSC.
 * Only supports queryOptions (no mutations in RSC).
 *
 * @example
 * ```tsx
 * // src/lib/convex/rsc.tsx
 * import { api } from '@convex/api';
 * import { meta } from '@convex/meta';
 * export const crpc = createServerCRPCProxy(api, meta);
 *
 * // app/page.tsx (RSC)
 * import { prefetch, crpc } from './rsc';
 * prefetch(crpc.posts.list.queryOptions());
 * ```
 */
export function createServerCRPCProxy<TApi extends Record<string, unknown>>(
  api: TApi,
  meta: Meta
): CRPCClient<TApi> {
  return createRecursiveProxy(api, [], meta) as CRPCClient<TApi>;
}
