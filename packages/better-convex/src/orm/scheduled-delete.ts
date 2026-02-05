import type { GenericDatabaseWriter } from 'convex/server';
import type { GenericId } from 'convex/values';
import { createDatabase } from './database';
import type { EdgeMetadata } from './extractRelationsConfig';
import { eq } from './filter-expression';
import type { CascadeMode } from './mutation-utils';
import type { TablesRelationalConfig } from './relations';
import type { ConvexTableWithColumns } from './table';

export type ScheduledDeleteArgs = {
  table: string;
  id: GenericId<any>;
  cascadeMode?: CascadeMode;
};

export function scheduledDeleteFactory<TSchema extends TablesRelationalConfig>(
  schema: TSchema,
  edgeMetadata: EdgeMetadata[]
) {
  const tableByName = new Map<string, ConvexTableWithColumns<any>>();
  for (const tableConfig of Object.values(schema)) {
    if (tableConfig?.name && tableConfig.table) {
      tableByName.set(
        tableConfig.name,
        tableConfig.table as ConvexTableWithColumns<any>
      );
    }
  }

  return async function scheduledDelete(
    ctx: { db: GenericDatabaseWriter<any> },
    args: ScheduledDeleteArgs
  ) {
    const table = tableByName.get(args.table);
    if (!table) {
      throw new Error(`scheduledDelete: unknown table '${args.table}'.`);
    }
    const db = createDatabase(ctx.db, schema, edgeMetadata);
    await db
      .delete(table)
      .cascade({ mode: args.cascadeMode ?? 'hard' })
      .where(eq(table._id, args.id as any))
      .execute();
  };
}
