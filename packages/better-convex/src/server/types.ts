/**
 * CRPC Types - tRPC-inspired type utilities for Convex
 */
import type { z } from 'zod';

// =============================================================================
// Marker Types
// =============================================================================

/** Marker for unset values - branded type to distinguish "not set" from actual types */
export type UnsetMarker = { readonly __brand: 'UnsetMarker' };

/** Marker to enforce middleware returns next() result */
export type MiddlewareMarker = { readonly __brand: 'MiddlewareMarker' };

// =============================================================================
// Type Utilities
// =============================================================================

/** Flatten intersection types for better IDE display */
export type Simplify<T> = { [K in keyof T]: T[K] } & {};

/**
 * Merge context types - preserves existing properties while adding new ones
 * - If TWith is UnsetMarker, returns TType unchanged
 * - If TType is UnsetMarker, returns TWith (no __brand leakage)
 * - Otherwise, merges with TWith properties taking precedence
 */
export type Overwrite<TType, TWith> = TWith extends UnsetMarker
  ? TType
  : TType extends UnsetMarker
    ? TWith
    : TWith extends object
      ? Simplify<Omit<TType, keyof TWith> & TWith>
      : TType;

/** Resolve type only if it's not UnsetMarker */
export type ResolveIfSet<T, TFallback> = T extends UnsetMarker ? TFallback : T;

/**
 * Merge two ZodObject types into a single ZodObject with combined shape
 * Used for chained .input() calls
 */
export type MergeZodObjects<T, U> =
  T extends z.ZodObject<infer A>
    ? U extends z.ZodObject<infer B>
      ? z.ZodObject<Simplify<A & B>>
      : T
    : T;

/**
 * Intersect two types, handling UnsetMarker and ZodObject merging
 * - If TType is UnsetMarker, returns TWith
 * - If TWith is UnsetMarker, returns TType
 * - If both are ZodObjects, merges their shapes into a new ZodObject
 * - Otherwise, returns the intersection simplified
 */
export type IntersectIfDefined<TType, TWith> = TType extends UnsetMarker
  ? TWith
  : TWith extends UnsetMarker
    ? TType
    : MergeZodObjects<TType, TWith>;

// =============================================================================
// Middleware Types
// =============================================================================

/** Result wrapper that enforces middleware returns next() */
export type MiddlewareResult<TContext> = {
  readonly marker: MiddlewareMarker;
  ctx: TContext;
};

/** Next function overloads - key to automatic context inference */
export type MiddlewareNext<TContextOverridesIn> = {
  /** Continue without modification - passes through existing overrides */
  (): Promise<MiddlewareResult<TContextOverridesIn>>;
  /** Continue with modified context - $ContextOverride is inferred from the object literal */
  <$ContextOverride>(opts: {
    ctx: $ContextOverride;
  }): Promise<MiddlewareResult<$ContextOverride>>;
};

/**
 * Middleware function signature
 * $ContextOverridesOut is inferred from what next() returns, not specified upfront
 */
export type MiddlewareFunction<
  TContext,
  TMeta,
  TContextOverridesIn,
  $ContextOverridesOut,
> = (opts: {
  ctx: Simplify<Overwrite<TContext, TContextOverridesIn>>;
  meta: TMeta;
  next: MiddlewareNext<TContextOverridesIn>;
}) => Promise<MiddlewareResult<$ContextOverridesOut>>;

/** Stored middleware with type info erased for runtime */
export type AnyMiddleware = MiddlewareFunction<any, any, any, any>;

/**
 * Middleware builder for creating reusable, composable middleware chains
 * Similar to tRPC's MiddlewareBuilder
 * TContext is contravariant (in) so MiddlewareBuilder<object> is assignable to MiddlewareBuilder<SpecificCtx>
 */
// @ts-expect-error Variance annotation conflicts with pipe's return type, but needed for middleware composition
export type MiddlewareBuilder<in TContext, TMeta, $ContextOverridesOut> = {
  /** Internal array of middleware functions */
  _middlewares: AnyMiddleware[];
  /** Chain another middleware to this builder */
  pipe<$NewContextOverrides>(
    fn: MiddlewareFunction<
      TContext,
      TMeta,
      $ContextOverridesOut,
      $NewContextOverrides
    >
  ): MiddlewareBuilder<
    TContext,
    TMeta,
    Overwrite<$ContextOverridesOut, $NewContextOverrides>
  >;
};

/** Type-erased middleware builder for runtime */
export type AnyMiddlewareBuilder = MiddlewareBuilder<any, any, any>;
