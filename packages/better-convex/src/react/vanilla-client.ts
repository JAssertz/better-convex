/**
 * Vanilla CRPC Client
 *
 * Creates a tRPC-like proxy for direct procedural calls to Convex functions.
 * Unlike the options proxy, this allows imperative usage outside React Query.
 *
 * @example
 * ```ts
 * const client = useCRPCClient();
 * const user = await client.user.get.query({ id: '123' });
 * await client.user.update.mutate({ id: '123', name: 'New Name' });
 * ```
 */

import type { ConvexReactClient, WatchQueryOptions } from 'convex/react';
import type { FunctionReference } from 'convex/server';
import type { VanillaCRPCClient } from '../crpc/types';
import type { CallerMeta } from '../server/caller';

// ============================================================================
// Proxy Implementation
// ============================================================================

/**
 * Get a function reference from the API object by traversing the path.
 */
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

/** Get function type from meta using path */
function getFunctionType(
  path: string[],
  meta: CallerMeta
): 'query' | 'mutation' | 'action' {
  if (path.length >= 2) {
    const [namespace, fnName] = path;
    const fnType = meta[namespace]?.[fnName]?.type;
    if (fnType === 'query' || fnType === 'mutation' || fnType === 'action') {
      return fnType;
    }
  }
  return 'query';
}

/**
 * Create a recursive proxy for vanilla (direct) calls.
 */
function createRecursiveVanillaProxy(
  api: Record<string, unknown>,
  path: string[],
  meta: CallerMeta,
  convexClient: ConvexReactClient
): unknown {
  return new Proxy(() => {}, {
    get(_target, prop: string | symbol) {
      if (typeof prop === 'symbol') return;
      if (prop === 'then') return; // Prevent Promise detection

      // Terminal method: query (for queries and actions)
      if (prop === 'query') {
        return async (args: Record<string, unknown> = {}) => {
          const funcRef = getFuncRef(api, path);
          const fnType = getFunctionType(path, meta);

          if (fnType === 'action') {
            return convexClient.action(
              funcRef as FunctionReference<'action'>,
              args
            );
          }

          return convexClient.query(
            funcRef as FunctionReference<'query'>,
            args
          );
        };
      }

      // Terminal method: watchQuery (for queries - subscription)
      if (prop === 'watchQuery') {
        return (
          args: Record<string, unknown> = {},
          opts?: WatchQueryOptions
        ) => {
          const funcRef = getFuncRef(api, path);
          return convexClient.watchQuery(
            funcRef as FunctionReference<'query'>,
            args,
            opts
          );
        };
      }

      // Terminal method: mutate (for mutations and actions)
      if (prop === 'mutate') {
        return async (args: Record<string, unknown> = {}) => {
          const funcRef = getFuncRef(api, path);
          const fnType = getFunctionType(path, meta);

          if (fnType === 'action') {
            return convexClient.action(
              funcRef as FunctionReference<'action'>,
              args
            );
          }

          return convexClient.mutation(
            funcRef as FunctionReference<'mutation'>,
            args
          );
        };
      }

      // Continue path accumulation
      return createRecursiveVanillaProxy(
        api,
        [...path, prop],
        meta,
        convexClient
      );
    },
  });
}

/**
 * Create a vanilla CRPC proxy for direct procedural calls.
 *
 * The proxy provides a tRPC-like interface for imperative Convex function calls.
 *
 * @param api - The Convex API object (from `@convex/api`)
 * @param meta - Generated function metadata for runtime type detection
 * @param convexClient - The ConvexReactClient instance
 * @returns A typed proxy with query/mutate methods
 *
 * @example
 * ```tsx
 * const client = createVanillaCRPCProxy(api, meta, convexClient);
 *
 * // Direct calls (no React Query)
 * const user = await client.user.get.query({ id });
 * await client.user.update.mutate({ id, name: 'test' });
 * ```
 */
export function createVanillaCRPCProxy<TApi extends Record<string, unknown>>(
  api: TApi,
  meta: CallerMeta,
  convexClient: ConvexReactClient
): VanillaCRPCClient<TApi> {
  return createRecursiveVanillaProxy(
    api,
    [],
    meta,
    convexClient
  ) as VanillaCRPCClient<TApi>;
}
