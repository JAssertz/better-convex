import type { GenericId } from 'convex/values';
import type { Simplify } from '../internal/types';
import type { ColumnBuilder } from './builders/column-builder';
import type { FieldReference } from './filter-expression';
import type { One, Relation, Relations } from './relations';
import type { ConvexTable } from './table';

/**
 * Merge two object types without using intersection
 * Intersection can cause TypeScript to lose phantom type brands
 * This manually combines keys from both types
 */
type Merge<A, B> = {
  [K in keyof A | keyof B]: K extends keyof B
    ? B[K]
    : K extends keyof A
      ? A[K]
      : never;
};

/**
 * Extract full document type from a ConvexTable (includes system fields)
 * Uses GetColumnData in 'query' mode to respect notNull brands
 *
 * @example
 * const users = convexTable('users', { name: text().notNull() });
 * type User = InferSelectModel<typeof users>;
 * // → { _id: Id<'users'>, _creationTime: number, name: string }
 *
 * const posts = convexTable('posts', { title: text() }); // nullable
 * type Post = InferSelectModel<typeof posts>;
 * // → { _id: Id<'posts'>, _creationTime: number, title: string | null }
 */
export type InferSelectModel<TTable extends ConvexTable<any>> = Simplify<
  Merge<
    {
      _id: GenericId<TTable['_']['name']>;
      _creationTime: number;
    },
    {
      [K in keyof TTable['_']['columns']]: GetColumnData<
        TTable['_']['columns'][K],
        'query'
      >;
    }
  >
>;

/**
 * Extract insert type from a ConvexTable (excludes system fields)
 *
 * @example
 * const users = convexTable('users', { name: v.string() });
 * type NewUser = InferInsertModel<typeof users>;
 * // → { name: string }
 */
export type InferInsertModel<TTable extends ConvexTable<any>> = Simplify<
  ColumnsToType<TTable['_']['columns']>
>;

/**
 * Extract TypeScript type from a column builder
 * Uses phantom `_` property to get type info
 *
 * @example
 * text().notNull() → string
 * text() → string | null
 * integer().default(0) → number | null (nullable on select, optional on insert)
 */
type BuilderToType<TBuilder extends ColumnBuilder<any, any, any>> =
  TBuilder['_']['notNull'] extends true
    ? TBuilder['_']['data'] // notNull → just the data type
    : TBuilder['_']['data'] | null; // nullable → union with null

/**
 * Extract TypeScript type from a column builder
 * Builders are the only supported API
 */
type ColumnToType<V> =
  V extends ColumnBuilder<any, any, any> ? BuilderToType<V> : never;

/**
 * Extract column data type with mode-based handling (Drizzle pattern)
 *
 * Following Drizzle's GetColumnData pattern for consistent type extraction:
 * - 'raw' mode: Returns base data type without null (for inserts, operator comparisons)
 * - 'query' mode: Respects notNull brand, adds | null for nullable fields (for selects)
 *
 * @template TColumn - Column builder type
 * @template TInferMode - 'query' (default, adds | null) or 'raw' (base type only)
 *
 * @example
 * const name = text().notNull();
 * type NameQuery = GetColumnData<typeof name, 'query'>; // string
 * type NameRaw = GetColumnData<typeof name, 'raw'>; // string
 *
 * const age = integer(); // nullable
 * type AgeQuery = GetColumnData<typeof age, 'query'>; // number | null
 * type AgeRaw = GetColumnData<typeof age, 'raw'>; // number
 */
export type GetColumnData<
  TColumn extends ColumnBuilder<any, any, any>,
  TInferMode extends 'query' | 'raw' = 'query'
> = TInferMode extends 'raw'
  ? TColumn['_']['data'] // Raw mode: just the base data type
  : TColumn['_']['notNull'] extends true
    ? TColumn['_']['data'] // Query mode, notNull: no null union
    : TColumn['_']['data'] | null; // Query mode, nullable: add null

/**
 * Recursively extract types from column builders
 * Only column builders are supported
 *
 * CRITICAL: No extends constraint to avoid type widening
 */
type ColumnsToType<T> =
  T extends Record<string, ColumnBuilder<any, any, any>>
    ? {
        [K in keyof T]: ColumnToType<T[K]>;
      }
    : never;


/**
 * Extract relation types from a Relations definition
 * Requires schema context to look up referenced tables
 *
 * @template TRelations - Relations definition
 * @template TSchema - Full schema configuration
 *
 * @example
 * const usersRelations = relations(users, ({ many }) => ({
 *   posts: many(posts),
 * }));
 * type UserRelations = InferRelations<typeof usersRelations, typeof schema>;
 * // → { posts: Post[] }
 */
export type InferRelations<
  TRelations extends Relations<any, any>,
  TSchema extends TablesRelationalConfig
> = TRelations extends Relations<any, infer TConfig>
  ? Simplify<{
      [K in keyof TConfig]: TConfig[K] extends Relation<any>
        ? InferRelationTypeWithSchema<TConfig[K], TSchema>
        : never;
    }>
  : never;

/**
 * Infer type for a single relation with schema context
 * - one() → T | null (with schema lookup)
 * - many() → T[] (with schema lookup)
 *
 * Uses schema to find referenced table, then builds query result
 */
type InferRelationTypeWithSchema<
  TRel extends Relation<any>,
  TSchema extends TablesRelationalConfig
> = BuildQueryResult<
  TSchema,
  FindTableByDBName<TSchema, TRel['referencedTableName']>,
  true
> extends infer TResult
  ? TRel extends One<any, any>
    ? TResult | (TRel['isNullable'] extends true ? null : never)
    : TResult[]
  : never;

/**
 * Extract TablesRelationalConfig from a schema definition object
 * Used for type inference in tests and utilities
 *
 * @example
 * const schema = { users, posts };
 * type Schema = ExtractTablesWithRelations<typeof schema>;
 * type Relations = InferRelations<typeof usersRelations, Schema>;
 */
export type ExtractTablesWithRelations<TSchema extends Record<string, unknown>> = {
  [K in keyof TSchema]: TSchema[K] extends ConvexTable<infer TConfig>
    ? {
        tsName: K;
        dbName: TConfig['name'];
        columns: TConfig['columns'];
        relations: {}; // Relations extracted separately
      }
    : never;
};

// ============================================================================
// M3 Query Builder Types
// ============================================================================

/**
 * Schema configuration - map of table names to table configurations
 * Used by query builder to understand schema structure
 */
export type TablesRelationalConfig = Record<string, TableRelationalConfig>;

/**
 * Configuration for a single table including columns and relations
 * Built from ConvexTable + Relations definitions
 */
export interface TableRelationalConfig {
  /** Table name in TypeScript/database */
  tsName: string;
  /** Database table name (same as tsName for Convex) */
  dbName: string;
  /** Column builders */
  columns: Record<string, ColumnBuilder<any, any, any>>;
  /** Relations defined for this table */
  relations: Record<string, Relation<any>>;
}

/**
 * Query configuration for findMany/findFirst
 *
 * @template TRelationType - 'one' or 'many' determines available options
 * @template TSchema - Full schema configuration
 * @template TTableConfig - Configuration for the queried table
 */
export type DBQueryConfig<
  TRelationType extends 'one' | 'many' = 'one' | 'many',
  TSchema extends TablesRelationalConfig = TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> = {
  /**
   * Column selection - pick specific columns to return
   * If omitted, all columns are selected
   */
  columns?: {
    [K in keyof TTableConfig['columns']]?: boolean;
  };
  /**
   * Relation loading - specify which relations to include
   * Can be `true` for default config or nested config object
   */
  with?: {
    [K in keyof TTableConfig['relations']]?:
      | true
      | DBQueryConfig<
          TTableConfig['relations'][K] extends One<any, any> ? 'one' : 'many',
          TSchema,
          TTableConfig['relations'][K] extends Relation<infer TTable>
            ? FindTableByDBName<TSchema, TTable['_']['name']>
            : never
        >;
  };
} & (TRelationType extends 'many'
  ? {
      /**
       * Filter rows - receives raw column builders (not FieldReference)
       * Following Drizzle pattern: pass columns directly, operators wrap at runtime
       */
      where?: (
        fields: TTableConfig['columns'],
        operators: FilterOperators
      ) => any;
      /** Order results - receives raw column builders and direction helpers */
      orderBy?: (
        fields: TTableConfig['columns'],
        direction: OrderDirection
      ) => any;
      /** Limit number of results */
      limit?: number;
      /** Skip first N results */
      offset?: number;
    }
  : Record<string, never>);

/**
 * Filter operators available in where clause
 * Following Drizzle pattern: first param is column reference, second param is the value
 */
export interface FilterOperators {
  eq: <T>(field: FieldReference<T>, value: T) => any;
  ne: <T>(field: FieldReference<T>, value: T) => any;
  gt: <T>(field: FieldReference<T>, value: T) => any;
  gte: <T>(field: FieldReference<T>, value: T) => any;
  lt: <T>(field: FieldReference<T>, value: T) => any;
  lte: <T>(field: FieldReference<T>, value: T) => any;
  inArray: <T>(field: FieldReference<T>, values: readonly T[]) => any;
  notInArray: <T>(field: FieldReference<T>, values: readonly T[]) => any;
  isNull: <T>(field: FieldReference<T | null>) => any;
  isNotNull: <T>(field: FieldReference<T | null>) => any;
}

/**
 * Order direction helpers
 */
export interface OrderDirection {
  asc: <T>(field: T) => any;
  desc: <T>(field: T) => any;
}

/**
 * Build query result type from configuration
 * Handles column selection and relation loading
 *
 * @template TSchema - Full schema configuration
 * @template TTableConfig - Configuration for queried table
 * @template TConfig - Query configuration (true | config object)
 */
export type BuildQueryResult<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
  TConfig extends true | Record<string, unknown>,
> = TConfig extends true
  ? InferModelFromColumns<TTableConfig['columns']>
  : TConfig extends Record<string, unknown>
    ? Simplify<
        Merge<
          TConfig extends { columns: Record<string, boolean> }
            ? PickColumns<TTableConfig['columns'], TConfig['columns']>
            : InferModelFromColumns<TTableConfig['columns']>,
          TConfig extends { with: Record<string, unknown> }
            ? BuildRelationResult<
                TSchema,
                TConfig['with'],
                TTableConfig['relations']
              >
            : {}
        >
      >
    : never;

/**
 * Build relation result types from `with` configuration
 * Maps each included relation to its result type (T | null for one, T[] for many)
 *
 * Following Drizzle's exact pattern for type inference
 *
 * @template TSchema - Full schema configuration
 * @template TInclude - Relations to include from `with` config
 * @template TRelations - Available relations on the table
 */
export type BuildRelationResult<
  TSchema extends TablesRelationalConfig,
  TInclude extends Record<string, unknown>,
  TRelations extends Record<string, Relation<any>>,
> = {
  [K in NonUndefinedKeysOnly<TInclude> &
    keyof TRelations]: TRelations[K] extends infer TRel extends Relation<any>
    ? BuildQueryResult<
        TSchema,
        FindTableByDBName<TSchema, TRel['referencedTableName']>,
        TInclude[K] extends true | Record<string, unknown> ? TInclude[K] : true
      > extends infer TResult
      ? TRel extends One<any, any>
        ? TResult | (TRel['isNullable'] extends true ? null : never)
        : TResult[]
      : never
    : never;
};

/**
 * Extract TypeScript types from column validators
 * Includes system fields for query results
 * Following Drizzle pattern: query results always include system fields
 * Uses GetColumnData in 'query' mode to respect notNull brands
 *
 * CRITICAL: No extends constraint to avoid type widening (convex-ents pattern)
 * CRITICAL: Uses Merge instead of & to preserve NotNull phantom type brands
 */
export type InferModelFromColumns<TColumns> =
  TColumns extends Record<string, ColumnBuilder<any, any, any>>
    ? Simplify<
        Merge<
          {
            _id: string;
            _creationTime: number;
          },
          {
            [K in keyof TColumns]: GetColumnData<TColumns[K], 'query'>;
          }
        >
      >
    : never;

/**
 * Pick specific columns from column builders
 * Used when `columns` config is provided
 * Uses GetColumnData in 'query' mode to respect notNull brands
 *
 * CRITICAL: No extends constraint on TColumns to avoid type widening
 */
export type PickColumns<
  TColumns,
  TSelection extends Record<string, boolean>,
> = TColumns extends Record<string, ColumnBuilder<any, any, any>>
  ? Simplify<{
      [K in keyof TSelection as K extends keyof TColumns
        ? TSelection[K] extends true
          ? K
          : never
        : never]: K extends keyof TColumns
        ? GetColumnData<TColumns[K], 'query'>
        : never;
    }>
  : never;

/**
 * Find table configuration by database name
 * Searches schema for table with matching dbName
 */
export type FindTableByDBName<
  TSchema extends TablesRelationalConfig,
  TDBName extends string,
> = TSchema extends Record<string, infer TTableConfig>
  ? TTableConfig extends TableRelationalConfig
    ? TTableConfig['dbName'] extends TDBName
      ? TTableConfig
      : never
    : never
  : never;

/**
 * Filter object keys to only non-undefined values
 * Used to filter `with` config to only included relations
 */
export type NonUndefinedKeysOnly<T> = {
  [K in keyof T]: T[K] extends undefined ? never : K;
}[keyof T];
