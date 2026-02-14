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
  type OrmReader,
  type OrmWriter,
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

export type CreateOrmOptions = Omit<CreateDatabaseOptions, never>;

type OrmWriterCtx = {
  db: GenericDatabaseWriter<any>;
  scheduler?: Scheduler;
  vectorSearch?: VectorSearchProvider;
};

type OrmReaderCtx = {
  db: GenericDatabaseReader<any>;
  scheduler?: Scheduler;
  vectorSearch?: VectorSearchProvider;
};

type OrmSource =
  | GenericDatabaseReader<any>
  | GenericDatabaseWriter<any>
  | OrmReaderCtx
  | OrmWriterCtx;

type OrmResult<
  TSource extends OrmSource,
  TSchema extends TablesRelationalConfig,
> = TSource extends GenericDatabaseWriter<any> | OrmWriterCtx
  ? OrmWriter<TSchema>
  : OrmReader<TSchema>;

type GenericOrm<
  Ctx extends { db: GenericDatabaseReader<any> | GenericDatabaseWriter<any> },
  TSchema extends TablesRelationalConfig,
> = Ctx extends { db: GenericDatabaseWriter<any> }
  ? OrmWriter<TSchema>
  : OrmReader<TSchema>;

type GenericOrmCtx<
  Ctx extends { db: GenericDatabaseReader<any> | GenericDatabaseWriter<any> },
  TSchema extends TablesRelationalConfig,
> = Ctx & { orm: GenericOrm<Ctx, TSchema> };

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

type OrmFactory<TSchema extends TablesRelationalConfig> = <
  TSource extends OrmSource,
>(
  source: TSource,
  options?: CreateOrmOptions
) => OrmResult<TSource, TSchema>;

type OrmApiResult = {
  scheduledMutationBatch: ReturnType<typeof internalMutationGeneric>;
  scheduledDelete: ReturnType<typeof internalMutationGeneric>;
};

type OrmClientBase<TSchema extends TablesRelationalConfig> = {
  db: OrmFactory<TSchema>;
};

type OrmClientWithApi<TSchema extends TablesRelationalConfig> =
  OrmClientBase<TSchema> & {
    api: () => OrmApiResult;
  };

function isOrmCtx(source: OrmSource): source is OrmReaderCtx | OrmWriterCtx {
  return !!source && typeof source === 'object' && 'db' in source;
}

function createDbFactory<TSchema extends TablesRelationalConfig>(
  schema: TSchema,
  ormFunctions?: OrmFunctions
): OrmFactory<TSchema> {
  const edgeMetadata = extractRelationsConfig(schema as TablesRelationalConfig);
  return (<TSource extends OrmSource>(
    source: TSource,
    options?: CreateOrmOptions
  ): OrmResult<TSource, TSchema> => {
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
    }) as OrmResult<TSource, TSchema>;
  }) as OrmFactory<TSchema>;
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
        handler: scheduledDeleteFactory(
          config.schema,
          edgeMetadata,
          config.ormFunctions.scheduledMutationBatch
        ) as any,
      }),
    }),
  };
}

export type {
  GenericOrm,
  GenericOrmCtx,
  OrmApiResult,
  OrmClientBase,
  OrmClientWithApi,
  OrmReaderCtx,
  OrmWriterCtx,
};
export type { ScheduledDeleteArgs } from './scheduled-delete';
export type { ScheduledMutationBatchArgs } from './scheduled-mutation-batch';
