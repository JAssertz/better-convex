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
  EnforceAllowFullScan,
  EnforcePredicateIndex,
  EnforceSearchConstraints,
  EnforceVectorSearchConstraints,
  PaginateConfig,
  PaginatedResult,
  PredicateWhereIndexConfig,
  SearchQueryConfig,
  SearchWhereFilter,
  TableRelationalConfig,
  TablesRelationalConfig,
  VectorQueryConfig,
  VectorSearchProvider,
  WherePredicate,
} from './types';

type EnforcedConfig<
  TConfig,
  TTableConfig extends TableRelationalConfig,
> = EnforceVectorSearchConstraints<
  EnforceSearchConstraints<
    EnforcePredicateIndex<
      EnforceAllowFullScan<TConfig, TTableConfig>,
      TTableConfig
    >,
    TTableConfig
  >,
  TTableConfig
>;

type PredicateIndexName<TTableConfig extends TableRelationalConfig> =
  PredicateWhereIndexConfig<TTableConfig> extends {
    name: infer TIndexName extends string;
  }
    ? TIndexName
    : string;

type PredicateIndexConfigByName<
  TTableConfig extends TableRelationalConfig,
  TIndexName extends PredicateIndexName<TTableConfig>,
> = Extract<PredicateWhereIndexConfig<TTableConfig>, { name: TIndexName }>;

type PredicatePaginatedConfig<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
  TIndexName extends PredicateIndexName<TTableConfig>,
> = Omit<
  PaginatedConfigNoSearch<TSchema, TTableConfig>,
  'where' | 'index' | 'allowFullScan' | 'search'
> & {
  where: WherePredicate<TTableConfig>;
  index: PredicateIndexConfigByName<TTableConfig, TIndexName>;
  allowFullScan?: never;
};

type PredicateNonPaginatedConfig<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
  TIndexName extends PredicateIndexName<TTableConfig>,
> = Omit<
  NonPaginatedConfigNoSearch<TSchema, TTableConfig>,
  'where' | 'index' | 'allowFullScan' | 'search'
> & {
  where: WherePredicate<TTableConfig>;
  index: PredicateIndexConfigByName<TTableConfig, TIndexName>;
  allowFullScan?: never;
};

type SearchPaginatedConfig<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> = Omit<
  PaginatedConfig<TSchema, TTableConfig>,
  'search' | 'vectorSearch' | 'where' | 'orderBy' | 'index'
> & {
  search: SearchQueryConfig<TTableConfig>;
  vectorSearch?: never;
  where?: SearchWhereFilter<TTableConfig> | undefined;
  orderBy?: never;
  index?: never;
};

type SearchNonPaginatedConfig<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> = Omit<
  NonPaginatedConfig<TSchema, TTableConfig>,
  'search' | 'vectorSearch' | 'where' | 'orderBy' | 'index'
> & {
  search: SearchQueryConfig<TTableConfig>;
  vectorSearch?: never;
  where?: SearchWhereFilter<TTableConfig> | undefined;
  orderBy?: never;
  index?: never;
};

type SearchFindFirstConfig<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> = Omit<
  DBQueryConfig<'many', true, TSchema, TTableConfig>,
  | 'limit'
  | 'paginate'
  | 'search'
  | 'vectorSearch'
  | 'where'
  | 'orderBy'
  | 'index'
> & {
  search: SearchQueryConfig<TTableConfig>;
  vectorSearch?: never;
  where?: SearchWhereFilter<TTableConfig> | undefined;
  orderBy?: never;
  index?: never;
};

type VectorNonPaginatedConfig<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> = Omit<
  NonPaginatedConfig<TSchema, TTableConfig>,
  | 'vectorSearch'
  | 'search'
  | 'where'
  | 'orderBy'
  | 'paginate'
  | 'index'
  | 'offset'
  | 'limit'
  | 'allowFullScan'
> & {
  vectorSearch: VectorQueryConfig<TTableConfig>;
  search?: never;
  where?: never;
  orderBy?: never;
  paginate?: never;
  index?: never;
  offset?: never;
  limit?: never;
  allowFullScan?: never;
};

type FindManyResult<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
  TConfig,
> = TConfig extends { paginate: PaginateConfig }
  ? PaginatedResult<BuildQueryResult<TSchema, TTableConfig, TConfig>>
  : BuildQueryResult<TSchema, TTableConfig, TConfig>[];

type PaginatedConfig<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> = DBQueryConfig<'many', true, TSchema, TTableConfig> & {
  paginate: PaginateConfig;
  limit?: never;
  offset?: never;
};

type NonPaginatedConfig<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> = Omit<DBQueryConfig<'many', true, TSchema, TTableConfig>, 'paginate'> & {
  paginate?: never;
};

type PaginatedConfigNoSearch<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> = Omit<PaginatedConfig<TSchema, TTableConfig>, 'search'> & {
  search?: undefined;
  vectorSearch?: undefined;
};

type NonPaginatedConfigNoSearch<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> = Omit<NonPaginatedConfig<TSchema, TTableConfig>, 'search'> & {
  search?: undefined;
  vectorSearch?: undefined;
};

type FindFirstConfigNoSearch<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> = Omit<
  DBQueryConfig<'many', true, TSchema, TTableConfig>,
  'limit' | 'paginate' | 'search' | 'vectorSearch'
> & {
  search?: undefined;
  vectorSearch?: undefined;
};

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
    private rls?: RlsContext,
    private relationLoading?: { concurrency?: number },
    private vectorSearch?: VectorSearchProvider
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
  findMany<TConfig extends SearchPaginatedConfig<TSchema, TTableConfig>>(
    config: KnownKeysOnly<TConfig, SearchPaginatedConfig<TSchema, TTableConfig>>
  ): GelRelationalQuery<
    TSchema,
    TTableConfig,
    PaginatedResult<BuildQueryResult<TSchema, TTableConfig, TConfig>>
  >;
  findMany<TConfig extends SearchNonPaginatedConfig<TSchema, TTableConfig>>(
    config: KnownKeysOnly<
      TConfig,
      SearchNonPaginatedConfig<TSchema, TTableConfig>
    >
  ): GelRelationalQuery<
    TSchema,
    TTableConfig,
    BuildQueryResult<TSchema, TTableConfig, TConfig>[]
  >;
  findMany<TConfig extends VectorNonPaginatedConfig<TSchema, TTableConfig>>(
    config: KnownKeysOnly<
      TConfig,
      VectorNonPaginatedConfig<TSchema, TTableConfig>
    >
  ): GelRelationalQuery<
    TSchema,
    TTableConfig,
    BuildQueryResult<TSchema, TTableConfig, TConfig>[]
  >;
  findMany<
    TIndexName extends PredicateIndexName<TTableConfig>,
    TConfig extends PredicatePaginatedConfig<TSchema, TTableConfig, TIndexName>,
  >(
    config: PredicatePaginatedConfig<TSchema, TTableConfig, TIndexName> &
      TConfig
  ): GelRelationalQuery<
    TSchema,
    TTableConfig,
    PaginatedResult<BuildQueryResult<TSchema, TTableConfig, TConfig>>
  >;
  findMany<
    TIndexName extends PredicateIndexName<TTableConfig>,
    TConfig extends PredicateNonPaginatedConfig<
      TSchema,
      TTableConfig,
      TIndexName
    >,
  >(
    config: PredicateNonPaginatedConfig<TSchema, TTableConfig, TIndexName> &
      TConfig
  ): GelRelationalQuery<
    TSchema,
    TTableConfig,
    BuildQueryResult<TSchema, TTableConfig, TConfig>[]
  >;
  findMany<TConfig extends PaginatedConfigNoSearch<TSchema, TTableConfig>>(
    config: KnownKeysOnly<
      TConfig,
      PaginatedConfigNoSearch<TSchema, TTableConfig>
    > &
      EnforcedConfig<TConfig, TTableConfig>
  ): GelRelationalQuery<
    TSchema,
    TTableConfig,
    PaginatedResult<BuildQueryResult<TSchema, TTableConfig, TConfig>>
  >;
  findMany<TConfig extends NonPaginatedConfigNoSearch<TSchema, TTableConfig>>(
    config?: KnownKeysOnly<
      TConfig,
      NonPaginatedConfigNoSearch<TSchema, TTableConfig>
    > &
      EnforcedConfig<TConfig, TTableConfig>
  ): GelRelationalQuery<
    TSchema,
    TTableConfig,
    FindManyResult<TSchema, TTableConfig, TConfig>
  >;
  findMany(config?: any): GelRelationalQuery<TSchema, TTableConfig, any> {
    return new GelRelationalQuery<TSchema, TTableConfig, any>(
      this.schema,
      this.tableConfig,
      this.edgeMetadata,
      this.db,
      config
        ? (config as DBQueryConfig<'many', true, TSchema, TTableConfig>)
        : ({} as DBQueryConfig<'many', true, TSchema, TTableConfig>),
      'many',
      this.allEdges, // M6.5 Phase 2: Pass all edges for nested loading
      this.rls,
      this.relationLoading,
      this.vectorSearch
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
  findFirst<TConfig extends SearchFindFirstConfig<TSchema, TTableConfig>>(
    config: KnownKeysOnly<TConfig, SearchFindFirstConfig<TSchema, TTableConfig>>
  ): GelRelationalQuery<
    TSchema,
    TTableConfig,
    BuildQueryResult<TSchema, TTableConfig, TConfig> | undefined
  >;
  findFirst<TConfig extends FindFirstConfigNoSearch<TSchema, TTableConfig>>(
    config?: KnownKeysOnly<
      TConfig,
      FindFirstConfigNoSearch<TSchema, TTableConfig>
    > &
      EnforcedConfig<TConfig, TTableConfig>
  ): GelRelationalQuery<
    TSchema,
    TTableConfig,
    BuildQueryResult<TSchema, TTableConfig, TConfig> | undefined
  >;
  findFirst(config?: any): GelRelationalQuery<TSchema, TTableConfig, any> {
    return new GelRelationalQuery<TSchema, TTableConfig, any>(
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
      this.rls,
      this.relationLoading,
      this.vectorSearch
    );
  }
}
