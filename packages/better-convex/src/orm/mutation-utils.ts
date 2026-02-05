import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
  SchedulableFunctionReference,
  Scheduler,
} from 'convex/server';
import type {
  ColumnBuilder,
  ForeignKeyAction,
} from './builders/column-builder';
import type {
  BinaryExpression,
  ExpressionVisitor,
  FilterExpression,
  LogicalExpression,
  UnaryExpression,
} from './filter-expression';
import { isFieldReference } from './filter-expression';
import type { TablesRelationalConfig } from './relations';
import type { RlsContext } from './rls/types';
import { Columns, OrmContext, TableName } from './symbols';
import type { ConvexTable } from './table';

type UniqueIndexDefinition = {
  name: string;
  fields: string[];
  nullsNotDistinct: boolean;
};

type CheckDefinition = {
  name: string;
  expression: FilterExpression<boolean>;
};

export type IncomingForeignKeyDefinition = {
  sourceTable: ConvexTable<any>;
  sourceTableName: string;
  sourceColumns: string[];
  targetTableName: string;
  targetColumns: string[];
  onDelete?: ForeignKeyAction;
  onUpdate?: ForeignKeyAction;
};

export type ForeignKeyGraph = {
  incomingByTable: Map<string, IncomingForeignKeyDefinition[]>;
};

export type OrmContextValue = {
  foreignKeyGraph?: ForeignKeyGraph;
  scheduler?: Scheduler;
  scheduledDelete?: SchedulableFunctionReference;
  rls?: RlsContext;
};

type ForeignKeyDefinition = {
  name?: string;
  columns: string[];
  foreignColumns: string[];
  foreignTableName: string;
  foreignTable?: ConvexTable<any>;
  onDelete?: ForeignKeyAction;
  onUpdate?: ForeignKeyAction;
};

export function getTableName(table: ConvexTable<any>): string {
  const name =
    (table as any).tableName ??
    (table as any)[TableName] ??
    (table as any)?._?.name;
  if (!name) {
    throw new Error('Table is missing a name');
  }
  return name;
}

export function getUniqueIndexes(
  table: ConvexTable<any>
): UniqueIndexDefinition[] {
  const fromMethod = (table as any).getUniqueIndexes?.();
  if (Array.isArray(fromMethod)) {
    return fromMethod;
  }
  const fromField = (table as any).uniqueIndexes;
  return Array.isArray(fromField) ? fromField : [];
}

export function getChecks(table: ConvexTable<any>): CheckDefinition[] {
  const fromMethod = (table as any).getChecks?.();
  if (Array.isArray(fromMethod)) {
    return fromMethod;
  }
  const fromField = (table as any).checks;
  return Array.isArray(fromField) ? fromField : [];
}

export function buildForeignKeyGraph(
  schema: TablesRelationalConfig
): ForeignKeyGraph {
  const tableByName = new Map<string, ConvexTable<any>>();
  for (const tableConfig of Object.values(schema)) {
    if (tableConfig?.name && tableConfig.table) {
      tableByName.set(tableConfig.name, tableConfig.table as ConvexTable<any>);
    }
  }

  const incomingByTable = new Map<string, IncomingForeignKeyDefinition[]>();

  for (const tableConfig of Object.values(schema)) {
    const sourceTable = tableConfig.table as ConvexTable<any>;
    const sourceTableName = tableConfig.name;
    const foreignKeys = getForeignKeys(sourceTable);

    for (const foreignKey of foreignKeys) {
      const targetTableName = foreignKey.foreignTableName;
      const targetTable = tableByName.get(targetTableName);
      if (!targetTable) {
        throw new Error(
          `Foreign key from '${sourceTableName}' references missing table '${targetTableName}'.`
        );
      }

      const entry: IncomingForeignKeyDefinition = {
        sourceTable,
        sourceTableName,
        sourceColumns: foreignKey.columns,
        targetTableName,
        targetColumns: foreignKey.foreignColumns,
        onDelete: foreignKey.onDelete,
        onUpdate: foreignKey.onUpdate,
      };

      const list = incomingByTable.get(targetTableName) ?? [];
      list.push(entry);
      incomingByTable.set(targetTableName, list);
    }
  }

  return { incomingByTable };
}

export function getOrmContext(
  db: GenericDatabaseWriter<any> | GenericDatabaseReader<any>
): OrmContextValue | undefined {
  return (db as any)[OrmContext] as OrmContextValue | undefined;
}

export function getForeignKeys(
  table: ConvexTable<any>
): ForeignKeyDefinition[] {
  const fromMethod = (table as any).getForeignKeys?.();
  if (Array.isArray(fromMethod)) {
    return fromMethod;
  }
  const fromField = (table as any).foreignKeys;
  return Array.isArray(fromField) ? fromField : [];
}

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

function findIndexForColumns(
  indexes: { name: string; fields: string[] }[],
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

export function getColumnName(column: ColumnBuilder<any, any, any>): string {
  const name = (column as any).config?.name ?? (column as any)?._?.name;
  if (!name) {
    throw new Error('Column builder is missing a column name');
  }
  return name;
}

export function getTableColumns(
  table: ConvexTable<any>
): Record<string, ColumnBuilder<any, any, any>> {
  return ((table as any)[Columns] ?? {}) as Record<
    string,
    ColumnBuilder<any, any, any>
  >;
}

function getColumnConfig(
  table: ConvexTable<any>,
  columnName: string
): {
  notNull?: boolean;
  hasDefault?: boolean;
  default?: unknown;
} | null {
  const columns = getTableColumns(table);
  const builder = columns[columnName];
  if (!builder) {
    return null;
  }
  return (builder as any).config ?? null;
}

export function applyDefaults<TValue extends Record<string, unknown>>(
  table: ConvexTable<any>,
  value: TValue
): TValue {
  const columns = (table as any)[Columns] as
    | Record<string, ColumnBuilder<any, any, any>>
    | undefined;
  if (!columns) {
    return value;
  }

  const result = { ...value } as TValue;
  for (const [columnName, builder] of Object.entries(columns)) {
    if ((result as any)[columnName] !== undefined) {
      continue;
    }

    const config = (builder as any).config as
      | {
          hasDefault?: boolean;
          default?: unknown;
          defaultFn?: (() => unknown) | undefined;
          onUpdateFn?: (() => unknown) | undefined;
        }
      | undefined;

    if (!config) {
      continue;
    }

    if (typeof config.defaultFn === 'function') {
      (result as any)[columnName] = config.defaultFn();
      continue;
    }

    if (config.hasDefault) {
      (result as any)[columnName] = config.default;
      continue;
    }

    if (typeof config.onUpdateFn === 'function') {
      (result as any)[columnName] = config.onUpdateFn();
    }
  }
  return result;
}

export async function enforceUniqueIndexes(
  db: GenericDatabaseWriter<any>,
  table: ConvexTable<any>,
  candidate: Record<string, unknown>,
  options?: { currentId?: unknown; changedFields?: Set<string> }
): Promise<void> {
  const uniqueIndexes = getUniqueIndexes(table);
  if (uniqueIndexes.length === 0) {
    return;
  }

  const tableName = getTableName(table);
  const changedFields = options?.changedFields;

  for (const index of uniqueIndexes) {
    if (
      changedFields &&
      !index.fields.some((field) => changedFields.has(field))
    ) {
      continue;
    }

    const entries = index.fields.map((field) => [field, candidate[field]]);
    const hasNullish = entries.some(
      ([, value]) => value === undefined || value === null
    );
    if (hasNullish && !index.nullsNotDistinct) {
      continue;
    }

    const existing = await db
      .query(tableName)
      .withIndex(index.name, (q: any) => {
        let builder = q.eq(entries[0][0], entries[0][1]);
        for (let i = 1; i < entries.length; i++) {
          builder = builder.eq(entries[i][0], entries[i][1]);
        }
        return builder;
      })
      .unique();

    if (
      existing !== null &&
      (options?.currentId === undefined ||
        (existing as any)._id !== options.currentId)
    ) {
      throw new Error(
        `Unique index '${index.name}' violation on '${tableName}'.`
      );
    }
  }
}

export async function enforceForeignKeys(
  db: GenericDatabaseWriter<any>,
  table: ConvexTable<any>,
  candidate: Record<string, unknown>,
  options?: { changedFields?: Set<string> }
): Promise<void> {
  const foreignKeys = getForeignKeys(table);
  if (foreignKeys.length === 0) {
    return;
  }

  const tableName = getTableName(table);
  const changedFields = options?.changedFields;

  for (const foreignKey of foreignKeys) {
    if (
      changedFields &&
      !foreignKey.columns.some((field) => changedFields.has(field))
    ) {
      continue;
    }

    const entries = foreignKey.columns.map(
      (field) => [field, candidate[field]] as [string, unknown]
    );
    const hasNullish = entries.some(
      ([, value]) => value === undefined || value === null
    );
    if (hasNullish) {
      continue;
    }

    if (
      foreignKey.foreignColumns.length === 1 &&
      foreignKey.foreignColumns[0] === '_id'
    ) {
      const foreignId = entries[0]?.[1];
      const existing = await db.get(foreignId as any);
      if (!existing) {
        throw new Error(
          `Foreign key violation on '${tableName}': missing document in '${foreignKey.foreignTableName}'.`
        );
      }
      continue;
    }

    if (!foreignKey.foreignTable) {
      throw new Error(
        `Foreign key on '${tableName}' requires indexed foreign columns on '${foreignKey.foreignTableName}'.`
      );
    }

    const indexName = findIndexForColumns(
      getIndexes(foreignKey.foreignTable),
      foreignKey.foreignColumns
    );

    if (!indexName) {
      throw new Error(
        `Foreign key on '${tableName}' requires index on '${foreignKey.foreignTableName}(${foreignKey.foreignColumns.join(
          ', '
        )})'.`
      );
    }

    const foreignRow = await db
      .query(foreignKey.foreignTableName)
      .withIndex(indexName, (q: any) => {
        let builder = q.eq(foreignKey.foreignColumns[0], entries[0][1]);
        for (let i = 1; i < entries.length; i++) {
          builder = builder.eq(foreignKey.foreignColumns[i], entries[i][1]);
        }
        return builder;
      })
      .first();

    if (!foreignRow) {
      throw new Error(
        `Foreign key violation on '${tableName}': missing document in '${foreignKey.foreignTableName}'.`
      );
    }
  }
}

export type DeleteMode = 'hard' | 'soft' | 'scheduled';
export type CascadeMode = 'hard' | 'soft';

function getIndexForForeignKey(
  foreignKey: IncomingForeignKeyDefinition
): string | null {
  return findIndexForColumns(
    getIndexes(foreignKey.sourceTable),
    foreignKey.sourceColumns
  );
}

function foreignKeyIndexError(foreignKey: IncomingForeignKeyDefinition): Error {
  return new Error(
    `Foreign key on '${foreignKey.sourceTableName}' requires index on '${foreignKey.sourceTableName}(${foreignKey.sourceColumns.join(
      ', '
    )})' for cascading actions.`
  );
}

function buildIndexPredicate(q: any, columns: string[], values: unknown[]) {
  let builder = q.eq(columns[0], values[0]);
  for (let i = 1; i < columns.length; i++) {
    builder = builder.eq(columns[i], values[i]);
  }
  return builder;
}

function buildFilterPredicate(q: any, columns: string[], values: unknown[]) {
  let expr = q.eq(q.field(columns[0]), values[0]);
  for (let i = 1; i < columns.length; i++) {
    expr = q.and(expr, q.eq(q.field(columns[i]), values[i]));
  }
  return expr;
}

function ensureNullableColumns(
  table: ConvexTable<any>,
  columns: string[],
  context: string
): void {
  for (const columnName of columns) {
    const config = getColumnConfig(table, columnName);
    if (!config) {
      throw new Error(
        `${context}: missing column '${columnName}' in table '${getTableName(
          table
        )}'.`
      );
    }
    if (config.notNull) {
      throw new Error(
        `${context}: column '${columnName}' is not nullable in '${getTableName(
          table
        )}'.`
      );
    }
  }
}

function ensureDefaultColumns(
  table: ConvexTable<any>,
  columns: string[],
  context: string
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const columnName of columns) {
    const config = getColumnConfig(table, columnName);
    if (!config) {
      throw new Error(
        `${context}: missing column '${columnName}' in table '${getTableName(
          table
        )}'.`
      );
    }
    if (!config.hasDefault) {
      throw new Error(
        `${context}: column '${columnName}' has no default in '${getTableName(
          table
        )}'.`
      );
    }
    defaults[columnName] = config.default;
  }
  return defaults;
}

function ensureNonNullValues(
  table: ConvexTable<any>,
  values: Record<string, unknown>,
  context: string
): void {
  for (const [columnName, value] of Object.entries(values)) {
    const config = getColumnConfig(table, columnName);
    if (config?.notNull && (value === null || value === undefined)) {
      throw new Error(
        `${context}: column '${columnName}' cannot be null in '${getTableName(
          table
        )}'.`
      );
    }
  }
}

async function collectReferencingRows(
  db: GenericDatabaseWriter<any>,
  foreignKey: IncomingForeignKeyDefinition,
  targetValues: unknown[],
  indexName: string
): Promise<Record<string, unknown>[]> {
  const rows = await db
    .query(foreignKey.sourceTableName)
    .withIndex(indexName, (q: any) =>
      buildIndexPredicate(q, foreignKey.sourceColumns, targetValues)
    )
    .collect();
  return rows as Record<string, unknown>[];
}

async function hasReferencingRow(
  db: GenericDatabaseWriter<any>,
  foreignKey: IncomingForeignKeyDefinition,
  targetValues: unknown[],
  indexName?: string | null
): Promise<boolean> {
  const query = db.query(foreignKey.sourceTableName);
  const row = indexName
    ? await query
        .withIndex(indexName, (q: any) =>
          buildIndexPredicate(q, foreignKey.sourceColumns, targetValues)
        )
        .first()
    : await query
        .filter((q: any) =>
          buildFilterPredicate(q, foreignKey.sourceColumns, targetValues)
        )
        .first();
  return row !== null;
}

export async function softDeleteRow(
  db: GenericDatabaseWriter<any>,
  table: ConvexTable<any>,
  row: Record<string, unknown>
) {
  const tableName = getTableName(table);
  const columns = getTableColumns(table);
  if (!('deletionTime' in columns)) {
    throw new Error(
      `Soft delete requires 'deletionTime' field on '${tableName}'.`
    );
  }
  const deletionTime = Date.now();
  await db.patch(tableName, row._id as any, { deletionTime });
}

export async function hardDeleteRow(
  db: GenericDatabaseWriter<any>,
  _tableName: string,
  row: Record<string, unknown>
) {
  await db.delete(row._id as any);
}

export async function applyIncomingForeignKeyActionsOnDelete(
  db: GenericDatabaseWriter<any>,
  table: ConvexTable<any>,
  row: Record<string, unknown>,
  options: {
    graph: ForeignKeyGraph;
    deleteMode: DeleteMode;
    cascadeMode: CascadeMode;
    visited: Set<string>;
  }
): Promise<void> {
  const tableName = getTableName(table);
  const incoming = options.graph.incomingByTable.get(tableName) ?? [];
  if (incoming.length === 0) {
    return;
  }

  for (const foreignKey of incoming) {
    const action = foreignKey.onDelete ?? 'no action';
    const targetValues = foreignKey.targetColumns.map((column) => row[column]);
    if (targetValues.some((value) => value === undefined || value === null)) {
      continue;
    }

    const indexName = getIndexForForeignKey(foreignKey);

    if (action === 'restrict' || action === 'no action') {
      if (await hasReferencingRow(db, foreignKey, targetValues, indexName)) {
        throw new Error(
          `Foreign key restrict violation on '${tableName}' from '${foreignKey.sourceTableName}'.`
        );
      }
      continue;
    }

    if (!indexName) {
      if (await hasReferencingRow(db, foreignKey, targetValues, null)) {
        throw foreignKeyIndexError(foreignKey);
      }
      continue;
    }

    const referencingRows = await collectReferencingRows(
      db,
      foreignKey,
      targetValues,
      indexName
    );
    if (referencingRows.length === 0) {
      continue;
    }

    if (action === 'set null') {
      ensureNullableColumns(
        foreignKey.sourceTable,
        foreignKey.sourceColumns,
        `Foreign key set null on '${foreignKey.sourceTableName}'`
      );
      for (const referencingRow of referencingRows) {
        const patch: Record<string, unknown> = {};
        for (const columnName of foreignKey.sourceColumns) {
          patch[columnName] = null;
        }
        await db.patch(
          foreignKey.sourceTableName,
          referencingRow._id as any,
          patch
        );
      }
      continue;
    }

    if (action === 'set default') {
      const defaults = ensureDefaultColumns(
        foreignKey.sourceTable,
        foreignKey.sourceColumns,
        `Foreign key set default on '${foreignKey.sourceTableName}'`
      );
      for (const referencingRow of referencingRows) {
        await db.patch(
          foreignKey.sourceTableName,
          referencingRow._id as any,
          defaults
        );
      }
      continue;
    }

    if (action === 'cascade') {
      for (const referencingRow of referencingRows) {
        const key = `${foreignKey.sourceTableName}:${referencingRow._id}`;
        if (options.visited.has(key)) {
          continue;
        }
        options.visited.add(key);
        await applyIncomingForeignKeyActionsOnDelete(
          db,
          foreignKey.sourceTable,
          referencingRow,
          options
        );
        if (options.cascadeMode === 'soft') {
          await softDeleteRow(db, foreignKey.sourceTable, referencingRow);
        } else {
          await hardDeleteRow(db, foreignKey.sourceTableName, referencingRow);
        }
      }
    }
  }
}

export async function applyIncomingForeignKeyActionsOnUpdate(
  db: GenericDatabaseWriter<any>,
  table: ConvexTable<any>,
  oldRow: Record<string, unknown>,
  newRow: Record<string, unknown>,
  options: { graph: ForeignKeyGraph }
): Promise<void> {
  const tableName = getTableName(table);
  const incoming = options.graph.incomingByTable.get(tableName) ?? [];
  if (incoming.length === 0) {
    return;
  }

  for (const foreignKey of incoming) {
    const action = foreignKey.onUpdate ?? 'no action';
    const oldValues = foreignKey.targetColumns.map((column) => oldRow[column]);
    const newValues = foreignKey.targetColumns.map((column) => newRow[column]);

    const changed = oldValues.some(
      (value, index) => !Object.is(value, newValues[index])
    );
    if (!changed) {
      continue;
    }

    if (oldValues.some((value) => value === undefined || value === null)) {
      continue;
    }

    const indexName = getIndexForForeignKey(foreignKey);

    if (action === 'restrict' || action === 'no action') {
      if (await hasReferencingRow(db, foreignKey, oldValues, indexName)) {
        throw new Error(
          `Foreign key restrict violation on '${tableName}' from '${foreignKey.sourceTableName}'.`
        );
      }
      continue;
    }

    if (!indexName) {
      if (await hasReferencingRow(db, foreignKey, oldValues, null)) {
        throw foreignKeyIndexError(foreignKey);
      }
      continue;
    }

    const referencingRows = await collectReferencingRows(
      db,
      foreignKey,
      oldValues,
      indexName
    );
    if (referencingRows.length === 0) {
      continue;
    }

    if (action === 'set null') {
      ensureNullableColumns(
        foreignKey.sourceTable,
        foreignKey.sourceColumns,
        `Foreign key set null on '${foreignKey.sourceTableName}'`
      );
      for (const referencingRow of referencingRows) {
        const patch: Record<string, unknown> = {};
        for (const columnName of foreignKey.sourceColumns) {
          patch[columnName] = null;
        }
        await db.patch(
          foreignKey.sourceTableName,
          referencingRow._id as any,
          patch
        );
      }
      continue;
    }

    if (action === 'set default') {
      const defaults = ensureDefaultColumns(
        foreignKey.sourceTable,
        foreignKey.sourceColumns,
        `Foreign key set default on '${foreignKey.sourceTableName}'`
      );
      for (const referencingRow of referencingRows) {
        await db.patch(
          foreignKey.sourceTableName,
          referencingRow._id as any,
          defaults
        );
      }
      continue;
    }

    if (action === 'cascade') {
      const patchValues: Record<string, unknown> = {};
      for (let i = 0; i < foreignKey.sourceColumns.length; i++) {
        patchValues[foreignKey.sourceColumns[i]] = newValues[i];
      }
      ensureNonNullValues(
        foreignKey.sourceTable,
        patchValues,
        `Foreign key cascade update on '${foreignKey.sourceTableName}'`
      );
      for (const referencingRow of referencingRows) {
        await db.patch(
          foreignKey.sourceTableName,
          referencingRow._id as any,
          patchValues
        );
      }
    }
  }
}

export function getSelectionColumnName(value: unknown): string {
  if (value && typeof value === 'object') {
    if ('columnName' in (value as any)) {
      return (value as any).columnName as string;
    }
    if ('config' in (value as any) && (value as any).config?.name) {
      return (value as any).config.name as string;
    }
  }
  throw new Error('Returning selection must reference a column');
}

export function selectReturningRow(
  row: Record<string, unknown>,
  selection: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [alias, column] of Object.entries(selection)) {
    const columnName = getSelectionColumnName(column);
    result[alias] = row[columnName];
  }
  return result;
}

function matchLike(
  value: string,
  pattern: string,
  caseInsensitive: boolean
): boolean {
  const targetValue = caseInsensitive ? value.toLowerCase() : value;
  const targetPattern = caseInsensitive ? pattern.toLowerCase() : pattern;

  if (targetPattern.startsWith('%') && targetPattern.endsWith('%')) {
    const substring = targetPattern.slice(1, -1);
    return targetValue.includes(substring);
  }
  if (targetPattern.startsWith('%')) {
    const suffix = targetPattern.slice(1);
    return targetValue.endsWith(suffix);
  }
  if (targetPattern.endsWith('%')) {
    const prefix = targetPattern.slice(0, -1);
    return targetValue.startsWith(prefix);
  }
  return targetValue === targetPattern;
}

export function evaluateFilter(
  row: Record<string, unknown>,
  filter: FilterExpression<boolean>
): boolean {
  if (filter.type === 'binary') {
    const [field, value] = filter.operands;
    if (!isFieldReference(field)) {
      throw new Error(
        'Binary expression must have FieldReference as first operand'
      );
    }

    const fieldName = field.fieldName;
    const fieldValue = row[fieldName];

    switch (filter.operator) {
      case 'like': {
        const pattern = value as string;
        if (typeof fieldValue !== 'string') return false;
        return matchLike(fieldValue, pattern, false);
      }
      case 'ilike': {
        const pattern = value as string;
        if (typeof fieldValue !== 'string') return false;
        return matchLike(fieldValue, pattern, true);
      }
      case 'notLike': {
        const pattern = value as string;
        if (typeof fieldValue !== 'string') return false;
        return !matchLike(fieldValue, pattern, false);
      }
      case 'notIlike': {
        const pattern = value as string;
        if (typeof fieldValue !== 'string') return false;
        return !matchLike(fieldValue, pattern, true);
      }
      case 'startsWith': {
        if (typeof fieldValue !== 'string') return false;
        return fieldValue.startsWith(value as string);
      }
      case 'endsWith': {
        if (typeof fieldValue !== 'string') return false;
        return fieldValue.endsWith(value as string);
      }
      case 'contains': {
        if (typeof fieldValue !== 'string') return false;
        return fieldValue.includes(value as string);
      }
      case 'eq':
        return fieldValue === value;
      case 'ne':
        return fieldValue !== value;
      case 'gt':
        return (fieldValue as any) > value;
      case 'gte':
        return (fieldValue as any) >= value;
      case 'lt':
        return (fieldValue as any) < value;
      case 'lte':
        return (fieldValue as any) <= value;
      case 'inArray': {
        const arr = value as any[];
        return arr.includes(fieldValue as any);
      }
      case 'notInArray': {
        const arr = value as any[];
        return !arr.includes(fieldValue as any);
      }
      case 'arrayContains': {
        if (!Array.isArray(fieldValue)) return false;
        const arr = value as any[];
        return arr.every((item) => (fieldValue as any[]).includes(item));
      }
      case 'arrayContained': {
        if (!Array.isArray(fieldValue)) return false;
        const arr = value as any[];
        return (fieldValue as any[]).every((item) => arr.includes(item));
      }
      case 'arrayOverlaps': {
        if (!Array.isArray(fieldValue)) return false;
        const arr = value as any[];
        return (fieldValue as any[]).some((item) => arr.includes(item));
      }
      default:
        throw new Error(`Unsupported post-fetch operator: ${filter.operator}`);
    }
  }

  if (filter.type === 'unary') {
    const [operand] = filter.operands;

    if (isFieldReference(operand)) {
      const fieldName = operand.fieldName;
      const fieldValue = row[fieldName];

      switch (filter.operator) {
        case 'isNull':
          return fieldValue === null || fieldValue === undefined;
        case 'isNotNull':
          return fieldValue !== null && fieldValue !== undefined;
        default:
          throw new Error(`Unsupported unary operator: ${filter.operator}`);
      }
    }

    if (filter.operator === 'not') {
      return !evaluateFilter(row, operand as FilterExpression<boolean>);
    }

    throw new Error(
      'Unary expression must have FieldReference or FilterExpression as operand'
    );
  }

  if (filter.type === 'logical') {
    if (filter.operator === 'and') {
      return filter.operands.every((f) => evaluateFilter(row, f));
    }
    if (filter.operator === 'or') {
      return filter.operands.some((f) => evaluateFilter(row, f));
    }
  }

  throw new Error(`Unsupported filter type for post-fetch: ${filter.type}`);
}

type TriState = true | false | 'unknown';

function triNot(value: TriState): TriState {
  return value === 'unknown' ? 'unknown' : !value;
}

function triAnd(values: TriState[]): TriState {
  if (values.some((value) => value === false)) return false;
  if (values.every((value) => value === true)) return true;
  return 'unknown';
}

function triOr(values: TriState[]): TriState {
  if (values.some((value) => value === true)) return true;
  if (values.every((value) => value === false)) return false;
  return 'unknown';
}

export function evaluateCheckConstraintTriState(
  row: Record<string, unknown>,
  filter: FilterExpression<boolean>
): TriState {
  if (filter.type === 'binary') {
    const [field, value] = filter.operands;
    if (!isFieldReference(field)) {
      throw new Error(
        'Binary expression must have FieldReference as first operand'
      );
    }

    const fieldName = field.fieldName;
    const fieldValue = row[fieldName];
    const compareValue = isFieldReference(value) ? row[value.fieldName] : value;

    const nullish = (entry: unknown) => entry === null || entry === undefined;
    if (nullish(fieldValue) || nullish(compareValue)) {
      return 'unknown';
    }

    switch (filter.operator) {
      case 'like': {
        if (
          typeof fieldValue !== 'string' ||
          typeof compareValue !== 'string'
        ) {
          return false;
        }
        return matchLike(fieldValue, compareValue, false);
      }
      case 'ilike': {
        if (
          typeof fieldValue !== 'string' ||
          typeof compareValue !== 'string'
        ) {
          return false;
        }
        return matchLike(fieldValue, compareValue, true);
      }
      case 'notLike': {
        if (
          typeof fieldValue !== 'string' ||
          typeof compareValue !== 'string'
        ) {
          return false;
        }
        return !matchLike(fieldValue, compareValue, false);
      }
      case 'notIlike': {
        if (
          typeof fieldValue !== 'string' ||
          typeof compareValue !== 'string'
        ) {
          return false;
        }
        return !matchLike(fieldValue, compareValue, true);
      }
      case 'startsWith': {
        if (
          typeof fieldValue !== 'string' ||
          typeof compareValue !== 'string'
        ) {
          return false;
        }
        return fieldValue.startsWith(compareValue);
      }
      case 'endsWith': {
        if (
          typeof fieldValue !== 'string' ||
          typeof compareValue !== 'string'
        ) {
          return false;
        }
        return fieldValue.endsWith(compareValue);
      }
      case 'contains': {
        if (
          typeof fieldValue !== 'string' ||
          typeof compareValue !== 'string'
        ) {
          return false;
        }
        return fieldValue.includes(compareValue);
      }
      case 'eq':
        return fieldValue === compareValue;
      case 'ne':
        return fieldValue !== compareValue;
      case 'gt':
        return (fieldValue as any) > compareValue;
      case 'gte':
        return (fieldValue as any) >= compareValue;
      case 'lt':
        return (fieldValue as any) < compareValue;
      case 'lte':
        return (fieldValue as any) <= compareValue;
      case 'inArray': {
        const arr = compareValue as any[];
        if (!Array.isArray(arr)) return false;
        return arr.includes(fieldValue as any);
      }
      case 'notInArray': {
        const arr = compareValue as any[];
        if (!Array.isArray(arr)) return false;
        return !arr.includes(fieldValue as any);
      }
      case 'arrayContains': {
        if (!Array.isArray(fieldValue)) return false;
        const arr = compareValue as any[];
        if (!Array.isArray(arr)) return false;
        return arr.every((item) => (fieldValue as any[]).includes(item));
      }
      case 'arrayContained': {
        if (!Array.isArray(fieldValue)) return false;
        const arr = compareValue as any[];
        if (!Array.isArray(arr)) return false;
        return (fieldValue as any[]).every((item) => arr.includes(item));
      }
      case 'arrayOverlaps': {
        if (!Array.isArray(fieldValue)) return false;
        const arr = compareValue as any[];
        if (!Array.isArray(arr)) return false;
        return (fieldValue as any[]).some((item) => arr.includes(item));
      }
      default:
        throw new Error(`Unsupported operator: ${filter.operator}`);
    }
  }

  if (filter.type === 'unary') {
    const [operand] = filter.operands;

    if (isFieldReference(operand)) {
      const fieldName = operand.fieldName;
      const fieldValue = row[fieldName];

      switch (filter.operator) {
        case 'isNull':
          return fieldValue === null || fieldValue === undefined;
        case 'isNotNull':
          return fieldValue !== null && fieldValue !== undefined;
        default:
          throw new Error(`Unsupported unary operator: ${filter.operator}`);
      }
    }

    if (filter.operator === 'not') {
      return triNot(
        evaluateCheckConstraintTriState(
          row,
          operand as FilterExpression<boolean>
        )
      );
    }

    throw new Error(
      'Unary expression must have FieldReference or FilterExpression as operand'
    );
  }

  if (filter.type === 'logical') {
    if (filter.operator === 'and') {
      return triAnd(
        filter.operands.map((operand) =>
          evaluateCheckConstraintTriState(row, operand)
        )
      );
    }
    if (filter.operator === 'or') {
      return triOr(
        filter.operands.map((operand) =>
          evaluateCheckConstraintTriState(row, operand)
        )
      );
    }
  }

  throw new Error(`Unsupported filter type for check: ${filter.type}`);
}

export function enforceCheckConstraints(
  table: ConvexTable<any>,
  candidate: Record<string, unknown>
): void {
  const checks = getChecks(table);
  if (checks.length === 0) {
    return;
  }

  const tableName = getTableName(table);

  for (const check of checks) {
    const result = evaluateCheckConstraintTriState(candidate, check.expression);
    if (result === false) {
      throw new Error(
        `Check constraint '${check.name}' violation on '${tableName}'.`
      );
    }
  }
}

export function toConvexFilter(
  expression: FilterExpression<boolean>
): (q: any) => any {
  const visitor: ExpressionVisitor<(q: any) => any> = {
    visitBinary: (expr: BinaryExpression) => {
      const [field, value] = expr.operands;
      if (!isFieldReference(field)) {
        throw new Error(
          'Binary expression must have FieldReference as first operand'
        );
      }

      const fieldName = field.fieldName;

      switch (expr.operator) {
        case 'eq':
          return (q: any) => q.eq(q.field(fieldName), value);
        case 'ne':
          return (q: any) => q.neq(q.field(fieldName), value);
        case 'gt':
          return (q: any) => q.gt(q.field(fieldName), value);
        case 'gte':
          return (q: any) => q.gte(q.field(fieldName), value);
        case 'lt':
          return (q: any) => q.lt(q.field(fieldName), value);
        case 'lte':
          return (q: any) => q.lte(q.field(fieldName), value);
        case 'inArray': {
          const values = value as any[];
          return (q: any) => {
            const conditions = values.map((v) => q.eq(q.field(fieldName), v));
            return conditions.reduce((acc, cond) => q.or(acc, cond));
          };
        }
        case 'notInArray': {
          const values = value as any[];
          return (q: any) => {
            const conditions = values.map((v) => q.neq(q.field(fieldName), v));
            return conditions.reduce((acc, cond) => q.and(acc, cond));
          };
        }
        case 'like':
        case 'ilike':
        case 'notLike':
        case 'notIlike':
        case 'startsWith':
        case 'endsWith':
        case 'contains':
        case 'arrayContains':
        case 'arrayContained':
        case 'arrayOverlaps':
          return () => true;
        default:
          throw new Error(`Unsupported binary operator: ${expr.operator}`);
      }
    },
    visitLogical: (expr: LogicalExpression) => {
      const operandFns = expr.operands.map((op) => op.accept(visitor));

      if (expr.operator === 'and') {
        return (q: any) => {
          let result = operandFns[0](q);
          for (let i = 1; i < operandFns.length; i++) {
            result = q.and(result, operandFns[i](q));
          }
          return result;
        };
      }
      if (expr.operator === 'or') {
        return (q: any) => {
          let result = operandFns[0](q);
          for (let i = 1; i < operandFns.length; i++) {
            result = q.or(result, operandFns[i](q));
          }
          return result;
        };
      }

      throw new Error(`Unsupported logical operator: ${expr.operator}`);
    },
    visitUnary: (expr: UnaryExpression) => {
      const operand = expr.operands[0];

      if (expr.operator === 'not') {
        const operandFn = (operand as FilterExpression<boolean>).accept(
          visitor
        );
        return (q: any) => q.not(operandFn(q));
      }

      if (expr.operator === 'isNull') {
        if (!isFieldReference(operand)) {
          throw new Error('isNull must operate on a field reference');
        }
        const fieldName = operand.fieldName;
        return (q: any) => q.eq(q.field(fieldName), null);
      }

      if (expr.operator === 'isNotNull') {
        if (!isFieldReference(operand)) {
          throw new Error('isNotNull must operate on a field reference');
        }
        const fieldName = operand.fieldName;
        return (q: any) => q.neq(q.field(fieldName), null);
      }

      throw new Error(`Unsupported unary operator: ${expr.operator}`);
    },
  };

  return expression.accept(visitor);
}
