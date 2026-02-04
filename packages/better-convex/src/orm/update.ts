import type { GenericDatabaseWriter } from 'convex/server';
import type { FilterExpression } from './filter-expression';
import {
  evaluateFilter,
  enforceForeignKeys,
  enforceUniqueIndexes,
  getTableName,
  selectReturningRow,
  toConvexFilter,
} from './mutation-utils';
import { QueryPromise } from './query-promise';
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

    const results: Record<string, unknown>[] = [];

    for (const row of rows) {
      await enforceForeignKeys(
        this.db,
        this.table,
        { ...(row as any), ...(this.setValues as any) },
        {
          changedFields: new Set(Object.keys(this.setValues as any)),
        }
      );
      await enforceUniqueIndexes(
        this.db,
        this.table,
        { ...(row as any), ...(this.setValues as any) },
        {
          currentId: (row as any)._id,
          changedFields: new Set(Object.keys(this.setValues as any)),
        }
      );
      await this.db.patch(tableName, (row as any)._id, this.setValues as any);

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
