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
// Bytes builder
export {
  bytes,
  ConvexBytesBuilder,
  type ConvexBytesBuilderInitial,
} from './bytes';
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
  type IsPrimaryKey,
  type IsUnique,
  type NotNull,
} from './column-builder';
export { ConvexColumnBuilder } from './convex-column-builder';
// Custom builder
export {
  ConvexCustomBuilder,
  type ConvexCustomBuilderInitial,
  custom,
  json,
} from './custom';
// ID builder (Convex-specific)
export {
  ConvexIdBuilder,
  type ConvexIdBuilderInitial,
  id,
} from './id';
// Number builder
export {
  ConvexNumberBuilder,
  type ConvexNumberBuilderInitial,
  integer,
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
export {
  ConvexTextEnumBuilder,
  type ConvexTextEnumBuilderInitial,
  textEnum,
} from './text-enum';
// Vector builder (Convex vector search)
export {
  ConvexVectorBuilder,
  type ConvexVectorBuilderInitial,
  vector,
} from './vector';
