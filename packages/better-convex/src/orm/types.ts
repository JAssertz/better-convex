import type { GenericId, Validator } from 'convex/values';
import type { Simplify } from '../internal/types';
import type { ConvexTable } from './table';

/**
 * Extract full document type from a ConvexTable (includes system fields)
 *
 * @example
 * const users = convexTable('users', { name: v.string() });
 * type User = InferSelectModel<typeof users>;
 * // → { _id: Id<'users'>, _creationTime: number, name: string }
 */
export type InferSelectModel<TTable extends ConvexTable<any>> = Simplify<
  {
    _id: GenericId<TTable['_']['name']>;
    _creationTime: number;
  } & ValidatorsToType<TTable['_']['columns']>
>;

/**
 * Extract insert type from a ConvexTable (excludes system fields)
 *
 * @example
 * const users = convexTable('users', { name: v.string() });
 * type NewUser = InferInsertModel<typeof users>;
 * // → { name: string }
 */
export type InferInsertModel<TTable extends ConvexTable<any>> = Simplify<
  ValidatorsToType<TTable['_']['columns']>
>;

/**
 * Recursively extract types from validator object
 */
type ValidatorsToType<T> = {
  [K in keyof T as T[K] extends Validator<any, 'optional', any>
    ? K
    : K extends string
      ? K
      : never]: ValidatorToType<T[K]>;
} & {
  [K in keyof T as T[K] extends Validator<any, 'optional', any>
    ? K
    : never]?: ValidatorToType<T[K]>;
};

/**
 * Extract TypeScript type from a single Convex validator
 */
type ValidatorToType<V> = V extends Validator<infer T, any, any> ? T : never;
