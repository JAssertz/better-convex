/**
 * Database Context Integration
 *
 * Extends Convex GenericDatabaseReader<any> with query builder API
 * Provides ctx.db.query[tableName].findMany/findFirst access
 */

import type { GenericDatabaseReader } from 'convex/server';
import type { ColumnBuilder } from './builders/column-builder';
import type { EdgeMetadata } from './extractRelationsConfig';
import { RelationalQueryBuilder } from './query-builder';
import type { ConvexTable } from './table';
import type { TablesRelationalConfig } from './types';

/**
 * Database with query builder API
 *
 * @template TSchema - Schema configuration with tables and relations
 */
export type DatabaseWithQuery<TSchema extends TablesRelationalConfig> =
  GenericDatabaseReader<any> & {
    query: {
      [K in keyof TSchema]: RelationalQueryBuilder<TSchema, TSchema[K]>;
    };
  };

/**
 * Create database context with query builder API
 *
 * @param db - Convex GenericDatabaseReader<any> (ctx.db)
 * @param schema - Schema configuration object (tables + relations)
 * @param edgeMetadata - Edge metadata from extractRelationsConfig()
 * @returns Extended database with query property
 *
 * @example
 * import { createDatabase, extractRelationsConfig } from 'better-convex/orm';
 *
 * const schema = { users, posts, usersRelations, postsRelations };
 * const edges = extractRelationsConfig(schema);
 *
 * export default query({
 *   handler: async (ctx) => {
 *     const db = createDatabase(ctx.db, schema, edges);
 *     const users = await db.query.users.findMany({
 *       with: { posts: true }
 *     });
 *   }
 * });
 */
export function createDatabase<TSchema extends TablesRelationalConfig>(
  db: GenericDatabaseReader<any>,
  schema: TSchema,
  edgeMetadata: EdgeMetadata[]
): DatabaseWithQuery<TSchema> {
  const query: any = {};

  // Create query builder for each table in schema
  for (const [tableName, tableConfig] of Object.entries(schema)) {
    // Filter edges to only those originating from this table
    const tableEdges = edgeMetadata.filter(
      (edge) => edge.sourceTable === tableConfig.dbName
    );

    query[tableName] = new RelationalQueryBuilder(
      schema,
      tableConfig,
      tableEdges,
      db
    );
  }

  // Return extended database with query property
  return {
    ...db,
    query,
  } as DatabaseWithQuery<TSchema>;
}

/**
 * Extract tables from schema (filter out Relations)
 *
 * Pattern from Drizzle: Only include entries that are tables
 */
type ExtractTablesFromSchema<TSchema extends Record<string, any>> = {
  [K in keyof TSchema as TSchema[K] extends { tableName: string }
    ? K
    : never]: TSchema[K];
};

/**
 * Build schema configuration from table and relation definitions
 *
 * Helper to construct TablesRelationalConfig from raw schema object
 * with proper type inference for table names and structures
 *
 * @template TSchema - Input schema object with table definitions
 * @param rawSchema - Object containing tables and relations
 * @returns Typed schema configuration with inferred table names
 *
 * @example
 * const schema = buildSchema({
 *   users,
 *   posts,
 *   usersRelations,
 *   postsRelations,
 * });
 * // Type inferred as: { users: TableRelationalConfig; posts: TableRelationalConfig }
 */
export function buildSchema<TSchema extends Record<string, any>>(
  rawSchema: TSchema
): ExtractTablesFromSchema<TSchema> extends Record<string, any>
  ? {
      [K in keyof ExtractTablesFromSchema<TSchema>]: {
        tsName: K;
        dbName: string;
        columns: ExtractTablesFromSchema<TSchema>[K] extends ConvexTable<
          infer T
        >
          ? T['columns']
          : Record<string, ColumnBuilder<any, any, any>>;
        relations: any;
      };
    }
  : never {
  const config: any = {};

  // Extract tables and their relations from raw schema
  for (const [key, value] of Object.entries(rawSchema)) {
    // Skip if not a table (could be a Relations object)
    if (!value.tableName || !value[Symbol.for('better-convex:Columns')]) {
      continue;
    }

    const tableName = value.tableName;
    const columns = value[Symbol.for('better-convex:Columns')];
    const relations = value[Symbol.for('better-convex:Relations')] || {};

    config[key] = {
      tsName: key,
      dbName: tableName,
      columns,
      relations,
    };
  }

  return config;
}
