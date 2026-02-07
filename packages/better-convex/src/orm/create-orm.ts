import {
  type GenericDatabaseReader,
  type GenericDatabaseWriter,
  internalMutationGeneric,
  type SchedulableFunctionReference,
  type Scheduler,
} from 'convex/server';
import { v } from 'convex/values';
import {
  type CreateDatabaseOptions,
  createDatabase,
  type DatabaseWithMutations,
  type DatabaseWithQuery,
  type DatabaseWithSkipRules,
} from './database';
import { extractRelationsConfig } from './extractRelationsConfig';
import type { TablesRelationalConfig } from './relations';
import { scheduledDeleteFactory } from './scheduled-delete';
import { scheduledMutationBatchFactory } from './scheduled-mutation-batch';
import type { VectorSearchProvider } from './types';

export type OrmFunctions = {
  scheduledMutationBatch: SchedulableFunctionReference;
  scheduledDelete: SchedulableFunctionReference;
};

export type CreateOrmDbOptions = Omit<CreateDatabaseOptions, never>;

type OrmDbWriterCtx = {
  db: GenericDatabaseWriter<any>;
  scheduler?: Scheduler;
  vectorSearch?: VectorSearchProvider;
};

type OrmDbReaderCtx = {
  db: GenericDatabaseReader<any>;
  scheduler?: Scheduler;
  vectorSearch?: VectorSearchProvider;
};

type OrmDbSource =
  | GenericDatabaseReader<any>
  | GenericDatabaseWriter<any>
  | OrmDbReaderCtx
  | OrmDbWriterCtx;

type OrmDbResult<
  TSource extends OrmDbSource,
  TSchema extends TablesRelationalConfig,
> = TSource extends GenericDatabaseWriter<any> | OrmDbWriterCtx
  ? DatabaseWithSkipRules<DatabaseWithMutations<TSchema>>
  : DatabaseWithSkipRules<DatabaseWithQuery<TSchema>>;

type CreateOrmConfigBase<TSchema extends TablesRelationalConfig> = {
  schema: TSchema;
  internalMutation?: typeof internalMutationGeneric;
};

type CreateOrmConfigWithFunctions<TSchema extends TablesRelationalConfig> =
  CreateOrmConfigBase<TSchema> & {
    ormFunctions: OrmFunctions;
  };

type CreateOrmConfigWithoutFunctions<TSchema extends TablesRelationalConfig> =
  CreateOrmConfigBase<TSchema> & {
    ormFunctions?: undefined;
  };

type OrmDbFactory<TSchema extends TablesRelationalConfig> = <
  TSource extends OrmDbSource,
>(
  source: TSource,
  options?: CreateOrmDbOptions
) => OrmDbResult<TSource, TSchema>;

type OrmApiResult = {
  scheduledMutationBatch: ReturnType<typeof internalMutationGeneric>;
  scheduledDelete: ReturnType<typeof internalMutationGeneric>;
};

type OrmClientBase<TSchema extends TablesRelationalConfig> = {
  db: OrmDbFactory<TSchema>;
};

type OrmClientWithApi<TSchema extends TablesRelationalConfig> =
  OrmClientBase<TSchema> & {
    api: () => OrmApiResult;
  };

function isOrmCtx(
  source: OrmDbSource
): source is OrmDbReaderCtx | OrmDbWriterCtx {
  return !!source && typeof source === 'object' && 'db' in source;
}

function createDbFactory<TSchema extends TablesRelationalConfig>(
  schema: TSchema,
  ormFunctions?: OrmFunctions
): OrmDbFactory<TSchema> {
  const edgeMetadata = extractRelationsConfig(schema as TablesRelationalConfig);
  return (<TSource extends OrmDbSource>(
    source: TSource,
    options?: CreateOrmDbOptions
  ): OrmDbResult<TSource, TSchema> => {
    const ctxSource = isOrmCtx(source) ? source : undefined;
    const rawDb: GenericDatabaseReader<any> | GenericDatabaseWriter<any> =
      ctxSource
        ? ctxSource.db
        : (source as GenericDatabaseReader<any> | GenericDatabaseWriter<any>);
    const scheduler = options?.scheduler ?? ctxSource?.scheduler;
    const vectorSearch = options?.vectorSearch ?? ctxSource?.vectorSearch;
    const scheduledDelete =
      options?.scheduledDelete ?? ormFunctions?.scheduledDelete;
    const scheduledMutationBatch =
      options?.scheduledMutationBatch ?? ormFunctions?.scheduledMutationBatch;

    return createDatabase(rawDb, schema, edgeMetadata, {
      ...options,
      scheduler,
      vectorSearch,
      scheduledDelete,
      scheduledMutationBatch,
    }) as OrmDbResult<TSource, TSchema>;
  }) as OrmDbFactory<TSchema>;
}

export function createOrm<TSchema extends TablesRelationalConfig>(
  config: CreateOrmConfigWithoutFunctions<TSchema>
): OrmClientBase<TSchema>;
export function createOrm<TSchema extends TablesRelationalConfig>(
  config: CreateOrmConfigWithFunctions<TSchema>
): OrmClientWithApi<TSchema>;
export function createOrm<TSchema extends TablesRelationalConfig>(
  config:
    | CreateOrmConfigWithFunctions<TSchema>
    | CreateOrmConfigWithoutFunctions<TSchema>
): OrmClientBase<TSchema> | OrmClientWithApi<TSchema> {
  const edgeMetadata = extractRelationsConfig(
    config.schema as TablesRelationalConfig
  );
  const db = createDbFactory(config.schema, config.ormFunctions);

  if (!config.ormFunctions) {
    return { db };
  }

  const mutationBuilder = config.internalMutation ?? internalMutationGeneric;
  return {
    db,
    api: () => ({
      scheduledMutationBatch: mutationBuilder({
        args: v.any(),
        handler: scheduledMutationBatchFactory(
          config.schema,
          edgeMetadata,
          config.ormFunctions.scheduledMutationBatch
        ) as any,
      }),
      scheduledDelete: mutationBuilder({
        args: v.any(),
        handler: scheduledDeleteFactory(config.schema, edgeMetadata) as any,
      }),
    }),
  };
}

export type {
  OrmApiResult,
  OrmClientBase,
  OrmClientWithApi,
  OrmDbReaderCtx,
  OrmDbWriterCtx,
};
export type { ScheduledDeleteArgs } from './scheduled-delete';
export type { ScheduledMutationBatchArgs } from './scheduled-mutation-batch';
