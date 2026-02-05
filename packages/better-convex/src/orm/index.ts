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
 * Milestone 2 (M2): Relations Layer (v1)
 * @example
 * import { defineRelations } from 'better-convex/orm';
 *
 * const relations = defineRelations({ users, posts }, (r) => ({
 *   posts: {
 *     author: r.one.users({ from: r.posts.authorId, to: r.users._id }),
 *   },
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
 * const activeAdults = await db.query.users.findMany({
 *   where: {
 *     status: { in: ['active', 'pending'] },
 *     age: { gt: 18 },
 *   },
 * });
 */

export type {
  DefineSchemaOptions,
  GenericSchema,
  SchemaDefinition,
} from 'convex/server';
// M6: Column Builders (Drizzle-style)
export type {
  ColumnBuilder,
  ColumnBuilderBaseConfig,
  ColumnBuilderRuntimeConfig,
  ColumnBuilderTypeConfig,
  ColumnBuilderWithTableName,
  ColumnDataType,
  ConvexBigIntBuilder,
  ConvexBigIntBuilderInitial,
  ConvexBooleanBuilder,
  ConvexBooleanBuilderInitial,
  ConvexBytesBuilder,
  ConvexBytesBuilderInitial,
  ConvexCustomBuilder,
  ConvexCustomBuilderInitial,
  ConvexIdBuilder,
  ConvexIdBuilderInitial,
  ConvexNumberBuilder,
  ConvexNumberBuilderInitial,
  ConvexTextBuilder,
  ConvexTextBuilderInitial,
  ConvexTextEnumBuilder,
  ConvexTextEnumBuilderInitial,
  ConvexVectorBuilder,
  ConvexVectorBuilderInitial,
  DrizzleEntity,
  HasDefault,
  IsPrimaryKey,
  IsUnique,
  NotNull,
  SystemFields,
} from './builders';
export {
  bigint,
  boolean,
  bytes,
  ConvexColumnBuilder,
  custom,
  entityKind,
  id,
  integer,
  json,
  number,
  text,
  textEnum,
  vector,
} from './builders';
export {
  type ConvexCheckBuilder,
  type ConvexCheckConfig,
  type ConvexForeignKeyBuilder,
  type ConvexForeignKeyConfig,
  type ConvexUniqueConstraintBuilder,
  type ConvexUniqueConstraintBuilderOn,
  type ConvexUniqueConstraintConfig,
  check,
  foreignKey,
  unique,
} from './constraints';
export type {
  CreateDatabaseOptions,
  DatabaseWithMutations,
  DatabaseWithQuery,
  DatabaseWithSkipRules,
} from './database';
// M3: Database Context
export { buildSchema, createDatabase } from './database';
export { ConvexDeleteBuilder } from './delete';
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
// M5: String Operators
export {
  and,
  contains,
  endsWith,
  eq,
  fieldRef,
  gt,
  gte,
  ilike,
  inArray,
  isFieldReference,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  not,
  notInArray,
  or,
  startsWith,
} from './filter-expression';
// M1: Index Builders (Drizzle-style)
export {
  type ConvexIndexBuilder,
  type ConvexIndexBuilderOn,
  type ConvexSearchIndexBuilder,
  type ConvexSearchIndexBuilderOn,
  type ConvexSearchIndexConfig,
  type ConvexVectorIndexBuilder,
  type ConvexVectorIndexBuilderOn,
  type ConvexVectorIndexConfig,
  index,
  searchIndex,
  uniqueIndex,
  vectorIndex,
} from './indexes';
export { ConvexInsertBuilder } from './insert';
export {
  getTableColumns,
  getTableConfig,
  type TableConfigResult,
} from './introspection';
// M5: OrderBy
export { asc, desc } from './order-by';
export {
  getPage,
  type IndexKey as PaginationIndexKey,
  type PageRequest,
  type PageResponse,
  paginator,
} from './pagination';
export { GelRelationalQuery } from './query';
// M3: Query Builder
export { RelationalQueryBuilder } from './query-builder';
export { QueryPromise } from './query-promise';
export type {
  ExtractTablesWithRelations,
  ManyConfig,
  OneConfig,
  RelationsBuilder,
  RelationsBuilderColumnBase,
  RelationsBuilderColumnConfig,
  TableRelationalConfig,
  TablesRelationalConfig,
} from './relations';
// M2: Relations Layer (v1)
export { defineRelations, defineRelationsPart } from './relations';
// RLS (Row-Level Security)
export type {
  RlsPolicyConfig,
  RlsPolicyToOption,
} from './rls/policies';
export { RlsPolicy, rlsPolicy } from './rls/policies';
export type { RlsRoleConfig } from './rls/roles';
export { RlsRole, rlsRole } from './rls/roles';
export type { RlsContext, RlsMode } from './rls/types';
export {
  type ScheduledDeleteArgs,
  scheduledDeleteFactory,
} from './scheduled-delete';
export { defineSchema } from './schema';
// Streams + pagination (native fork of convex-helpers)
export {
  type IndexKey as StreamIndexKey,
  mergedStream,
  type QueryStream,
  StreamDatabaseReader,
  stream,
  streamIndexRange,
} from './stream';
// M1: Schema Foundation
export {
  Brand,
  Columns,
  Relations as RelationsSymbol,
  TableName,
} from './symbols';
export type { ConvexTable, TableConfig } from './table';
export { convexTable } from './table';
// M3: Query Builder Types
export type {
  BuildQueryResult,
  BuildRelationResult,
  DBQueryConfig,
  FilterOperators,
  GetColumnData,
  InferInsertModel,
  InferModelFromColumns,
  InferSelectModel,
  InsertValue,
  MutationResult,
  MutationReturning,
  OrderByClause,
  OrderDirection,
  ReturningAll,
  ReturningResult,
  ReturningSelection,
  UpdateSet,
} from './types';
export { ConvexUpdateBuilder } from './update';
// M4: Where Clause Compiler
export type { WhereClauseResult } from './where-clause-compiler';
export { WhereClauseCompiler } from './where-clause-compiler';
