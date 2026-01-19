/**
 * HTTP Proxy for TanStack Query
 *
 * Provides queryOptions/mutationOptions for HTTP endpoints,
 * colocated under `crpc.http.*` namespace.
 *
 * @example
 * ```ts
 * const crpc = useCRPC();
 *
 * // GET endpoint → queryOptions (no subscription)
 * const { data } = useQuery(crpc.http.todos.get.queryOptions({ id }));
 *
 * // POST endpoint → mutationOptions
 * const mutation = useMutation(crpc.http.todos.create.mutationOptions());
 * await mutation.mutateAsync({ title: 'New todo' });
 * ```
 */

import type {
  DefaultError,
  QueryFilters,
  UseMutationOptions,
  UseQueryOptions,
} from '@tanstack/react-query';
import type { z } from 'zod';

import { HttpClientError, type HttpErrorCode } from '../crpc/http-types';
import type { DistributiveOmit, Simplify } from '../internal/types';
import type { CRPCHttpRouter, HttpRouterRecord } from '../server/http-router';
import type { HttpProcedure } from '../server/http-types';
import type { UnsetMarker } from '../server/types';

// ============================================================================
// HTTP Route Map (from codegen)
// ============================================================================

export type HttpRouteInfo = { path: string; method: string };
export type HttpRouteMap = Record<string, HttpRouteInfo>;

// ============================================================================
// Type Inference Utilities
// ============================================================================

/** Infer schema type or return empty object if UnsetMarker */
type InferSchemaOrEmpty<T> = T extends UnsetMarker
  ? object
  : T extends z.ZodTypeAny
    ? z.infer<T>
    : object;

/** Infer merged input from HttpProcedure */
type InferHttpInput<T> =
  T extends HttpProcedure<
    infer TInput,
    infer _TOutput,
    infer TParams,
    infer TQuery
  >
    ? Simplify<
        InferSchemaOrEmpty<TParams> &
          InferSchemaOrEmpty<TQuery> &
          InferSchemaOrEmpty<TInput>
      >
    : object;

/** Infer output type from HttpProcedure */
type InferHttpOutput<T> =
  T extends HttpProcedure<
    infer _TInput,
    infer TOutput,
    infer _TParams,
    infer _TQuery
  >
    ? TOutput extends UnsetMarker
      ? unknown
      : TOutput extends z.ZodTypeAny
        ? z.infer<TOutput>
        : unknown
    : unknown;

// ============================================================================
// HTTP Query Key
// ============================================================================

/** Query key with args (3-element) or prefix key without args (2-element) for invalidation */
export type HttpQueryKey =
  | readonly ['httpQuery', string, unknown]
  | readonly ['httpQuery', string];
export type HttpMutationKey = readonly ['httpMutation', string];

// ============================================================================
// HTTP Procedure Options Types
// ============================================================================

type ReservedQueryOptions = 'queryKey' | 'queryFn';
type ReservedMutationOptions = 'mutationFn';

/** Variables type for mutations - void when no args required */
type HttpMutationVariables<T extends HttpProcedure> =
  keyof InferHttpInput<T> extends never
    ? // biome-ignore lint/suspicious/noConfusingVoidType: TanStack Query requires void for optional variables
      void
    : object extends InferHttpInput<T>
      ? InferHttpInput<T> | undefined
      : InferHttpInput<T>;

/** Query options for GET HTTP endpoints - compatible with both useQuery and useSuspenseQuery */
type HttpQueryOptsReturn<T extends HttpProcedure> = Omit<
  UseQueryOptions<InferHttpOutput<T>, Error, InferHttpOutput<T>, HttpQueryKey>,
  'queryFn'
> & {
  queryFn: () => Promise<InferHttpOutput<T>>;
};

/** Mutation options for POST/PUT/PATCH/DELETE HTTP endpoints */
type HttpMutationOptsReturn<T extends HttpProcedure> = UseMutationOptions<
  InferHttpOutput<T>,
  DefaultError,
  HttpMutationVariables<T>
>;

/** Decorated GET procedure with queryOptions */
type DecorateHttpQuery<T extends HttpProcedure> = {
  queryOptions: keyof InferHttpInput<T> extends never
    ? (
        args?: object,
        opts?: DistributiveOmit<HttpQueryOptsReturn<T>, ReservedQueryOptions>
      ) => HttpQueryOptsReturn<T>
    : object extends InferHttpInput<T>
      ? (
          args?: InferHttpInput<T>,
          opts?: DistributiveOmit<HttpQueryOptsReturn<T>, ReservedQueryOptions>
        ) => HttpQueryOptsReturn<T>
      : (
          args: InferHttpInput<T>,
          opts?: DistributiveOmit<HttpQueryOptsReturn<T>, ReservedQueryOptions>
        ) => HttpQueryOptsReturn<T>;
  /** Get query key for QueryClient methods (with args = exact match, without = prefix) */
  queryKey: (args?: InferHttpInput<T>) => HttpQueryKey;
  /** Get query filter for QueryClient methods (e.g., invalidateQueries) */
  queryFilter: (
    args?: InferHttpInput<T>,
    filters?: DistributiveOmit<QueryFilters, 'queryKey'>
  ) => QueryFilters;
};

/** Decorated POST/PUT/PATCH/DELETE procedure with mutationOptions */
type DecorateHttpMutation<T extends HttpProcedure> = {
  mutationOptions: (
    opts?: DistributiveOmit<HttpMutationOptsReturn<T>, ReservedMutationOptions>
  ) => HttpMutationOptsReturn<T>;
  /** Get mutation key for QueryClient methods */
  mutationKey: () => HttpMutationKey;
};

// ============================================================================
// HTTP Client Type (recursive)
// ============================================================================

/**
 * HTTP Client type from router record.
 * Maps each procedure to queryOptions (GET) or mutationOptions (POST/etc).
 * Uses infer to extract the method type literal for proper GET/non-GET distinction.
 */
export type HttpCRPCClient<T extends HttpRouterRecord> = {
  [K in keyof T]: T[K] extends HttpProcedure<
    infer _TInput,
    infer _TOutput,
    infer _TParams,
    infer _TQuery,
    infer TMethod
  >
    ? TMethod extends 'GET'
      ? DecorateHttpQuery<T[K]>
      : DecorateHttpMutation<T[K]>
    : T[K] extends CRPCHttpRouter<infer R>
      ? HttpCRPCClient<R>
      : T[K] extends HttpRouterRecord
        ? HttpCRPCClient<T[K]>
        : never;
};

/**
 * HTTP Client type from a CRPCHttpRouter.
 * Use this when your type is the router object (with _def).
 */
export type HttpCRPCClientFromRouter<TRouter extends CRPCHttpRouter<any>> =
  HttpCRPCClient<TRouter['_def']['record']>;

// ============================================================================
// HTTP Proxy Options
// ============================================================================

export interface HttpProxyOptions<TRoutes extends HttpRouteMap> {
  /** Base URL for the Convex HTTP API (e.g., https://your-site.convex.site) */
  convexSiteUrl: string;
  /** Runtime route definitions (from codegen httpRoutes) */
  routes: TRoutes;
  /** Default headers or async function returning headers (for auth tokens) */
  headers?:
    | { [key: string]: string | undefined }
    | (() =>
        | { [key: string]: string | undefined }
        | Promise<{ [key: string]: string | undefined }>);
  /** Custom fetch function (defaults to global fetch) */
  fetch?: typeof fetch;
  /** Error handler called on HTTP errors */
  onError?: (error: HttpClientError) => void;
}

// ============================================================================
// HTTP Request Execution
// ============================================================================

/**
 * Extract path parameter names from a route path
 * e.g., '/users/:id/posts/:postId' -> ['id', 'postId']
 */
function extractPathParamNames(path: string): string[] {
  const matches = path.match(/:([a-zA-Z_][a-zA-Z0-9_]*)/g);
  return matches ? matches.map((m) => m.slice(1)) : [];
}

/**
 * Execute an HTTP request to a cRPC endpoint
 */
async function executeHttpRequest(opts: {
  convexSiteUrl: string;
  route: { path: string; method: string };
  procedureName: string;
  input: unknown;
  headers?:
    | { [key: string]: string | undefined }
    | (() =>
        | { [key: string]: string | undefined }
        | Promise<{ [key: string]: string | undefined }>);
  fetch?: typeof fetch;
}): Promise<unknown> {
  const { method, path } = opts.route;
  const input = opts.input as Record<string, unknown> | undefined;
  const pathParamNames = extractPathParamNames(path);

  // Build URL with path params replaced (:id -> actual value)
  let url =
    opts.convexSiteUrl +
    path.replace(/:(\w+)/g, (_, key) => {
      const value = input?.[key];
      return value !== null && value !== undefined
        ? encodeURIComponent(String(value))
        : '';
    });

  // Resolve headers (support async headers fn for auth tokens)
  const headers =
    typeof opts.headers === 'function' ? await opts.headers() : opts.headers;

  // Build request based on method
  let body: string | undefined;
  if (method === 'GET') {
    // Query params for GET (exclude path params)
    const queryInput = input
      ? Object.fromEntries(
          Object.entries(input).filter(([k]) => !pathParamNames.includes(k))
        )
      : {};
    if (Object.keys(queryInput).length > 0) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(queryInput)) {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      }
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }
  } else {
    // Body for POST/PUT/PATCH/DELETE (exclude path params)
    const bodyInput = input
      ? Object.fromEntries(
          Object.entries(input).filter(([k]) => !pathParamNames.includes(k))
        )
      : {};
    if (Object.keys(bodyInput).length > 0) {
      body = JSON.stringify(bodyInput);
    }
  }

  const fetchFn = opts.fetch ?? globalThis.fetch;
  const response = await fetchFn(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({
      error: { code: 'UNKNOWN', message: response.statusText },
    }));

    const errorCode: HttpErrorCode =
      (errorData?.error?.code as HttpErrorCode) || 'UNKNOWN';
    const errorMessage = errorData?.error?.message || response.statusText;

    throw new HttpClientError({
      code: errorCode,
      status: response.status,
      procedureName: opts.procedureName,
      message: errorMessage,
    });
  }

  // Handle empty responses (204 No Content, etc.)
  const contentLength = response.headers.get('content-length');
  if (contentLength === '0' || response.status === 204) {
    return;
  }

  // Check Content-Type to determine how to parse the response
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  // Non-JSON responses (text/plain, text/csv, etc.) return as text
  return response.text();
}

// ============================================================================
// HTTP Proxy Implementation
// ============================================================================

/**
 * Create a recursive proxy for HTTP routes with TanStack Query integration.
 *
 * Terminal methods:
 * - GET endpoints: `queryOptions`, `queryKey`
 * - POST/PUT/PATCH/DELETE: `mutationOptions`, `mutationKey`
 */
function createRecursiveHttpProxy(
  opts: {
    convexSiteUrl: string;
    routes: HttpRouteMap;
    headers?:
      | { [key: string]: string | undefined }
      | (() =>
          | { [key: string]: string | undefined }
          | Promise<{ [key: string]: string | undefined }>);
    fetch?: typeof fetch;
    onError?: (error: HttpClientError) => void;
  },
  path: string[] = []
): unknown {
  return new Proxy(() => {}, {
    get(_, prop: string | symbol) {
      // Ignore symbols and internal properties
      if (typeof prop === 'symbol') return;
      if (prop === 'then') return; // Prevent Promise detection

      const routeKey = path.join('.');
      const route = opts.routes[routeKey];

      // Terminal method: queryOptions (for GET endpoints)
      if (prop === 'queryOptions') {
        if (!route) {
          throw new Error(`Unknown HTTP procedure: ${routeKey}`);
        }
        if (route.method !== 'GET') {
          throw new Error(
            `queryOptions is only available for GET endpoints, got ${route.method} for ${routeKey}`
          );
        }

        return (args?: unknown, userOpts?: UseQueryOptions<unknown>) => ({
          ...userOpts,
          queryKey: ['httpQuery', routeKey, args] as const,
          queryFn: async () => {
            try {
              return await executeHttpRequest({
                convexSiteUrl: opts.convexSiteUrl,
                route,
                procedureName: routeKey,
                input: args,
                headers: opts.headers,
                fetch: opts.fetch,
              });
            } catch (error) {
              if (opts.onError && error instanceof HttpClientError) {
                opts.onError(error);
              }
              throw error;
            }
          },
        });
      }

      // Terminal method: queryKey (for GET endpoints)
      // When called without args or empty object, return 2-element key for prefix matching
      // When called with args, return 3-element key for exact match
      if (prop === 'queryKey') {
        return (args?: unknown) => {
          // undefined or empty object = no args = prefix key
          const hasArgs =
            args !== undefined &&
            !(
              typeof args === 'object' &&
              args !== null &&
              Object.keys(args).length === 0
            );
          return hasArgs
            ? (['httpQuery', routeKey, args] as const)
            : (['httpQuery', routeKey] as const);
        };
      }

      // Terminal method: queryFilter (for GET endpoints, used for invalidation)
      if (prop === 'queryFilter') {
        return (args?: unknown, filters?: Record<string, unknown>) => {
          // undefined or empty object = no args = prefix key
          const hasArgs =
            args !== undefined &&
            !(
              typeof args === 'object' &&
              args !== null &&
              Object.keys(args).length === 0
            );
          return {
            ...filters,
            queryKey: hasArgs
              ? (['httpQuery', routeKey, args] as const)
              : (['httpQuery', routeKey] as const),
          };
        };
      }

      // Terminal method: mutationOptions (for POST/PUT/PATCH/DELETE)
      if (prop === 'mutationOptions') {
        if (!route) {
          throw new Error(`Unknown HTTP procedure: ${routeKey}`);
        }
        if (route.method === 'GET') {
          throw new Error(
            `mutationOptions is not available for GET endpoints, use queryOptions for ${routeKey}`
          );
        }

        return (
          userOpts?: UseMutationOptions<unknown, DefaultError, unknown>
        ) => ({
          ...userOpts,
          mutationKey: ['httpMutation', routeKey] as const,
          mutationFn: async (args: unknown) => {
            try {
              return await executeHttpRequest({
                convexSiteUrl: opts.convexSiteUrl,
                route,
                procedureName: routeKey,
                input: args,
                headers: opts.headers,
                fetch: opts.fetch,
              });
            } catch (error) {
              if (opts.onError && error instanceof HttpClientError) {
                opts.onError(error);
              }
              throw error;
            }
          },
        });
      }

      // Terminal method: mutationKey (for POST/PUT/PATCH/DELETE)
      if (prop === 'mutationKey') {
        return () => ['httpMutation', routeKey] as const;
      }

      // Continue path accumulation
      return createRecursiveHttpProxy(opts, [...path, prop]);
    },
  });
}

/**
 * Create an HTTP proxy with TanStack Query integration.
 *
 * Returns a proxy that provides:
 * - `queryOptions` for GET endpoints (no subscription)
 * - `mutationOptions` for POST/PUT/PATCH/DELETE endpoints
 *
 * @example
 * ```ts
 * const httpProxy = createHttpProxy<AppRouter>({
 *   convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL!,
 *   routes: httpRoutes,
 * });
 *
 * // GET endpoint
 * const opts = httpProxy.todos.get.queryOptions({ id: '123' });
 * const { data } = useQuery(opts);
 *
 * // POST endpoint
 * const mutation = useMutation(httpProxy.todos.create.mutationOptions());
 * await mutation.mutateAsync({ title: 'New todo' });
 * ```
 */
export function createHttpProxy<
  TRouter extends CRPCHttpRouter<any>,
  TRoutes extends HttpRouteMap = HttpRouteMap,
>(opts: HttpProxyOptions<TRoutes>): HttpCRPCClientFromRouter<TRouter> {
  return createRecursiveHttpProxy({
    convexSiteUrl: opts.convexSiteUrl,
    routes: opts.routes,
    headers: opts.headers,
    fetch: opts.fetch,
    onError: opts.onError,
  }) as HttpCRPCClientFromRouter<TRouter>;
}
