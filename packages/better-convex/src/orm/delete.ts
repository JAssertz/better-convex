import type { GenericDatabaseWriter } from 'convex/server';
import type { FilterExpression } from './filter-expression';
import {
  applyIncomingForeignKeyActionsOnDelete,
  type CascadeMode,
  type DeleteMode,
  evaluateFilter,
  getOrmContext,
  getTableName,
  hardDeleteRow,
  selectReturningRow,
  softDeleteRow,
  toConvexFilter,
} from './mutation-utils';
import { QueryPromise } from './query-promise';
import { canDeleteRow } from './rls/evaluator';
import type { ConvexTable } from './table';
import type {
  MutationResult,
  MutationReturning,
  ReturningSelection,
} from './types';

export type ConvexDeleteWithout<
  T extends ConvexDeleteBuilder<any, any>,
  K extends string,
> = Omit<T, K>;

export class ConvexDeleteBuilder<
  TTable extends ConvexTable<any>,
  TReturning extends MutationReturning = undefined,
> extends QueryPromise<MutationResult<TTable, TReturning>> {
  declare readonly _: {
    readonly table: TTable;
    readonly returning: TReturning;
    readonly result: MutationResult<TTable, TReturning>;
  };

  private whereExpression?: FilterExpression<boolean>;
  private returningFields?: TReturning;
  private deleteMode: DeleteMode = 'hard';
  private cascadeMode?: CascadeMode;
  private scheduledDelayMs?: number;

  constructor(
    private db: GenericDatabaseWriter<any>,
    private table: TTable
  ) {
    super();
  }

  where(expression: FilterExpression<boolean>): this {
    this.whereExpression = expression;
    return this;
  }

  returning(): ConvexDeleteWithout<
    ConvexDeleteBuilder<TTable, true>,
    'returning'
  >;
  returning<TSelection extends ReturningSelection<TTable>>(
    fields: TSelection
  ): ConvexDeleteWithout<ConvexDeleteBuilder<TTable, TSelection>, 'returning'>;
  returning(
    fields?: ReturningSelection<TTable>
  ): ConvexDeleteWithout<
    ConvexDeleteBuilder<TTable, MutationReturning>,
    'returning'
  > {
    this.returningFields = (fields ?? true) as TReturning;
    return this as any;
  }

  soft(): this {
    this.deleteMode = 'soft';
    return this;
  }

  scheduled(config: { delayMs: number }): this {
    if (!Number.isFinite(config.delayMs) || config.delayMs < 0) {
      throw new Error('scheduled() delayMs must be a non-negative number.');
    }
    this.deleteMode = 'scheduled';
    this.scheduledDelayMs = config.delayMs;
    return this;
  }

  cascade(config: { mode: CascadeMode }): this {
    this.cascadeMode = config.mode;
    return this;
  }

  async execute(): Promise<MutationResult<TTable, TReturning>> {
    const tableName = getTableName(this.table);
    const ormContext = getOrmContext(this.db);
    const strict = ormContext?.strict ?? true;
    if (!this.whereExpression) {
      if (strict) {
        throw new Error('update/delete requires where() when strict is true');
      }
      console.warn(
        'update/delete without where() is running with strict=false (full scan).'
      );
    }
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

    const rls = ormContext?.rls;
    const foreignKeyGraph = ormContext?.foreignKeyGraph;
    if (!foreignKeyGraph) {
      throw new Error(
        'Foreign key actions require using createDatabase(...) with a schema.'
      );
    }

    const cascadeMode: CascadeMode =
      this.cascadeMode ??
      (this.deleteMode === 'soft' || this.deleteMode === 'scheduled'
        ? 'soft'
        : 'hard');

    const visited = new Set<string>();

    for (const row of rows) {
      if (
        !canDeleteRow({
          table: this.table,
          row: row as Record<string, unknown>,
          rls,
        })
      ) {
        continue;
      }

      visited.add(`${tableName}:${(row as any)._id}`);
      if (this.returningFields) {
        if (this.returningFields === true) {
          results.push(row as any);
        } else {
          results.push(
            selectReturningRow(row as any, this.returningFields as any)
          );
        }
      }

      await applyIncomingForeignKeyActionsOnDelete(
        this.db,
        this.table,
        row as Record<string, unknown>,
        {
          graph: foreignKeyGraph,
          deleteMode: this.deleteMode,
          cascadeMode,
          visited,
        }
      );

      if (this.deleteMode === 'soft') {
        await softDeleteRow(
          this.db,
          this.table,
          row as Record<string, unknown>
        );
        continue;
      }

      if (this.deleteMode === 'scheduled') {
        await softDeleteRow(
          this.db,
          this.table,
          row as Record<string, unknown>
        );
        if (!ormContext?.scheduler || !ormContext.scheduledDelete) {
          throw new Error(
            'scheduled() requires createDatabase(..., { scheduler, scheduledDelete }).'
          );
        }
        const delayMs = this.scheduledDelayMs ?? 0;
        await ormContext.scheduler.runAfter(
          delayMs,
          ormContext.scheduledDelete,
          {
            table: tableName,
            id: (row as any)._id,
            cascadeMode: 'hard',
          }
        );
        continue;
      }

      await hardDeleteRow(this.db, tableName, row as Record<string, unknown>);
    }

    if (!this.returningFields) {
      return undefined as MutationResult<TTable, TReturning>;
    }

    return results as MutationResult<TTable, TReturning>;
  }
}
