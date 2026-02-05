import type { GenericDatabaseWriter } from 'convex/server';
import type { FilterExpression } from './filter-expression';
import {
  applyIncomingForeignKeyActionsOnUpdate,
  enforceCheckConstraints,
  enforceForeignKeys,
  enforceUniqueIndexes,
  evaluateFilter,
  getOrmContext,
  getTableColumns,
  getTableName,
  selectReturningRow,
  toConvexFilter,
} from './mutation-utils';
import { QueryPromise } from './query-promise';
import { evaluateUpdateDecision } from './rls/evaluator';
import type { ConvexTable } from './table';
import type {
  MutationResult,
  MutationReturning,
  ReturningSelection,
  UpdateSet,
} from './types';

export type ConvexUpdateWithout<
  T extends ConvexUpdateBuilder<any, any>,
  K extends string,
> = Omit<T, K>;

export class ConvexUpdateBuilder<
  TTable extends ConvexTable<any>,
  TReturning extends MutationReturning = undefined,
> extends QueryPromise<MutationResult<TTable, TReturning>> {
  declare readonly _: {
    readonly table: TTable;
    readonly returning: TReturning;
    readonly result: MutationResult<TTable, TReturning>;
  };

  private setValues?: UpdateSet<TTable>;
  private whereExpression?: FilterExpression<boolean>;
  private returningFields?: TReturning;

  constructor(
    private db: GenericDatabaseWriter<any>,
    private table: TTable
  ) {
    super();
  }

  set(values: UpdateSet<TTable>): this {
    this.setValues = values;
    return this;
  }

  where(expression: FilterExpression<boolean>): this {
    this.whereExpression = expression;
    return this;
  }

  returning(): ConvexUpdateWithout<
    ConvexUpdateBuilder<TTable, true>,
    'returning'
  >;
  returning<TSelection extends ReturningSelection<TTable>>(
    fields: TSelection
  ): ConvexUpdateWithout<ConvexUpdateBuilder<TTable, TSelection>, 'returning'>;
  returning(
    fields?: ReturningSelection<TTable>
  ): ConvexUpdateWithout<
    ConvexUpdateBuilder<TTable, MutationReturning>,
    'returning'
  > {
    this.returningFields = (fields ?? true) as TReturning;
    return this as any;
  }

  async execute(): Promise<MutationResult<TTable, TReturning>> {
    if (!this.setValues) {
      throw new Error('set() must be called before execute()');
    }

    const onUpdateSet: Record<string, unknown> = {};
    for (const [columnName, builder] of Object.entries(
      getTableColumns(this.table)
    )) {
      if (columnName in (this.setValues as any)) {
        continue;
      }
      const onUpdateFn = (builder as any).config?.onUpdateFn;
      if (typeof onUpdateFn === 'function') {
        onUpdateSet[columnName] = onUpdateFn();
      }
    }

    const effectiveSet = {
      ...onUpdateSet,
      ...(this.setValues as any),
    } as UpdateSet<TTable>;

    const tableName = getTableName(this.table);
    let query = this.db.query(tableName);

    if (this.whereExpression) {
      const filterFn = toConvexFilter(this.whereExpression);
      query = query.filter((q: any) => filterFn(q));
    }

    let rows = await query.collect();

    if (this.whereExpression) {
      rows = rows.filter((row) =>
        evaluateFilter(row as any, this.whereExpression as any)
      );
    }

    const ormContext = getOrmContext(this.db);
    const rls = ormContext?.rls;
    const foreignKeyGraph = ormContext?.foreignKeyGraph;
    if (!foreignKeyGraph) {
      throw new Error(
        'Foreign key actions require using createDatabase(...) with a schema.'
      );
    }

    const updates = rows.map((row) => {
      const updatedRow = { ...(row as any), ...(effectiveSet as any) };
      const decision = evaluateUpdateDecision({
        table: this.table,
        existingRow: row as Record<string, unknown>,
        updatedRow,
        rls,
      });
      return { row, updatedRow, decision };
    });

    const blocked = updates.find(
      ({ decision }) => decision.usingAllowed && !decision.withCheckAllowed
    );
    if (blocked) {
      throw new Error(
        `RLS policy violation for update on table "${tableName}"`
      );
    }

    const results: Record<string, unknown>[] = [];

    for (const { row, updatedRow, decision } of updates) {
      if (!decision.allowed) {
        continue;
      }
      enforceCheckConstraints(this.table, updatedRow);
      await enforceForeignKeys(this.db, this.table, updatedRow, {
        changedFields: new Set(Object.keys(effectiveSet as any)),
      });

      await applyIncomingForeignKeyActionsOnUpdate(
        this.db,
        this.table,
        row as Record<string, unknown>,
        updatedRow,
        { graph: foreignKeyGraph }
      );
      await enforceUniqueIndexes(this.db, this.table, updatedRow, {
        currentId: (row as any)._id,
        changedFields: new Set(Object.keys(effectiveSet as any)),
      });
      await this.db.patch(tableName, (row as any)._id, effectiveSet as any);

      if (!this.returningFields) {
        continue;
      }

      const updated = await this.db.get((row as any)._id);
      if (!updated) {
        continue;
      }

      if (this.returningFields === true) {
        results.push(updated as any);
      } else {
        results.push(
          selectReturningRow(updated as any, this.returningFields as any)
        );
      }
    }

    if (!this.returningFields) {
      return undefined as MutationResult<TTable, TReturning>;
    }

    return results as MutationResult<TTable, TReturning>;
  }
}
