/**
 * Query Compiler - Translate query config to Convex expressions
 *
 * Converts Drizzle-style query configuration into Convex query API calls
 */

import type { Expression } from 'convex/server';
import type { Validator } from 'convex/values';

/**
 * Filter function type - receives columns and operators
 */
export type FilterFunction<
  TColumns extends Record<string, Validator<any, any, any>>,
> = (
  columns: TColumns,
  operators: FilterOperators
) => Expression<boolean> | undefined;

/**
 * Filter operators for where clause
 * Maps to Convex query filter expressions
 */
export interface FilterOperators {
  eq: <T>(field: T, value: T) => Expression<boolean>;
  ne: <T>(field: T, value: T) => Expression<boolean>;
  gt: <T>(field: T, value: T) => Expression<boolean>;
  gte: <T>(field: T, value: T) => Expression<boolean>;
  lt: <T>(field: T, value: T) => Expression<boolean>;
  lte: <T>(field: T, value: T) => Expression<boolean>;
}

/**
 * Compile where clause function to Convex filter expression
 *
 * @param whereFunc - User-provided where function
 * @param columns - Table columns
 * @returns Convex filter expression or undefined
 */
export function compileWhereClause<
  TColumns extends Record<string, Validator<any, any, any>>,
>(
  whereFunc: FilterFunction<TColumns> | undefined,
  columns: TColumns
): Expression<boolean> | undefined {
  if (!whereFunc) return;

  // Create operators that just pass through field and value
  // The user's where function will use Convex's q.eq() etc directly
  const operators: FilterOperators = {
    eq: (field, value) => ({ field, value, op: 'eq' }) as any,
    ne: (field, value) => ({ field, value, op: 'ne' }) as any,
    gt: (field, value) => ({ field, value, op: 'gt' }) as any,
    gte: (field, value) => ({ field, value, op: 'gte' }) as any,
    lt: (field, value) => ({ field, value, op: 'lt' }) as any,
    lte: (field, value) => ({ field, value, op: 'lte' }) as any,
  };

  return whereFunc(columns, operators);
}

/**
 * Order direction helpers
 */
export interface OrderDirection {
  asc: <T>(field: T) => { field: T; direction: 'asc' };
  desc: <T>(field: T) => { field: T; direction: 'desc' };
}

/**
 * Order function type - receives columns and direction helpers
 */
export type OrderFunction<
  TColumns extends Record<string, Validator<any, any, any>>,
> = (
  columns: TColumns,
  direction: OrderDirection
) => { field: any; direction: 'asc' | 'desc' } | undefined;

/**
 * Compile orderBy clause to field and direction
 *
 * @param orderFunc - User-provided orderBy function
 * @param columns - Table columns
 * @returns Order configuration or undefined
 */
export function compileOrderBy<
  TColumns extends Record<string, Validator<any, any, any>>,
>(
  orderFunc: OrderFunction<TColumns> | undefined,
  columns: TColumns
): { field: string; direction: 'asc' | 'desc' } | undefined {
  if (!orderFunc) return;

  const direction: OrderDirection = {
    asc: (field) => ({ field, direction: 'asc' as const }),
    desc: (field) => ({ field, direction: 'desc' as const }),
  };

  return orderFunc(columns, direction);
}
