import {
  type CreateDatabaseOptions,
  createDatabase,
  type DatabaseWithMutations,
  type DatabaseWithSkipRules,
  type EdgeMetadata,
  extractRelationsConfig,
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

const defaultEdges = extractRelationsConfig(relations);

export const getCtxWithTable = <
  Ctx extends { db: GenericDatabaseWriter<any> },
  Schema extends TablesRelationalConfig,
>(
  ctx: Ctx,
  schema: Schema,
  edges: EdgeMetadata[],
  options?: CreateDatabaseOptions
) => {
  const ctxWithTable = { ...ctx } as Ctx & {
    table: DatabaseWithSkipRules<DatabaseWithMutations<Schema>>;
    skipRules: DatabaseWithSkipRules<
      DatabaseWithMutations<Schema>
    >['skipRules'];
  };
  const rls =
    options?.rls && options.rls.ctx
      ? options.rls
      : { ...(options?.rls ?? {}), ctx: ctxWithTable };
  const table = createDatabase(ctx.db, schema, edges, { ...options, rls });
  ctxWithTable.table = table as DatabaseWithSkipRules<
    DatabaseWithMutations<Schema>
  >;
  ctxWithTable.skipRules = table.skipRules;
  return ctxWithTable;
};

// Default context wrapper that attaches Better Convex ORM as ctx.table
export async function runCtx<T extends { db: GenericDatabaseWriter<any> }>(
  ctx: T
): Promise<ReturnType<typeof getCtxWithTable<T, typeof relations>>> {
  return getCtxWithTable(ctx, relations, defaultEdges);
}

export type TestCtx = Awaited<ReturnType<typeof runCtx>>;

export async function withTableCtx<
  Schema extends SchemaDefinition<any, any>,
  Relations extends TablesRelationalConfig,
  Result,
>(
  schema: Schema,
  relationsConfig: Relations,
  edges: EdgeMetadata[],
  fn: (ctx: {
    table: DatabaseWithSkipRules<DatabaseWithMutations<Relations>>;
    skipRules: DatabaseWithSkipRules<
      DatabaseWithMutations<Relations>
    >['skipRules'];
    db: GenericDatabaseWriter<any>;
  }) => Promise<Result>,
  options?: CreateDatabaseOptions
): Promise<Result> {
  const t = convexTest(schema);
  let result: Result | undefined;
  await t.run(async (baseCtx) => {
    const ctx = getCtxWithTable(baseCtx, relationsConfig, edges, options);
    result = await fn(ctx);
  });
  return result as Result;
}
