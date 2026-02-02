/**
 * Drizzle-style relation definitions for Convex ORM
 *
 * Implements the verified Drizzle pattern:
 * - Runtime: Stores actual table instances for validation
 * - Compile-time: Uses string generics for type inference
 * - Field names set via withFieldName() after construction
 */

import { Relations as RelationsSymbol, TableName } from './symbols';
import type { ConvexTable } from './table';

/**
 * Valid relation name pattern: same as table names
 */
const RELATION_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/**
 * Validate relation name against naming constraints
 * Prevents injection and ensures valid JavaScript identifiers
 */
export function validateRelationName(name: string): void {
  if (!RELATION_NAME_REGEX.test(name)) {
    throw new Error(
      `Invalid relation name '${name}'. Must start with letter, contain only alphanumeric and underscore.`
    );
  }
}

/**
 * Base Relation class - modified to preserve full table type
 *
 * @template TTable - The full referenced table type (preserves columns for type inference)
 */
export abstract class Relation<
  TTable extends ConvexTable<any> = ConvexTable<any>,
> {
  /**
   * Compile-time only property for type inference
   * Stores the full table type to preserve column information
   */
  declare readonly _referencedTable: TTable;

  /**
   * Table name extracted from referenced table
   * Real property (not phantom) for type inference
   * Following Drizzle's pattern: allows BuildRelationResult to access table name
   */
  readonly referencedTableName: TTable['_']['name'];

  /**
   * Field name - set later via withFieldName()
   * Called automatically by relations() wrapper
   */
  fieldName = '';

  /**
   * Runtime reference to source table instance
   * Used for validation and metadata access
   */
  readonly sourceTable: ConvexTable<any>;

  /**
   * Runtime reference to target table instance
   * Full type preserved in TTable generic
   */
  readonly referencedTable: TTable;

  /**
   * Optional relation name for disambiguation
   * Required when multiple relations exist between same tables
   */
  readonly relationName: string | undefined;

  constructor(
    sourceTable: ConvexTable<any>,
    referencedTable: TTable,
    relationName: string | undefined
  ) {
    this.sourceTable = sourceTable;
    this.referencedTable = referencedTable;
    this.relationName = relationName;
    // Extract table name from symbol-based metadata
    this.referencedTableName = referencedTable[
      TableName
    ] as TTable['_']['name'];
  }

  /**
   * Set field name after construction
   * CRITICAL: Called by relations() wrapper to bind relation names
   *
   * @param fieldName - The relation's field name from object key
   * @returns this (for method chaining)
   */
  abstract withFieldName(fieldName: string): Relation<TTable>;
}

/**
 * Configuration for one() relation (one-to-one or many-to-one)
 */
export interface OneConfig {
  /** Optional explicit field specification */
  fields?: string[];
  /** Optional explicit reference specification */
  references?: string[];
  /** Relation name for disambiguation */
  relationName?: string;
  /** Cascade deletion behavior */
  onDelete?: 'cascade' | 'setNull' | 'restrict';
  /** Whether relation is optional */
  optional?: boolean;
}

/**
 * One relation - represents one-to-one or many-to-one
 *
 * @template TTable - Referenced table (full type with columns)
 * @template TIsNullable - Whether the relation is nullable
 *
 * @example
 * one(profiles) // Infers nullability from field
 * one(profiles, { fields: [users.profileId], references: [profiles.id] })
 */
export class One<
  TTable extends ConvexTable<any> = ConvexTable<any>,
  TIsNullable extends boolean = boolean,
> extends Relation<TTable> {
  /**
   * Optional config - only needed for explicit field/reference specification
   * If omitted, field name inferred from relation name + 'Id'
   */
  readonly config?: OneConfig;

  /**
   * Computed from field nullability
   * Used for type inference (T | null vs T)
   */
  readonly isNullable?: TIsNullable;

  constructor(
    sourceTable: ConvexTable<any>,
    referencedTable: TTable,
    config?: OneConfig,
    isNullable?: TIsNullable
  ) {
    super(sourceTable, referencedTable, config?.relationName);
    this.config = config;
    this.isNullable = isNullable;
  }

  /**
   * Set field name and return typed instance
   */
  withFieldName(fieldName: string): One<TTable, TIsNullable> {
    this.fieldName = fieldName;
    return this;
  }
}

/**
 * Many relation - represents one-to-many
 *
 * @template TTable - Referenced table (full type with columns)
 *
 * @example
 * many(posts) // Simple one-to-many
 * many(posts, { relationName: 'authoredPosts' }) // With disambiguation
 */
export class Many<
  TTable extends ConvexTable<any> = ConvexTable<any>,
> extends Relation<TTable> {
  /**
   * Config - only allows relationName for disambiguation
   * Other config (fields/references) not needed for many() relations
   */
  readonly config?: { relationName?: string };

  constructor(
    sourceTable: ConvexTable<any>,
    referencedTable: TTable,
    config?: { relationName?: string }
  ) {
    super(sourceTable, referencedTable, config?.relationName);
    this.config = config;
  }

  /**
   * Set field name and return typed instance
   */
  withFieldName(fieldName: string): Many<TTable> {
    this.fieldName = fieldName;
    return this;
  }
}

/**
 * Relations wrapper class - stores relation definitions on a table
 *
 * @template TTable - Source table type
 * @template TConfig - Relations configuration object (return type of callback)
 *
 * Following Drizzle's pattern: stores the callback function to preserve types
 */
export class Relations<
  TTable extends ConvexTable<any>,
  TConfig = Record<string, Relation<any>>,
> {
  /**
   * Phantom type property for type extraction
   * Allows TypeScript to extract TConfig without confusion
   */
  declare readonly _config: TConfig;

  /**
   * Symbol-based storage for runtime access
   */
  [RelationsSymbol]: any;

  readonly table: TTable;
  readonly config: (helpers: RelationHelpers) => TConfig;

  constructor(table: TTable, config: (helpers: RelationHelpers) => TConfig) {
    this.table = table;
    this.config = config;
  }
}

/**
 * Helper type for relation helper functions
 */
export interface RelationHelpers {
  one: ReturnType<typeof createOne>;
  many: ReturnType<typeof createMany>;
}

/**
 * Create a one() helper factory with source table context
 * Higher-order function pattern from Drizzle
 *
 * @param sourceTable - The table that owns this relation
 * @returns one() helper function with source table injected
 */
export function createOne(sourceTable: ConvexTable<any>) {
  return function one<TTargetTable extends ConvexTable<any>>(
    targetTable: TTargetTable,
    config?: OneConfig
  ): One<TTargetTable, boolean> {
    // SECURITY: Validate relation name if provided
    if (config?.relationName) {
      validateRelationName(config.relationName);
    }

    // Compute nullability from config.fields if provided
    // TODO: Check each field's notNull property from validator
    // For now, always nullable until we implement field introspection
    const isNullable = true;

    return new One(sourceTable, targetTable, config, isNullable);
  };
}

/**
 * Create a many() helper factory with source table context
 * Higher-order function pattern from Drizzle
 *
 * @param sourceTable - The table that owns this relation
 * @returns many() helper function with source table injected
 */
export function createMany(sourceTable: ConvexTable<any>) {
  return function many<TTargetTable extends ConvexTable<any>>(
    targetTable: TTargetTable,
    config?: { relationName?: string }
  ): Many<TTargetTable> {
    // SECURITY: Validate relation name if provided
    if (config?.relationName) {
      validateRelationName(config.relationName);
    }

    return new Many(sourceTable, targetTable, config);
  };
}

/**
 * Define relations for a table using Drizzle's API
 *
 * @template TTable - The source table type
 * @template TConfig - The relations configuration object
 *
 * @param table - The table to define relations for
 * @param callback - Function receiving relation helpers, returns relation config
 * @returns Relations instance with metadata
 *
 * @example
 * const usersRelations = relations(users, ({ one, many }) => ({
 *   profile: one(profiles),
 *   posts: many(posts),
 * }));
 */
export function relations<
  TTable extends ConvexTable<any>,
  TConfig extends Record<string, Relation<any>>,
>(
  table: TTable,
  callback: (helpers: RelationHelpers) => TConfig
): Relations<TTable, TConfig> {
  // Following Drizzle's pattern: wrap the callback to add withFieldName() calls
  // while preserving the generic type TConfig through explicit type assertion
  const wrappedCallback: (helpers: RelationHelpers) => TConfig = (helpers) => {
    const rawConfig = callback(helpers);

    // Call withFieldName() on each relation and validate names
    // Then use Object.fromEntries pattern with type assertion to preserve TConfig
    return Object.fromEntries(
      Object.entries(rawConfig).map(([key, value]) => {
        validateRelationName(key);
        return [key, value.withFieldName(key)];
      })
    ) as TConfig;
  };

  return new Relations(table, wrappedCallback);
}
