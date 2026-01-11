import type { FunctionReference, FunctionReturnType } from 'convex/server';

/**
 * Infer all output types from a Convex API.
 *
 * @example
 * ```ts
 * import { api } from '@convex/api';
 * import type { inferApiOutputs } from 'better-convex/server';
 *
 * type Api = typeof api;
 * type ApiOutputs = inferApiOutputs<Api>;
 *
 * type LinkData = ApiOutputs['scraper']['scrapeLink'];
 * ```
 */
export type inferApiOutputs<TApi> = {
  [K in keyof TApi]: TApi[K] extends FunctionReference<infer _T, 'public'>
    ? FunctionReturnType<TApi[K]>
    : inferApiOutputs<TApi[K]>;
};

/**
 * Infer all input types from a Convex API.
 *
 * @example
 * ```ts
 * import { api } from '@convex/api';
 * import type { inferApiInputs } from 'better-convex/server';
 *
 * type Api = typeof api;
 * type ApiInputs = inferApiInputs<Api>;
 *
 * type ScrapeLinkInput = ApiInputs['scraper']['scrapeLink'];
 * ```
 */
export type inferApiInputs<TApi> = {
  [K in keyof TApi]: TApi[K] extends FunctionReference<infer _T, 'public'>
    ? TApi[K]['_args']
    : inferApiInputs<TApi[K]>;
};
