import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericDataModel,
} from 'convex/server';
import { Triggers } from '../internal/upstream/server/triggers';
import type { TablesRelationalConfig } from './relations';
import {
  getTableLifecycleHooks,
  type OrmLifecycleConfig,
  type OrmLifecycleOperation,
} from './table';

const ORMLIFECYCLE_WRAPPED_DB = Symbol.for(
  'better-convex:OrmLifecycleWrappedDB'
);

type AnyCtx = {
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>;
} & Record<string, unknown>;
type AnyMutationCtx = {
  db: GenericDatabaseWriter<any>;
} & Record<string, unknown>;

const isWriterDb = (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>
): db is GenericDatabaseWriter<any> =>
  typeof (db as any).insert === 'function' &&
  typeof (db as any).patch === 'function' &&
  typeof (db as any).delete === 'function';

const isLifecycleWrappedDb = (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>
): boolean => (db as any)[ORMLIFECYCLE_WRAPPED_DB] === true;

const markLifecycleWrappedDb = <TDb extends GenericDatabaseWriter<any>>(
  db: TDb
): TDb => {
  if (!Object.hasOwn(db as object, ORMLIFECYCLE_WRAPPED_DB)) {
    Object.defineProperty(db, ORMLIFECYCLE_WRAPPED_DB, {
      configurable: false,
      enumerable: false,
      value: true,
      writable: false,
    });
  }
  return db;
};

const shouldRun = (
  config: OrmLifecycleConfig,
  operation: OrmLifecycleOperation
): boolean => config.operation === 'change' || config.operation === operation;

export type OrmDbLifecycle = {
  enabled: boolean;
  wrapDB<Ctx extends AnyCtx>(ctx: Ctx): Ctx;
};

const createNoopLifecycle = (): OrmDbLifecycle => ({
  enabled: false,
  wrapDB: <Ctx extends AnyCtx>(ctx: Ctx): Ctx => ctx,
});

export function createOrmDbLifecycle<
  TSchema extends TablesRelationalConfig,
  DataModel extends GenericDataModel = GenericDataModel,
>(schema: TSchema): OrmDbLifecycle {
  const tableHooks = new Map<string, OrmLifecycleConfig[]>();

  for (const tableConfig of Object.values(schema)) {
    if (!tableConfig?.table) {
      continue;
    }
    const tableName =
      (tableConfig.table as any).tableName ??
      (tableConfig.table as any)?._?.name ??
      tableConfig.name;
    const hooks = getTableLifecycleHooks(tableConfig.table as any);
    if (hooks.length > 0) {
      tableHooks.set(tableName, hooks);
    }
  }

  if (tableHooks.size === 0) {
    return createNoopLifecycle();
  }

  const triggers = new Triggers<DataModel, AnyMutationCtx>();

  for (const [tableName, hooks] of tableHooks.entries()) {
    for (const config of hooks) {
      triggers.register(tableName as any, async (ctx, change) => {
        if (!shouldRun(config, change.operation)) {
          return;
        }
        await config.handler(ctx as any, change as any);
      });
    }
  }

  return {
    enabled: true,
    wrapDB: <Ctx extends AnyCtx>(ctx: Ctx): Ctx => {
      if (!isWriterDb(ctx.db) || isLifecycleWrappedDb(ctx.db)) {
        return ctx;
      }
      const wrapped = triggers.wrapDB(ctx as AnyMutationCtx) as Ctx;
      return {
        ...wrapped,
        db: markLifecycleWrappedDb(
          wrapped.db as GenericDatabaseWriter<any>
        ) as Ctx['db'],
      };
    },
  };
}
