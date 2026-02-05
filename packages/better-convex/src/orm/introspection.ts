import type { ColumnBuilder } from './builders/column-builder';
import type { SystemFields } from './builders/system-fields';
import { createSystemFields } from './builders/system-fields';
import {
  getChecks,
  getForeignKeys,
  getIndexes,
  getTableName,
  getUniqueIndexes,
} from './mutation-utils';
import type { RlsPolicy } from './rls/policies';
import { Columns, EnableRLS, RlsPolicies } from './symbols';
import type { ConvexTable } from './table';

type AnyColumns = Record<string, ColumnBuilder<any, any, any>>;

function getSystemFields<TTable extends ConvexTable<any>>(
  table: TTable
): SystemFields<TTable['_']['name']> {
  if ((table as any)._id && (table as any)._creationTime) {
    return {
      _id: (table as any)._id,
      _creationTime: (table as any)._creationTime,
    } as SystemFields<TTable['_']['name']>;
  }

  const system = createSystemFields(getTableName(table) as TTable['_']['name']);
  for (const builder of Object.values(system)) {
    (builder as any).config.table = table;
  }
  return system;
}

export function getTableColumns<TTable extends ConvexTable<any>>(
  table: TTable
): TTable[typeof Columns] & SystemFields<TTable['_']['name']> {
  return {
    ...(((table as any)[Columns] ?? {}) as AnyColumns),
    ...getSystemFields(table),
  } as TTable[typeof Columns] & SystemFields<TTable['_']['name']>;
}

export type TableConfigResult<TTable extends ConvexTable<any>> = {
  name: string;
  columns: ReturnType<typeof getTableColumns<TTable>>;
  indexes: ReturnType<typeof getIndexes>;
  uniqueIndexes: ReturnType<typeof getUniqueIndexes>;
  foreignKeys: ReturnType<typeof getForeignKeys>;
  checks: ReturnType<typeof getChecks>;
  rls: {
    enabled: boolean;
    policies: RlsPolicy[];
  };
};

export function getTableConfig<TTable extends ConvexTable<any>>(
  table: TTable
): TableConfigResult<TTable> {
  const policies: RlsPolicy[] =
    (table as any).getRlsPolicies?.() ?? (table as any)[RlsPolicies] ?? [];
  const enabled: boolean =
    (table as any).isRlsEnabled?.() ?? (table as any)[EnableRLS] ?? false;

  return {
    name: getTableName(table),
    columns: getTableColumns(table),
    indexes: getIndexes(table),
    uniqueIndexes: getUniqueIndexes(table),
    foreignKeys: getForeignKeys(table),
    checks: getChecks(table),
    rls: { enabled, policies },
  };
}
