/**
 * Database Context Integration
 *
 * Extends Convex GenericDatabaseReader<any> with query builder API
 * Provides ctx.db.query[tableName].findMany/findFirst access
 */

import type {
  DataModelFromSchemaDefinition,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  PaginationOptions,
  PaginationResult,
  SchedulableFunctionReference,
  Scheduler,
  SchemaDefinition,
} from 'convex/server';
import { ConvexDeleteBuilder } from './delete';
import type { EdgeMetadata } from './extractRelationsConfig';
import { ConvexInsertBuilder } from './insert';
import { buildForeignKeyGraph, type OrmContextValue } from './mutation-utils';
import { RelationalQueryBuilder } from './query-builder';
import { defineRelations, type TablesRelationalConfig } from './relations';
import type { RlsContext } from './rls/types';
import {
  type StreamDatabaseReader,
  type StreamQueryInitializer,
  stream,
} from './stream';
import { Brand, OrmContext, OrmSchemaDefinition } from './symbols';
import type { ConvexTable } from './table';
import type { InferSelectModel } from './types';
import { ConvexUpdateBuilder } from './update';

/**
 * Database with query builder API
 *
 * @template TSchema - Schema configuration with tables and relations
 *
 * Following Drizzle's pattern: Validate schema BEFORE mapped type to prevent type widening.
 * The conditional check outside the mapped type prevents distributive conditional behavior
 * that causes TSchema[K] to widen to a union of all table types.
 *
 * Pattern from: drizzle-orm/src/pg-core/db.ts lines 50-54
 * Key insight: TSchema[K] must be captured at mapping time, not evaluated in conditionals later.
 */
type SchemaDefinitionFromConfig<TSchema extends TablesRelationalConfig<any>> =
  TSchema extends TablesRelationalConfig<infer SchemaDef>
    ? SchemaDef
    : SchemaDefinition<any, boolean>;

type StreamRowForTable<
  TSchema extends TablesRelationalConfig,
  TableName extends keyof TSchema & string,
> = InferSelectModel<TSchema[TableName]['table']>;

type StreamQueryForTable<
  TSchema extends TablesRelationalConfig,
  TableName extends keyof TSchema & string,
> = Omit<
  StreamQueryInitializer<SchemaDefinitionFromConfig<TSchema>, TableName>,
  'paginate' | 'collect' | 'take' | 'first' | 'unique'
> & {
  paginate(
    paginationOpts: PaginationOptions
  ): Promise<PaginationResult<StreamRowForTable<TSchema, TableName>>>;
  collect(): Promise<StreamRowForTable<TSchema, TableName>[]>;
  take(n: number): Promise<StreamRowForTable<TSchema, TableName>[]>;
  first(): Promise<StreamRowForTable<TSchema, TableName> | null>;
  unique(): Promise<StreamRowForTable<TSchema, TableName> | null>;
};

type StreamDatabaseReaderForTables<TSchema extends TablesRelationalConfig> =
  Omit<StreamDatabaseReader<SchemaDefinitionFromConfig<TSchema>>, 'query'> & {
    query<TableName extends keyof TSchema & string>(
      tableName: TableName
    ): StreamQueryForTable<TSchema, TableName>;
  };

export type DatabaseWithQuery<TSchema extends TablesRelationalConfig> =
  GenericDatabaseReader<any> & {
    query: TSchema extends Record<string, never>
      ? { error: 'Schema is empty - did you forget to add tables?' }
      : {
          [K in keyof TSchema]: RelationalQueryBuilder<TSchema, TSchema[K]>;
        };
    stream: {
      (): StreamDatabaseReaderForTables<TSchema>;
      <Schema extends SchemaDefinition<any, boolean>>(
        schema: Schema
      ): StreamDatabaseReader<Schema>;
    };
  };

export type DatabaseWithSkipRules<T> = T & { skipRules: { table: T } };

export type DatabaseWithMutations<TSchema extends TablesRelationalConfig> =
  DatabaseWithQuery<TSchema> &
    GenericDatabaseWriter<any> & {
      insert<TTable extends ConvexTable<any>>(
        table: TTable
      ): ConvexInsertBuilder<TTable>;
      update<TTable extends ConvexTable<any>>(
        table: TTable
      ): ConvexUpdateBuilder<TTable>;
      delete<TTable extends ConvexTable<any>>(
        table: TTable
      ): ConvexDeleteBuilder<TTable>;
    };

export type CreateDatabaseOptions = {
  scheduler?: Scheduler;
  scheduledDelete?: SchedulableFunctionReference;
  rls?: RlsContext;
  relationLoading?: {
    concurrency?: number;
  };
};

/**
 * Create database context with query builder API
 *
 * @param db - Convex GenericDatabaseReader<any> (ctx.db)
 * @param schema - Schema configuration object (defineRelations output)
 * @param edgeMetadata - Edge metadata from extractRelationsConfig()
 * @returns Extended database with query property
 *
 * @example
 * import { createDatabase, extractRelationsConfig } from 'better-convex/orm';
 *
 * const schema = { users, posts };
 * const relations = defineRelations(schema, (r) => ({
 *   posts: {
 *     author: r.one.users({ from: r.posts.authorId, to: r.users._id }),
 *   },
 * }));
 * const edges = extractRelationsConfig(relations);
 *
 * export default query({
 *   handler: async (ctx) => {
 *     const db = createDatabase(ctx.db, relations, edges);
 *     const users = await db.query.users.findMany({
 *       with: { posts: true }
 *     });
 *   }
 * });
 */
export function createDatabase<TSchema extends TablesRelationalConfig>(
  db: GenericDatabaseWriter<any>,
  schema: TSchema,
  edgeMetadata: EdgeMetadata[],
  options?: CreateDatabaseOptions
): DatabaseWithSkipRules<DatabaseWithMutations<TSchema>>;
export function createDatabase<TSchema extends TablesRelationalConfig>(
  db: GenericDatabaseReader<any>,
  schema: TSchema,
  edgeMetadata: EdgeMetadata[],
  options?: CreateDatabaseOptions
): DatabaseWithSkipRules<DatabaseWithQuery<TSchema>>;
export function createDatabase<TSchema extends TablesRelationalConfig>(
  db: GenericDatabaseReader<any>,
  schema: TSchema,
  edgeMetadata: EdgeMetadata[],
  options?: CreateDatabaseOptions
): DatabaseWithSkipRules<DatabaseWithQuery<TSchema>> {
  const strict = Object.values(schema)[0]?.strict ?? true;
  const schemaDefinition = (
    schema as TablesRelationalConfig<SchemaDefinitionFromConfig<TSchema>>
  )[OrmSchemaDefinition] as SchemaDefinitionFromConfig<TSchema> | undefined;
  const buildDatabase = (rls: RlsContext | undefined) => {
    const query: any = {};

    // Create query builder for each table in schema
    for (const [tableName, tableConfig] of Object.entries(schema)) {
      // Filter edges to only those originating from this table
      const tableEdges = edgeMetadata.filter(
        (edge) => edge.sourceTable === tableConfig.name
      );

      query[tableName] = new RelationalQueryBuilder(
        schema,
        tableConfig,
        tableEdges,
        db,
        edgeMetadata, // M6.5 Phase 2: Pass all edges for nested relation loading
        rls,
        options?.relationLoading
      );
    }

    const rawInsert = (db as any).insert?.bind(db);
    const rawDelete = (db as any).delete?.bind(db);

    const ormContext: OrmContextValue = {
      foreignKeyGraph: buildForeignKeyGraph(schema),
      scheduler: options?.scheduler,
      scheduledDelete: options?.scheduledDelete,
      rls,
      strict,
    };

    const baseDb = {
      ...db,
      [OrmContext]: ormContext,
    } as unknown as GenericDatabaseWriter<any>;

    const isConvexTable = (value: unknown): value is ConvexTable<any> =>
      !!value &&
      typeof value === 'object' &&
      (value as any)[Brand] === 'ConvexTable';

    const insert = (...args: any[]) => {
      if (isConvexTable(args[0])) {
        return new ConvexInsertBuilder(baseDb, args[0]);
      }
      if (!rawInsert) {
        throw new Error(
          'Database insert is not available on a reader context.'
        );
      }
      return rawInsert(...args);
    };

    const update = (table: ConvexTable<any>) =>
      new ConvexUpdateBuilder(baseDb, table);

    const deleteBuilder = (...args: any[]) => {
      if (isConvexTable(args[0])) {
        return new ConvexDeleteBuilder(baseDb, args[0]);
      }
      if (!rawDelete) {
        throw new Error(
          'Database delete is not available on a reader context.'
        );
      }
      return rawDelete(...args);
    };

    const streamFn = (<Schema extends SchemaDefinition<any, boolean>>(
      schemaParam?: Schema
    ) => {
      const effectiveSchema = (schemaParam ?? schemaDefinition) as
        | Schema
        | undefined;
      if (!effectiveSchema) {
        throw new Error(
          'db.stream() requires a schema from defineSchema(). Call defineSchema(tables) on the same tables object used for defineRelations.'
        );
      }
      return stream(
        db as GenericDatabaseReader<DataModelFromSchemaDefinition<Schema>>,
        effectiveSchema
      ) as unknown as StreamDatabaseReaderForTables<TSchema>;
    }) as DatabaseWithQuery<TSchema>['stream'];

    // Return extended database with query property
    return {
      ...baseDb,
      query,
      stream: streamFn,
      insert,
      update,
      delete: deleteBuilder,
    } as DatabaseWithQuery<TSchema>;
  };

  const table = buildDatabase(options?.rls);
  const skipRulesTable = buildDatabase({
    ...(options?.rls ?? {}),
    mode: 'skip',
  });

  return {
    ...table,
    skipRules: { table: skipRulesTable },
  } as DatabaseWithSkipRules<DatabaseWithQuery<TSchema>>;
}

/**
 * Build schema configuration from raw tables (no relations)
 *
 * Convenience wrapper around defineRelations(schema).
 */
export function buildSchema<TSchema extends Record<string, any>>(
  rawSchema: TSchema
) {
  return defineRelations(rawSchema);
}
