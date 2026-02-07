import {
  type CreateOrmDbOptions,
  createOrm,
  type DatabaseWithMutations,
  type DatabaseWithSkipRules,
  type TablesRelationalConfig,
} from 'better-convex/orm';
import type {
  GenericDatabaseWriter,
  SchemaDefinition,
  StorageActionWriter,
} from 'convex/server';
import { convexTest as baseConvexTest } from 'convex-test';
import { relations } from './schema';

export function convexTest<Schema extends SchemaDefinition<any, any>>(
  schema: Schema
) {
  return baseConvexTest(schema);
}

export const getOrmCtx = <
  Ctx extends { db: GenericDatabaseWriter<any> },
  Schema extends TablesRelationalConfig,
>(
  ctx: Ctx,
  schema: Schema,
  options?: CreateOrmDbOptions
) => {
  const ctxWithOrm = { ...ctx } as Ctx & {
    orm: DatabaseWithSkipRules<DatabaseWithMutations<Schema>>;
  };
  const rls =
    options?.rls && options.rls.ctx
      ? options.rls
      : { ...(options?.rls ?? {}), ctx: ctxWithOrm };
  const orm = createOrm({ schema });
  const ormDb = orm.db(ctx, { ...options, rls });
  ctxWithOrm.orm = ormDb as DatabaseWithSkipRules<
    DatabaseWithMutations<Schema>
  >;
  return ctxWithOrm;
};

// Default context wrapper that attaches Better Convex ORM as ctx.orm
export async function runCtx<T extends { db: GenericDatabaseWriter<any> }>(
  ctx: T
): Promise<ReturnType<typeof getOrmCtx<T, typeof relations>>> {
  return getOrmCtx(ctx, relations);
}

export type TestCtx = Awaited<ReturnType<typeof runCtx>>;

export async function withOrmCtx<
  Schema extends SchemaDefinition<any, any>,
  Relations extends TablesRelationalConfig,
  Result,
>(
  schema: Schema,
  relationsConfig: Relations,
  fn: (ctx: {
    orm: DatabaseWithSkipRules<DatabaseWithMutations<Relations>>;
    db: GenericDatabaseWriter<any>;
  }) => Promise<Result>,
  options?: CreateOrmDbOptions
): Promise<Result> {
  const t = convexTest(schema);
  let result: Result | undefined;
  await t.run(async (baseCtx) => {
    const ctx = getOrmCtx(baseCtx, relationsConfig, options);
    result = await fn(ctx);
  });
  return result as Result;
}
