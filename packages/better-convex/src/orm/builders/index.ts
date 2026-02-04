/**
 * Column Builders - Public API
 *
 * Drizzle-style column builders for Convex schemas.
 * Export all builder classes and factory functions.
 */

// BigInt builder
export {
  bigint,
  ConvexBigIntBuilder,
  type ConvexBigIntBuilderInitial,
} from './bigint';
// Boolean builder
export {
  boolean,
  ConvexBooleanBuilder,
  type ConvexBooleanBuilderInitial,
} from './boolean';
// Base classes
export {
  ColumnBuilder,
  type ColumnBuilderBaseConfig,
  type ColumnBuilderRuntimeConfig,
  type ColumnBuilderTypeConfig,
  type ColumnBuilderWithTableName,
  type ColumnDataType,
  type DrizzleEntity,
  entityKind,
  type HasDefault,
  type IsUnique,
  type IsPrimaryKey,
  type NotNull,
} from './column-builder';
export { ConvexColumnBuilder } from './convex-column-builder';
// ID builder (Convex-specific)
export {
  ConvexIdBuilder,
  type ConvexIdBuilderInitial,
  id,
} from './id';
// Number builders (number + integer alias)
export {
  ConvexNumberBuilder,
  type ConvexNumberBuilderInitial,
  integer,
  number,
} from './number';
// System fields
export {
  ConvexSystemCreationTimeBuilder,
  ConvexSystemIdBuilder,
  createSystemFields,
  type SystemFields,
} from './system-fields';
// Text builder
export {
  ConvexTextBuilder,
  type ConvexTextBuilderInitial,
  text,
} from './text';
// Vector builder (Convex vector search)
export {
  ConvexVectorBuilder,
  type ConvexVectorBuilderInitial,
  vector,
} from './vector';
