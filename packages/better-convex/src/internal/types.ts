/**
 * Useful utility types for Convex + TanStack Query integration.
 * Inspired by tRPC's internal types.
 */

/** @public */
export type Maybe<TType> = TType | null | undefined;

/**
 * Simplify complex type intersections for better IDE display.
 * @see https://github.com/ianstormtaylor/superstruct/blob/7973400cd04d8ad92bbdc2b6f35acbfb3c934079/src/utils.ts#L323-L325
 */
export type Simplify<TType> = TType extends any[] | Date
  ? TType
  : { [K in keyof TType]: TType[K] };

/** @public */
export type MaybePromise<TType> = Promise<TType> | TType;

/**
 * Omit keys without removing a potential union.
 * Unlike standard Omit, this preserves union types.
 */
export type DistributiveOmit<TObj, TKey extends keyof any> = TObj extends any
  ? Omit<TObj, TKey>
  : never;

/** Makes the object recursively optional */
export type DeepPartial<TObject> = TObject extends object
  ? { [P in keyof TObject]?: DeepPartial<TObject[P]> }
  : TObject;

/** Unwrap return type if function, else use type as is */
export type Unwrap<TType> = TType extends (...args: any[]) => infer R
  ? Awaited<R>
  : TType;
