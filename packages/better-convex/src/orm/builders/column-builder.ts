/**
 * Column Builder - Base abstract class for all column builders
 *
 * Follows Drizzle ORM pattern:
 * - Phantom `_` property for type-level metadata (never instantiated)
 * - Runtime `config` object for actual state
 * - Chaining methods return branded types
 * - entityKind symbol for runtime type checking
 *
 * @example
 * text().notNull() → ConvexTextBuilder with { notNull: true }
 * integer().default(0) → ConvexIntegerBuilder with { hasDefault: true }
 */

import type { Validator } from 'convex/values';
import type { Simplify } from '../../internal/types';

/**
 * Core data types supported by column builders
 * Maps to Convex types: string, number (float64), boolean, bigint (int64)
 */
export type ColumnDataType = 'string' | 'number' | 'boolean' | 'bigint';

/**
 * Base configuration for all column builders
 * Stores type-level metadata extracted by TypeScript
 * Matches Drizzle's ColumnBuilderBaseConfig structure
 */
export interface ColumnBuilderBaseConfig<
  TDataType extends ColumnDataType,
  TColumnType extends string,
> {
  name: string;
  dataType: TDataType; // 'string' | 'number' | 'boolean' | 'bigint'
  columnType: TColumnType; // 'ConvexText' | 'ConvexInteger' | etc.
  data: unknown; // Actual TypeScript type (string, number, boolean, bigint)
  driverParam: unknown; // Driver-specific parameter type (for Drizzle compatibility)
  enumValues: string[] | undefined; // Enum values if applicable
}

/**
 * Runtime configuration stored in builder instance
 * Updated by chaining methods (.notNull(), .default(), etc.)
 */
export interface ColumnBuilderRuntimeConfig<TData> {
  name: string;
  notNull: boolean;
  default: TData | undefined;
  hasDefault: boolean;
  primaryKey: boolean;
  dataType: string;
  columnType: string;
}

/**
 * Phantom type configuration - never instantiated, just for TypeScript
 * Tracks type-level state through method chaining
 * Matches Drizzle's exact structure
 */
export type ColumnBuilderTypeConfig<
  T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
  TTypeConfig extends object,
> = Simplify<
  {
    brand: 'ColumnBuilder';
    name: T['name'];
    dataType: T['dataType'];
    columnType: T['columnType'];
    data: T['data'];
    driverParam: T['driverParam'];
    notNull: T extends { notNull: infer U } ? U : boolean; // Conditional inference
    hasDefault: T extends { hasDefault: infer U } ? U : boolean; // Conditional inference
    isPrimaryKey: T extends { isPrimaryKey: infer U } ? U : boolean; // Conditional inference (Drizzle uses 'identity' but we use isPrimaryKey)
    enumValues: T['enumValues'];
  } & TTypeConfig
>;

/**
 * entityKind symbol for runtime type checking
 * Following Drizzle's pattern for type guards
 */
export const entityKind = Symbol.for('better-convex:entityKind');

export interface DrizzleEntity {
  [entityKind]: string;
}

/**
 * ColumnBuilderBase interface - defines the phantom _ property
 * This interface is crucial for proper type intersection with NotNull/HasDefault/etc.
 */
export interface ColumnBuilderBase<
  T extends ColumnBuilderBaseConfig<
    ColumnDataType,
    string
  > = ColumnBuilderBaseConfig<ColumnDataType, string>,
  TTypeConfig extends object = object,
> {
  _: ColumnBuilderTypeConfig<T, TTypeConfig>;
}

/**
 * Base ColumnBuilder abstract class
 *
 * All column builders inherit from this class.
 * Implements chaining methods and stores runtime config.
 */
export abstract class ColumnBuilder<
  T extends ColumnBuilderBaseConfig<
    ColumnDataType,
    string
  > = ColumnBuilderBaseConfig<ColumnDataType, string>,
  TRuntimeConfig extends object = object,
  TTypeConfig extends object = object,
> implements ColumnBuilderBase<T, TTypeConfig>, DrizzleEntity
{
  static readonly [entityKind]: string = 'ColumnBuilder';
  readonly [entityKind]: string = 'ColumnBuilder';

  /**
   * Phantom property - never instantiated, just for types
   * Accumulates type info through method chaining
   */
  declare _: ColumnBuilderTypeConfig<T, TTypeConfig>;

  /**
   * Runtime configuration - actual mutable state
   */
  protected config: ColumnBuilderRuntimeConfig<T['data']> & TRuntimeConfig;

  constructor(
    name: T['name'],
    dataType: T['dataType'],
    columnType: T['columnType']
  ) {
    this.config = {
      name,
      notNull: false,
      default: undefined,
      hasDefault: false,
      primaryKey: false,
      dataType,
      columnType,
    } as ColumnBuilderRuntimeConfig<T['data']> & TRuntimeConfig;
  }

  /**
   * Mark column as NOT NULL
   * Returns type-branded instance with notNull: true
   */
  notNull(): NotNull<this> {
    this.config.notNull = true;
    return this as NotNull<this>;
  }

  /**
   * Set default value for column
   * Makes field optional on insert
   */
  default(value: T['data']): HasDefault<this> {
    this.config.default = value;
    this.config.hasDefault = true;
    return this as HasDefault<this>;
  }

  /**
   * Mark column as primary key
   * Implies NOT NULL
   */
  primaryKey(): IsPrimaryKey<NotNull<this>> {
    this.config.primaryKey = true;
    this.config.notNull = true;
    return this as IsPrimaryKey<NotNull<this>>;
  }

  /**
   * Build method - must be implemented by subclasses
   * Compiles builder to Convex validator
   *
   * @returns Convex validator for this column
   */
  abstract build(): Validator<any, any, any>;
}

/**
 * Type utilities for phantom type branding
 * Drizzle's EXACT pattern - verified working
 */

/**
 * Brand a builder as NOT NULL
 * Removes | null from extracted type
 */
export type NotNull<T extends ColumnBuilderBase> = T & {
  _: {
    notNull: true;
  };
};

/**
 * Brand a builder with a default value
 * Makes field optional on insert
 */
export type HasDefault<T extends ColumnBuilderBase> = T & {
  _: {
    hasDefault: true;
  };
};

/**
 * Brand a builder as a primary key
 * Implies NOT NULL
 */
export type IsPrimaryKey<T extends ColumnBuilderBase> = T & {
  _: {
    isPrimaryKey: true;
    notNull: true;
  };
};
