/**
 * RelationalQueryBuilder - Entry point for query builder API
 *
 * Provides findMany() and findFirst() methods following Drizzle's pattern:
 * - ctx.db.query.users.findMany({ with: { posts: true } })
 * - ctx.db.query.users.findFirst({ where: ... })
 */

import type { GenericDatabaseReader } from 'convex/server';
import type { KnownKeysOnly } from '../internal/types';
import type { EdgeMetadata } from './extractRelationsConfig';
import { GelRelationalQuery } from './query';
import type { RlsContext } from './rls/types';
import type {
  BuildQueryResult,
  DBQueryConfig,
  TableRelationalConfig,
  TablesRelationalConfig,
} from './types';

/**
 * Query builder for a specific table
 *
 * Uses HKT (Higher-Kinded Type) pattern to prevent type widening.
 * The readonly `_` interface anchors the result type, preventing TypeScript
 * from re-evaluating TSchema[K] as a union of all tables.
 *
 * Pattern from Drizzle ORM:
 * drizzle-orm/src/pg-core/query-builders/select.ts:167-179
 *
 * @template TSchema - Full schema configuration
 * @template TTableConfig - Configuration for this specific table
 */
export class RelationalQueryBuilder<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> {
  /**
   * Type anchor for HKT pattern
   * Stores base result type in immutable property to prevent TypeScript from
   * widening types during mapped type evaluation. Methods construct their
   * return types (array, single, paginated) from this base type.
   */
  declare readonly _: {
    readonly schema: TSchema;
    readonly tableConfig: TTableConfig;
    readonly baseResult: BuildQueryResult<TSchema, TTableConfig, true>;
  };

  constructor(
    private schema: TSchema,
    private tableConfig: TTableConfig,
    private edgeMetadata: EdgeMetadata[],
    private db: GenericDatabaseReader<any>,
    private allEdges?: EdgeMetadata[], // M6.5 Phase 2: All edges for nested loading
    private rls?: RlsContext
  ) {}

  /**
   * Find many rows matching the query configuration
   *
   * @template TConfig - Query configuration type
   * @param config - Optional query configuration (columns, with, where, orderBy, limit, offset)
   * @returns Query promise that resolves to array of results
   *
   * @example
   * const users = await ctx.db.query.users.findMany({
   *   columns: { id: true, name: true },
   *   with: { posts: { limit: 5 } },
   *   where: { name: 'Alice' },
   *   limit: 10
   * });
   */
  findMany<TConfig extends DBQueryConfig<'many', true, TSchema, TTableConfig>>(
    config?: KnownKeysOnly<
      TConfig,
      DBQueryConfig<'many', true, TSchema, TTableConfig>
    > &
      DBQueryConfig<'many', true, TSchema, TTableConfig>
  ): GelRelationalQuery<
    TSchema,
    TTableConfig,
    BuildQueryResult<TSchema, TTableConfig, TConfig>[]
  > {
    return new GelRelationalQuery<
      TSchema,
      TTableConfig,
      BuildQueryResult<TSchema, TTableConfig, TConfig>[]
    >(
      this.schema,
      this.tableConfig,
      this.edgeMetadata,
      this.db,
      config
        ? (config as DBQueryConfig<'many', true, TSchema, TTableConfig>)
        : ({} as DBQueryConfig<'many', true, TSchema, TTableConfig>),
      'many',
      this.allEdges, // M6.5 Phase 2: Pass all edges for nested loading
      this.rls
    );
  }

  /**
   * Find first row matching the query configuration
   * Automatically applies limit: 1
   *
   * @template TConfig - Query configuration type (without limit)
   * @param config - Optional query configuration (columns, with, where, orderBy, offset)
   * @returns Query promise that resolves to single result or undefined
   *
   * @example
   * const user = await ctx.db.query.users.findFirst({
   *   where: { email: 'alice@example.com' },
   *   with: { profile: true }
   * });
   */
  findFirst<
    TConfig extends Omit<
      DBQueryConfig<'many', true, TSchema, TTableConfig>,
      'limit'
    >,
  >(
    config?: KnownKeysOnly<
      TConfig,
      Omit<DBQueryConfig<'many', true, TSchema, TTableConfig>, 'limit'>
    > &
      Omit<DBQueryConfig<'many', true, TSchema, TTableConfig>, 'limit'>
  ): GelRelationalQuery<
    TSchema,
    TTableConfig,
    BuildQueryResult<TSchema, TTableConfig, TConfig> | undefined
  > {
    return new GelRelationalQuery<
      TSchema,
      TTableConfig,
      BuildQueryResult<TSchema, TTableConfig, TConfig> | undefined
    >(
      this.schema,
      this.tableConfig,
      this.edgeMetadata,
      this.db,
      {
        ...(config
          ? (config as DBQueryConfig<'many', true, TSchema, TTableConfig>)
          : ({} as DBQueryConfig<'many', true, TSchema, TTableConfig>)),
        limit: 1,
      },
      'first',
      this.allEdges, // M6.5 Phase 2: Pass all edges for nested loading
      this.rls
    );
  }

  /**
   * Paginate rows with cursor-based pagination (O(1) performance)
   *
   * @template TConfig - Query configuration type (columns, with, where, orderBy)
   * @param queryConfig - Optional query configuration (no limit/offset - uses cursor instead)
   * @param paginationOpts - Pagination options: { cursor: string | null, numItems: number }
   * @returns Query promise that resolves to { page, continueCursor, isDone }
   *
   * @example
   * const result = await ctx.db.query.users.paginate(
   *   { where: { active: true } },
   *   { cursor: null, numItems: 20 }
   * );
   * // result = { page: [...], continueCursor: "...", isDone: false }
   */
  paginate<
    TConfig extends Omit<
      DBQueryConfig<'many', true, TSchema, TTableConfig>,
      'limit' | 'offset'
    > = Omit<
      DBQueryConfig<'many', true, TSchema, TTableConfig>,
      'limit' | 'offset'
    >,
  >(
    queryConfig?: TConfig &
      Omit<
        DBQueryConfig<'many', true, TSchema, TTableConfig>,
        'limit' | 'offset'
      >,
    paginationOpts?: { cursor: string | null; numItems: number }
  ): GelRelationalQuery<
    TSchema,
    TTableConfig,
    {
      page: BuildQueryResult<TSchema, TTableConfig, TConfig>[];
      continueCursor: string | null;
      isDone: boolean;
    }
  > {
    return new GelRelationalQuery<
      TSchema,
      TTableConfig,
      {
        page: BuildQueryResult<TSchema, TTableConfig, TConfig>[];
        continueCursor: string | null;
        isDone: boolean;
      }
    >(
      this.schema,
      this.tableConfig,
      this.edgeMetadata,
      this.db,
      queryConfig
        ? (queryConfig as DBQueryConfig<'many', true, TSchema, TTableConfig>)
        : ({} as DBQueryConfig<'many', true, TSchema, TTableConfig>),
      'paginate',
      this.allEdges, // M6.5 Phase 2: All edges for nested loading
      this.rls,
      paginationOpts // M6.5 Phase 4: Pass pagination options
    );
  }
}
