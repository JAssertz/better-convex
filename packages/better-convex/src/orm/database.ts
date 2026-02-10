/**
 * Database Context Integration
 *
 * Builds an ORM client from Convex `ctx.db`.
 *
 * Public surface area is intentionally narrow:
 * - ORM query builders via `db.query.*.findMany/findFirst`
 * - ORM mutations via `db.insert/update/delete(table)` builder APIs
 * - Raw system-table access via `db.system` only
 *
 * We do NOT expose raw Convex writes (patch/replace/insert/delete) on `db`
 * because they bypass ORM runtime checks (constraints, defaults, RLS).
 */

import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
  SchedulableFunctionReference,
  Scheduler,
  SchemaDefinition,
} from 'convex/server';
import { ConvexDeleteBuilder } from './delete';
import type { EdgeMetadata } from './extractRelationsConfig';
import { ConvexInsertBuilder } from './insert';
import { buildForeignKeyGraph, type OrmContextValue } from './mutation-utils';
import { RelationalQueryBuilder } from './query-builder';
import type { TablesRelationalConfig } from './relations';
import type { RlsContext } from './rls/types';
import { type StreamDatabaseReader, stream } from './stream';
import {
  Brand,
  OrmContext,
  type OrmRuntimeOptions,
  OrmSchemaDefinition,
  OrmSchemaOptions,
} from './symbols';
import type { ConvexTable } from './table';
import type { VectorSearchProvider } from './types';
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
type SchemaDefOf<TSchema extends TablesRelationalConfig> =
  NonNullable<TSchema[typeof OrmSchemaDefinition]> extends SchemaDefinition<
    any,
    boolean
  >
    ? NonNullable<TSchema[typeof OrmSchemaDefinition]>
    : SchemaDefinition<any, boolean>;

export type DatabaseWithQuery<TSchema extends TablesRelationalConfig> =
  // Expose raw system access for _storage and _scheduled_functions only.
  // This is the escape hatch for system tables, not app tables.
  Pick<GenericDatabaseReader<any>, 'system'> & {
    query: TSchema extends Record<string, never>
      ? { error: 'Schema is empty - did you forget to add tables?' }
      : {
          [K in keyof TSchema]: RelationalQueryBuilder<TSchema, TSchema[K]>;
        };
    stream: () => StreamDatabaseReader<SchemaDefOf<TSchema>>;
  };

export type DatabaseWithSkipRules<T> = T & { skipRules: T };

export type DatabaseWithMutations<TSchema extends TablesRelationalConfig> =
  DatabaseWithQuery<TSchema> &
    {
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
  scheduledMutationBatch?: SchedulableFunctionReference;
  vectorSearch?: VectorSearchProvider;
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
  const schemaOptions = (schema as { [OrmSchemaOptions]?: OrmRuntimeOptions })[
    OrmSchemaOptions
  ];
  const strict = schemaOptions?.strict ?? true;
  const defaults = schemaOptions?.defaults;
  const schemaDefinition = (schema as { [OrmSchemaDefinition]?: unknown })[
    OrmSchemaDefinition
  ];
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
        options?.relationLoading,
        options?.vectorSearch
      );
    }

    const ormContext: OrmContextValue = {
      foreignKeyGraph: buildForeignKeyGraph(schema),
      scheduler: options?.scheduler,
      scheduledDelete: options?.scheduledDelete,
      scheduledMutationBatch: options?.scheduledMutationBatch,
      rls,
      strict,
      defaults,
    };

    // Preserve the original `ctx.db` behavior without mutating it.
    // We only need to attach internal ORM runtime context via a symbol.
    const baseDb = Object.assign(Object.create(db), {
      [OrmContext]: ormContext,
    }) as unknown as GenericDatabaseWriter<any>;

    const isWriter =
      typeof (db as any).insert === 'function' &&
      typeof (db as any).patch === 'function';

    const isConvexTable = (value: unknown): value is ConvexTable<any> =>
      !!value &&
      typeof value === 'object' &&
      (value as any)[Brand] === 'ConvexTable';

    const insert = <TTable extends ConvexTable<any>>(table: TTable) => {
      if (!isWriter) {
        throw new Error(
          'db.insert() is not available on a reader context (use it in mutations).'
        );
      }
      if (!isConvexTable(table)) {
        throw new Error(
          'db.insert(table) requires a ConvexTable from convexTable(...).'
        );
      }
      return new ConvexInsertBuilder(baseDb, table);
    };

    const update = <TTable extends ConvexTable<any>>(table: TTable) => {
      if (!isWriter) {
        throw new Error(
          'db.update() is not available on a reader context (use it in mutations).'
        );
      }
      if (!isConvexTable(table)) {
        throw new Error(
          'db.update(table) requires a ConvexTable from convexTable(...).'
        );
      }
      return new ConvexUpdateBuilder(baseDb, table);
    };

    const deleteBuilder = <TTable extends ConvexTable<any>>(table: TTable) => {
      if (!isWriter) {
        throw new Error(
          'db.delete() is not available on a reader context (use it in mutations).'
        );
      }
      if (!isConvexTable(table)) {
        throw new Error(
          'db.delete(table) requires a ConvexTable from convexTable(...).'
        );
      }
      return new ConvexDeleteBuilder(baseDb, table);
    };

    const streamDb = () => {
      if (!schemaDefinition) {
        throw new Error(
          'db.stream() requires defineSchema(). Ensure defineSchema(tables) was used with the same tables object passed to defineRelations.'
        );
      }
      return stream(
        baseDb as GenericDatabaseReader<any>,
        schemaDefinition as any
      );
    };

    const base = {
      // Internal runtime config for mutation builders, scheduling, and FK actions.
      [OrmContext]: ormContext,
      // System tables escape hatch (raw Convex API).
      system: (db as GenericDatabaseReader<any>).system,
      query,
      stream: streamDb,
    } as DatabaseWithQuery<TSchema>;

    return isWriter
      ? ({
          ...base,
          insert,
          update,
          delete: deleteBuilder,
        } as DatabaseWithMutations<TSchema>)
      : base;
  };

  const table = buildDatabase(options?.rls);
  const skipRulesTable = buildDatabase({
    ...(options?.rls ?? {}),
    mode: 'skip',
  });

  return {
    ...table,
    skipRules: skipRulesTable,
  } as DatabaseWithSkipRules<DatabaseWithQuery<TSchema>>;
}
