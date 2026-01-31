import type { Validator } from 'convex/values';
import { Brand, Columns, TableName } from './symbols';

/**
 * Reserved Convex system table names that cannot be used
 */
const RESERVED_TABLES = new Set(['_storage', '_scheduled_functions']);

/**
 * Valid table name pattern: starts with letter, contains only alphanumeric and underscore
 */
const TABLE_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/**
 * Validate table name against Convex constraints
 */
function validateTableName(name: string): void {
  if (RESERVED_TABLES.has(name)) {
    throw new Error(
      `Table name '${name}' is reserved. System tables cannot be redefined.`
    );
  }
  if (!TABLE_NAME_REGEX.test(name)) {
    throw new Error(
      `Invalid table name '${name}'. Must start with letter, contain only alphanumeric and underscore.`
    );
  }
}

/**
 * Configuration for a Convex table
 */
export interface TableConfig<
  TName extends string = string,
  TColumns extends Record<string, Validator<any, any, any>> = Record<
    string,
    Validator<any, any, any>
  >,
> {
  name: TName;
  columns: TColumns;
}

/**
 * ConvexTable class with symbol-based metadata and type branding
 *
 * @example
 * const users = convexTable('users', {
 *   name: v.string(),
 *   email: v.string(),
 * });
 */
export class ConvexTable<T extends TableConfig> {
  /**
   * Type brand for generic type extraction
   * Uses `declare readonly` to avoid runtime overhead
   */
  declare readonly _: {
    readonly brand: 'ConvexTable';
    readonly name: T['name'];
    readonly columns: T['columns'];
  };

  /**
   * Symbol-based metadata storage
   */
  [TableName]: T['name'];
  [Columns]: T['columns'];
  [Brand] = 'ConvexTable' as const;

  /**
   * Convex schema validator
   * Allows direct usage in defineSchema()
   */
  validator: Validator<any, any, any>;
  tableName: string;

  constructor(name: T['name'], columns: T['columns']) {
    validateTableName(name);

    this[TableName] = name;
    this[Columns] = columns;
    this.tableName = name;

    // Create object validator from columns for Convex schema compatibility
    // This allows convexTable() output to work directly with defineSchema()
    const { defineTable } = require('convex/server');
    this.validator = defineTable(columns).validator;
  }
}

/**
 * Create a type-safe Convex table definition
 *
 * @param name - Table name (must be valid Convex table name)
 * @param columns - Column validators using Convex v.* validators
 * @returns ConvexTable instance with type metadata
 *
 * @example
 * import { convexTable } from 'better-convex/orm';
 * import { v } from 'convex/values';
 *
 * const users = convexTable('users', {
 *   name: v.string(),
 *   email: v.string(),
 *   age: v.optional(v.number()),
 * });
 *
 * // Use in schema
 * export default defineSchema({ users });
 *
 * // Extract types
 * type User = InferSelectModel<typeof users>;
 * type NewUser = InferInsertModel<typeof users>;
 */
export function convexTable<
  TName extends string,
  TColumns extends Record<string, Validator<any, any, any>>,
>(
  name: TName,
  columns: TColumns
): ConvexTable<{ name: TName; columns: TColumns }> {
  return new ConvexTable(name, columns) as any;
}
