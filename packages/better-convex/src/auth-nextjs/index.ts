/** biome-ignore-all lint/suspicious/noExplicitAny: lib */

/**
 * Next.js + Better Auth wrapper for Convex caller factory.
 * Uses @convex-dev/better-auth for token management.
 */

import { type GetTokenOptions, getToken } from '@convex-dev/better-auth/utils';

import type { CallerMeta } from '../server/caller';
import { createCallerFactory } from '../server/caller-factory';
import { CRPCError } from '../server/error';

// Default auth error detection for JWT caching
const AUTH_ERROR_REGEX = /auth/i;

const defaultIsAuthError = (error: unknown) => {
  const message =
    (error instanceof CRPCError && error.message) ||
    (error instanceof Error && error.message) ||
    '';

  return AUTH_ERROR_REGEX.test(String(message));
};

const handler = (request: Request, siteUrl: string) => {
  const requestUrl = new URL(request.url);
  const nextUrl = `${siteUrl}${requestUrl.pathname}${requestUrl.search}`;
  const newRequest = new Request(nextUrl, request);
  newRequest.headers.set('accept-encoding', 'application/json');
  newRequest.headers.set('host', new URL(siteUrl).host);
  return fetch(newRequest, { method: request.method, redirect: 'manual' });
};

const nextJsHandler = (siteUrl: string) => ({
  GET: (request: Request) => handler(request, siteUrl),
  POST: (request: Request) => handler(request, siteUrl),
});

/** JWT cache options with optional isAuthError (has built-in default). */
type JwtCacheOptions = {
  /** Enable JWT caching with automatic refresh on auth errors. */
  enabled: boolean;
  /** Expiration tolerance in seconds. */
  expirationToleranceSeconds?: number;
  /** Custom function to detect auth errors. Default checks for "auth" in error message. */
  isAuthError?: (error: unknown) => boolean;
};

type ConvexBetterAuthOptions<TApi> = Omit<GetTokenOptions, 'jwtCache'> & {
  api: TApi;
  convexSiteUrl: string;
  /** JWT caching options for automatic token refresh. */
  jwtCache?: JwtCacheOptions;
  meta: CallerMeta;
};

/**
 * Create Convex caller factory with Better Auth integration for Next.js.
 *
 * @example
 * ```ts
 * // server.ts
 * export const { createContext, createCaller, handler } = convexBetterAuth({
 *   api,
 *   convexSiteUrl: env.NEXT_PUBLIC_CONVEX_SITE_URL,
 *   jwtCache: { enabled: true, isAuthError },
 * });
 *
 * // rsc.tsx
 * const createRSCContext = cache(async () => {
 *   const heads = await headers();
 *   return createContext({ headers: heads });
 * });
 * export const caller = createCaller(createRSCContext);
 *
 * // app/page.tsx - single call!
 * const posts = await caller.posts.list();
 * ```
 */
export function convexBetterAuth<TApi extends Record<string, unknown>>(
  opts: ConvexBetterAuthOptions<TApi>
) {
  const { createContext, createCaller } = createCallerFactory({
    api: opts.api,
    convexSiteUrl: opts.convexSiteUrl,
    getToken,
    jwtCache: opts.jwtCache && {
      ...opts.jwtCache,
      isAuthError: opts.jwtCache.isAuthError ?? defaultIsAuthError,
    },
    meta: opts.meta,
  });

  return {
    createContext,
    createCaller,
    handler: nextJsHandler(opts.convexSiteUrl),
  };
}
