import type { GenericDatabaseWriter } from 'convex/server';
import type { ColumnBuilder } from './builders/column-builder';
import type { FilterExpression } from './filter-expression';
import {
  applyDefaults,
  evaluateFilter,
  enforceForeignKeys,
  enforceUniqueIndexes,
  getColumnName,
  getTableName,
  selectReturningRow,
} from './mutation-utils';
import { QueryPromise } from './query-promise';
import type { ConvexTable } from './table';
import type {
  InsertValue,
  MutationResult,
  MutationReturning,
  ReturningSelection,
  UpdateSet,
} from './types';

export type InsertOnConflictDoNothingConfig<_TTable extends ConvexTable<any>> =
  {
    target?: ColumnBuilder<any, any, any> | ColumnBuilder<any, any, any>[];
    where?: FilterExpression<boolean>;
  };

export type InsertOnConflictDoUpdateConfig<TTable extends ConvexTable<any>> = {
  target: ColumnBuilder<any, any, any> | ColumnBuilder<any, any, any>[];
  set: UpdateSet<TTable>;
  where?: FilterExpression<boolean>;
  targetWhere?: FilterExpression<boolean>;
  setWhere?: FilterExpression<boolean>;
};

type InsertConflictConfig<TTable extends ConvexTable<any>> =
  | {
      action: 'nothing';
      config: InsertOnConflictDoNothingConfig<TTable>;
    }
  | {
      action: 'update';
      config: InsertOnConflictDoUpdateConfig<TTable>;
    };

export type ConvexInsertWithout<
  T extends ConvexInsertBuilder<any, any>,
  K extends string,
> = Omit<T, K>;

export class ConvexInsertBuilder<
  TTable extends ConvexTable<any>,
  TReturning extends MutationReturning = undefined,
> extends QueryPromise<MutationResult<TTable, TReturning>> {
  declare readonly _: {
    readonly table: TTable;
    readonly returning: TReturning;
    readonly result: MutationResult<TTable, TReturning>;
  };

  private valuesList: InsertValue<TTable>[] = [];
  private returningFields?: TReturning;
  private conflictConfig?: InsertConflictConfig<TTable>;

  constructor(
    private db: GenericDatabaseWriter<any>,
    private table: TTable
  ) {
    super();
  }

  values(values: InsertValue<TTable> | InsertValue<TTable>[]): this {
    const list = Array.isArray(values) ? values : [values];
    if (list.length === 0) {
      throw new Error('values() must be called with at least one value');
    }
    this.valuesList = list;
    return this;
  }

  returning(): ConvexInsertWithout<
    ConvexInsertBuilder<TTable, true>,
    'returning'
  >;
  returning<TSelection extends ReturningSelection<TTable>>(
    fields: TSelection
  ): ConvexInsertWithout<ConvexInsertBuilder<TTable, TSelection>, 'returning'>;
  returning(
    fields?: ReturningSelection<TTable>
  ): ConvexInsertWithout<
    ConvexInsertBuilder<TTable, MutationReturning>,
    'returning'
  > {
    this.returningFields = (fields ?? true) as TReturning;
    return this as any;
  }

  onConflictDoNothing(
    config: InsertOnConflictDoNothingConfig<TTable> = {}
  ): ConvexInsertWithout<this, 'onConflictDoNothing' | 'onConflictDoUpdate'> {
    this.conflictConfig = {
      action: 'nothing',
      config,
    };
    return this as any;
  }

  onConflictDoUpdate(
    config: InsertOnConflictDoUpdateConfig<TTable>
  ): ConvexInsertWithout<this, 'onConflictDoNothing' | 'onConflictDoUpdate'> {
    if (config.where && (config.targetWhere || config.setWhere)) {
      throw new Error(
        'You cannot use both "where" and "targetWhere"/"setWhere" at the same time - "where" is deprecated, use "targetWhere" or "setWhere" instead.'
      );
    }
    this.conflictConfig = {
      action: 'update',
      config,
    };
    return this as any;
  }

  async execute(): Promise<MutationResult<TTable, TReturning>> {
    if (this.valuesList.length === 0) {
      throw new Error('values() must be called before execute()');
    }

    const results: Record<string, unknown>[] = [];
    for (const value of this.valuesList) {
      const preparedValue = applyDefaults(this.table, value as any);
      const conflictResult = await this.handleConflict(preparedValue);

      if (conflictResult?.status === 'skip') {
        continue;
      }

      if (conflictResult?.status === 'updated') {
        if (conflictResult.row && this.returningFields) {
          results.push(this.resolveReturningRow(conflictResult.row));
        }
        continue;
      }

      const tableName = getTableName(this.table);
      await enforceForeignKeys(this.db, this.table, preparedValue as any, {
        changedFields: new Set(Object.keys(preparedValue as any)),
      });
      await enforceUniqueIndexes(this.db, this.table, preparedValue as any, {
        changedFields: new Set(Object.keys(preparedValue as any)),
      });
      const id = await this.db.insert(tableName, preparedValue as any);

      if (!this.returningFields) {
        continue;
      }

      const inserted = await this.db.get(id as any);
      if (inserted) {
        results.push(this.resolveReturningRow(inserted as any));
      }
    }

    if (!this.returningFields) {
      return undefined as MutationResult<TTable, TReturning>;
    }

    return results as MutationResult<TTable, TReturning>;
  }

  private resolveReturningRow(row: Record<string, unknown>) {
    if (this.returningFields === true) {
      return row;
    }
    return selectReturningRow(row, this.returningFields as any);
  }

  private async handleConflict(value: InsertValue<TTable>): Promise<
    | {
        status: 'skip';
      }
    | {
        status: 'updated';
        row?: Record<string, unknown> | null;
      }
    | undefined
  > {
    if (!this.conflictConfig) {
      return;
    }

    const { action, config } = this.conflictConfig;
    const targetColumns = Array.isArray(config.target)
      ? config.target
      : config.target
        ? [config.target]
        : [];

    const existing = await this.findConflictRow(value, targetColumns);
    if (!existing) {
      return;
    }

    if (action === 'nothing') {
      if (config.where && !evaluateFilter(existing, config.where)) {
        return;
      }
      return { status: 'skip' };
    }

    const updateConfig = config as InsertOnConflictDoUpdateConfig<TTable>;

    if (
      updateConfig.targetWhere &&
      !evaluateFilter(existing, updateConfig.targetWhere)
    ) {
      return;
    }

    if (updateConfig.where && !evaluateFilter(existing, updateConfig.where)) {
      return { status: 'updated', row: null };
    }

    if (
      updateConfig.setWhere &&
      !evaluateFilter(existing, updateConfig.setWhere)
    ) {
      return { status: 'updated', row: null };
    }

    const tableName = getTableName(this.table);
    await enforceForeignKeys(
      this.db,
      this.table,
      { ...(existing as any), ...(updateConfig.set as any) },
      {
        changedFields: new Set(Object.keys(updateConfig.set as any)),
      }
    );
    await enforceUniqueIndexes(
      this.db,
      this.table,
      { ...(existing as any), ...(updateConfig.set as any) },
      {
        currentId: (existing as any)._id,
        changedFields: new Set(Object.keys(updateConfig.set as any)),
      }
    );
    await this.db.patch(
      tableName,
      (existing as any)._id,
      updateConfig.set as any
    );
    const updated = this.returningFields
      ? await this.db.get((existing as any)._id)
      : null;

    return { status: 'updated', row: updated };
  }

  private async findConflictRow(
    value: InsertValue<TTable>,
    targetColumns: ColumnBuilder<any, any, any>[]
  ): Promise<Record<string, unknown> | null> {
    if (targetColumns.length === 0) {
      return null;
    }

    const tableName = getTableName(this.table);
    const filterValuePairs: [string, unknown][] = [];

    for (const column of targetColumns) {
      const columnName = getColumnName(column);
      const columnValue = (value as any)[columnName];
      if (columnValue === undefined) {
        return null;
      }
      filterValuePairs.push([columnName, columnValue]);
    }

    const query = this.db.query(tableName).filter((q: any) => {
      let expr = q.eq(q.field(filterValuePairs[0][0]), filterValuePairs[0][1]);
      for (let i = 1; i < filterValuePairs.length; i++) {
        const [field, fieldValue] = filterValuePairs[i];
        expr = q.and(expr, q.eq(q.field(field), fieldValue));
      }
      return expr;
    });

    const row = await query.first();
    return row ? (row as any) : null;
  }
}
