/**
 * Better Convex ORM - Drizzle-inspired schema definitions for Convex
 *
 * Milestone 1 (M1): Schema Foundation
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
 *
 * Milestone 2 (M2): Relations Layer
 * @example
 * import { relations } from 'better-convex/orm';
 *
 * const usersRelations = relations(users, ({ one, many }) => ({
 *   profile: one(profiles),
 *   posts: many(posts),
 * }));
 *
 * Milestone 3 (M3): Query Builder - Read Operations
 * @example
 * import { createDatabase } from 'better-convex/orm';
 *
 * const db = createDatabase(ctx.db, schema, edges);
 * const users = await db.query.users.findMany({
 *   with: { posts: { limit: 5 } }
 * });
 *
 * Milestone 4 (M4): Query Builder - Where Filtering
 * @example
 * import { eq, and, gt, inArray } from 'better-convex/orm';
 *
 * const activeAdults = await db.query.users.findMany({
 *   where: (cols, { eq, gt, inArray }) =>
 *     and(
 *       inArray(cols.status, ['active', 'pending']),
 *       gt(cols.age, 18)
 *     )
 * });
 */

// M6: Column Builders (Drizzle-style)
export type {
  ColumnBuilder,
  ColumnBuilderBaseConfig,
  ColumnBuilderRuntimeConfig,
  ColumnBuilderTypeConfig,
  ColumnDataType,
  ConvexBigIntBuilder,
  ConvexBigIntBuilderInitial,
  ConvexBooleanBuilder,
  ConvexBooleanBuilderInitial,
  ConvexIdBuilder,
  ConvexIdBuilderInitial,
  ConvexNumberBuilder,
  ConvexNumberBuilderInitial,
  ConvexTextBuilder,
  ConvexTextBuilderInitial,
  DrizzleEntity,
  HasDefault,
  IsPrimaryKey,
  NotNull,
} from './builders';
export {
  bigint,
  boolean,
  ConvexColumnBuilder,
  entityKind,
  id,
  integer,
  number,
  text,
} from './builders';
export type { DatabaseWithQuery } from './database';
// M3: Database Context
export { buildSchema, createDatabase } from './database';
export type { EdgeMetadata } from './extractRelationsConfig';
// M2: Schema Extraction
export { extractRelationsConfig } from './extractRelationsConfig';
// M4: Filter Expressions
export type {
  BinaryExpression,
  ExpressionVisitor,
  FieldReference,
  FilterExpression,
  LogicalExpression,
  UnaryExpression,
} from './filter-expression';
export {
  and,
  eq,
  fieldRef,
  gt,
  gte,
  inArray,
  isFieldReference,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  not,
  notInArray,
  or,
} from './filter-expression';
export { GelRelationalQuery } from './query';
// M3: Query Builder
export { RelationalQueryBuilder } from './query-builder';
export { QueryPromise } from './query-promise';
export type { OneConfig, RelationHelpers } from './relations';
// M2: Relations Layer
export {
  createMany,
  createOne,
  Many,
  One,
  Relation,
  Relations,
  relations,
  validateRelationName,
} from './relations';
// M1: Schema Foundation
export {
  Brand,
  Columns,
  Relations as RelationsSymbol,
  TableName,
} from './symbols';
export type { TableConfig, ConvexTable } from './table';
export { convexTable } from './table';
// M3: Query Builder Types
export type {
  BuildQueryResult,
  BuildRelationResult,
  DBQueryConfig,
  ExtractTablesWithRelations,
  FilterOperators,
  InferInsertModel,
  InferModelFromColumns,
  InferRelations,
  InferSelectModel,
  OrderDirection,
  TableRelationalConfig,
  TablesRelationalConfig,
} from './types';
// M4: Where Clause Compiler
export type { WhereClauseResult } from './where-clause-compiler';
export { WhereClauseCompiler } from './where-clause-compiler';
