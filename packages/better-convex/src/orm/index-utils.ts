import type { ConvexTable } from './table';

export type TableIndex = { name: string; fields: string[] };

export function getIndexes(
  table: ConvexTable<any>
): { name: string; fields: string[] }[] {
  const fromMethod = (table as any).getIndexes?.();
  if (Array.isArray(fromMethod)) {
    return fromMethod;
  }
  const fromField = (table as any).indexes;
  if (!Array.isArray(fromField)) {
    return [];
  }
  return fromField.map(
    (entry: { indexDescriptor: string; fields: string[] }) => ({
      name: entry.indexDescriptor,
      fields: entry.fields,
    })
  );
}

export function findIndexForColumns(
  indexes: TableIndex[],
  columns: string[]
): string | null {
  for (const index of indexes) {
    if (index.fields.length < columns.length) {
      continue;
    }
    let matches = true;
    for (let i = 0; i < columns.length; i++) {
      if (index.fields[i] !== columns[i]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return index.name;
    }
  }
  return null;
}

export function findRelationIndexOrThrow(
  table: ConvexTable<any>,
  columns: string[],
  relationName: string,
  targetTableName: string
): string {
  const index = findRelationIndex(
    table,
    columns,
    relationName,
    targetTableName
  );
  if (!index) {
    throw new Error(
      `Relation ${relationName} requires index on '${targetTableName}(${columns.join(
        ', '
      )})'.`
    );
  }
  return index;
}

export function findRelationIndex(
  table: ConvexTable<any>,
  columns: string[],
  relationName: string,
  targetTableName: string,
  strict = true
): string | null {
  const index = findIndexForColumns(getIndexes(table), columns);
  if (!index && strict) {
    throw new Error(
      `Relation ${relationName} requires index on '${targetTableName}(${columns.join(
        ', '
      )})'.`
    );
  }
  return index;
}
