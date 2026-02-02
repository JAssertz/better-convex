/**
 * RelationalQueryBuilder - Entry point for query builder API
 *
 * Provides findMany() and findFirst() methods following Drizzle's pattern:
 * - ctx.db.query.users.findMany({ with: { posts: true } })
 * - ctx.db.query.users.findFirst({ where: ... })
 */

import type { GenericDatabaseReader } from 'convex/server';
import type { EdgeMetadata } from './extractRelationsConfig';
import { GelRelationalQuery } from './query';
import type {
  BuildQueryResult,
  DBQueryConfig,
  TableRelationalConfig,
  TablesRelationalConfig,
} from './types';

/**
 * Query builder for a specific table
 *
 * @template TSchema - Full schema configuration
 * @template TTableConfig - Configuration for this table
 *
 * Pattern from Drizzle: gel-core/query-builders/query.ts
 */
export class RelationalQueryBuilder<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
> {
  constructor(
    private fullSchema: TSchema,
    private tableConfig: TTableConfig,
    private edgeMetadata: EdgeMetadata[],
    private db: GenericDatabaseReader<any>
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
   *   where: (cols, { eq }) => eq(cols.name, 'Alice'),
   *   limit: 10
   * });
   */
  findMany<TConfig extends DBQueryConfig<'many', TSchema, TTableConfig>>(
    config?: TConfig
  ): GelRelationalQuery<BuildQueryResult<TSchema, TTableConfig, TConfig>[]> {
    return new GelRelationalQuery(
      this.fullSchema,
      this.tableConfig,
      this.edgeMetadata,
      this.db,
      config ?? ({} as any),
      'many'
    ) as any;
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
   *   where: (cols, { eq }) => eq(cols.email, 'alice@example.com'),
   *   with: { profile: true }
   * });
   */
  findFirst<
    TConfig extends Omit<DBQueryConfig<'many', TSchema, TTableConfig>, 'limit'>,
  >(
    config?: TConfig
  ): GelRelationalQuery<
    BuildQueryResult<TSchema, TTableConfig, TConfig> | undefined
  > {
    return new GelRelationalQuery(
      this.fullSchema,
      this.tableConfig,
      this.edgeMetadata,
      this.db,
      { ...(config ?? ({} as any)), limit: 1 },
      'first'
    ) as any;
  }
}
