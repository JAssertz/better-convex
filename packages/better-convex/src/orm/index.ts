/**
 * Better Convex ORM - Drizzle-inspired schema definitions for Convex
 *
 * @example
 * import { convexTable, InferSelectModel, InferInsertModel } from 'better-convex/orm';
 * import { v } from 'convex/values';
 *
 * const users = convexTable('users', {
 *   name: v.string(),
 *   email: v.string(),
 * });
 *
 * type User = InferSelectModel<typeof users>;
 * type NewUser = InferInsertModel<typeof users>;
 */

export { Brand, Columns, TableName } from './symbols';
export type { TableConfig } from './table';
export { ConvexTable, convexTable } from './table';
export type { InferInsertModel, InferSelectModel } from './types';
