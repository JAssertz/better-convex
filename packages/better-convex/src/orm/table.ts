import type { Validator } from 'convex/values';
import { v } from 'convex/values';
import type {
  GenericTableIndexes,
  GenericTableSearchIndexes,
  GenericTableVectorIndexes,
  TableDefinition,
} from 'convex/server';
import type { ColumnBuilder } from './builders/column-builder';
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
 * Create a Convex object validator from column builders
 *
 * Extracts .convexValidator from each column and creates v.object({...})
 * This is the core factory that bridges ORM columns to Convex validators.
 *
 * @param columns - Record of column name to column builder
 * @returns Convex object validator
 */
function createValidatorFromColumns(
  columns: Record<string, ColumnBuilder<any, any, any>>
): Validator<any, any, any> {
  const validatorFields = Object.fromEntries(
    Object.entries(columns).map(([key, builder]) => [
      key,
      (builder as any).convexValidator,
    ])
  );
  return v.object(validatorFields);
}

/**
 * Configuration for a Convex table
 * Only supports column builders (text(), integer(), etc.)
 *
 * CRITICAL: No extends constraint on TColumns to avoid type widening (convex-ents pattern)
 */
export interface TableConfig<
  TName extends string = string,
  TColumns = Record<string, ColumnBuilder<any, any, any>>,
> {
  name: TName;
  columns: TColumns;
}

/**
 * ConvexTable implementation class
 * Provides all properties required by Convex's TableDefinition
 *
 * Following convex-ents pattern:
 * - Private fields for indexes (matches TableDefinition structure)
 * - Duck typing (defineSchema only checks object shape)
 * - Direct validator storage (no re-wrapping)
 */
class ConvexTableImpl<T extends TableConfig> {
  /**
   * Required by TableDefinition
   * Public validator property containing v.object({...}) with all column validators
   */
  validator: Validator<Record<string, any>, 'required', any>;

  /**
   * TableDefinition private fields
   * These satisfy structural typing requirements for defineSchema()
   */
  private indexes: any[] = [];
  private stagedDbIndexes: any[] = [];
  private searchIndexes: any[] = [];
  private stagedSearchIndexes: any[] = [];
  private vectorIndexes: any[] = [];
  private stagedVectorIndexes: any[] = [];

  /**
   * Symbol-based metadata storage
   */
  [TableName]: T['name'];
  [Columns]: T['columns'];
  [Brand] = 'ConvexTable' as const;

  /**
   * Public tableName for convenience
   */
  tableName: string;

  constructor(name: T['name'], columns: T['columns']) {
    validateTableName(name);

    this[TableName] = name;
    this[Columns] = columns;
    this.tableName = name;

    // Use factory to create validator from columns
    // This extracts .convexValidator from each builder and creates v.object({...})
    this.validator = createValidatorFromColumns(columns as any);
  }

  /**
   * Add index to table
   * Chainable method following Convex pattern
   *
   * @example
   * convexTable('users', { email: text() }).index('by_email', ['email'])
   */
  index<IndexName extends string>(name: IndexName, fields: string[]): this {
    this.indexes.push({ indexDescriptor: name, fields });
    return this;
  }

  // TODO: Implement searchIndex() and vectorIndex() methods when needed
}

/**
 * ConvexTable interface with type branding
 * Extends TableDefinition for schema compatibility
 * Adds phantom types for type inference
 */
export interface ConvexTable<
  T extends TableConfig,
  Indexes extends GenericTableIndexes = {},
  SearchIndexes extends GenericTableSearchIndexes = {},
  VectorIndexes extends GenericTableVectorIndexes = {},
> extends TableDefinition<
    Validator<any, any, any>,
    Indexes,
    SearchIndexes,
    VectorIndexes
  > {
  /**
   * Type brand for generic type extraction
   * Uses `declare readonly` to avoid runtime overhead
   */
  readonly _: {
    readonly brand: 'ConvexTable';
    readonly name: T['name'];
    readonly columns: T['columns'];
    readonly inferSelect: import('./types').InferSelectModel<ConvexTable<T>>;
    readonly inferInsert: import('./types').InferInsertModel<ConvexTable<T>>;
  };

  /**
   * Inferred types for select and insert operations
   * Following Drizzle's pattern: $inferSelect and $inferInsert properties
   */
  readonly $inferSelect: import('./types').InferSelectModel<ConvexTable<T>>;
  readonly $inferInsert: import('./types').InferInsertModel<ConvexTable<T>>;

  /**
   * Symbol-based metadata storage
   */
  [TableName]: T['name'];
  [Columns]: T['columns'];
  [Brand]: 'ConvexTable';

  /**
   * Convex schema validator
   */
  validator: Validator<any, any, any>;
  tableName: string;

  // Note: index(), searchIndex(), vectorIndex() methods inherited from TableDefinition
}

/**
 * Create a type-safe Convex table definition
 *
 * Uses Drizzle-style column builders:
 * - text().notNull(), integer(), boolean(), etc.
 *
 * @param name - Table name (must be valid Convex table name)
 * @param columns - Column builders
 * @returns ConvexTable instance compatible with defineSchema()
 *
 * @example
 * import { convexTable, text, integer } from 'better-convex/orm';
 *
 * const users = convexTable('users', {
 *   name: text().notNull(),
 *   email: text().notNull(),
 *   age: integer(),
 * });
 *
 * // Use in schema - works with defineSchema()
 * export default defineSchema({ users });
 *
 * // Extract types
 * type User = InferSelectModel<typeof users>;
 * type NewUser = InferInsertModel<typeof users>;
 *
 * // Chainable indexes
 * const usersWithIndex = convexTable('users', { email: text() })
 *   .index('by_email', ['email']);
 */
export function convexTable<
  TName extends string,
  TColumns extends Record<string, ColumnBuilder<any, any, any>>,
>(
  name: TName,
  columns: TColumns
): ConvexTable<{ name: TName; columns: TColumns }> {
  return new ConvexTableImpl(name, columns) as any;
}
