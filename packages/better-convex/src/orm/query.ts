/**
 * GelRelationalQuery - Promise-based query builder
 *
 * Implements Drizzle's query pattern for Convex:
 * - Extends QueryPromise for lazy execution
 * - Stores query configuration
 * - Executes Convex queries on await
 */

import type { GenericDatabaseReader } from 'convex/server';
import type { EdgeMetadata } from './extractRelationsConfig';
import type {
  BinaryExpression,
  ExpressionVisitor,
  FilterExpression,
  LogicalExpression,
  UnaryExpression,
} from './filter-expression';
import { column, isFieldReference } from './filter-expression';
import { QueryPromise } from './query-promise';
import type {
  DBQueryConfig,
  TableRelationalConfig,
  TablesRelationalConfig,
} from './types';
import { WhereClauseCompiler } from './where-clause-compiler';

/**
 * Relational query builder with promise-based execution
 *
 * @template TResult - The final result type after execution
 *
 * Pattern from Drizzle: gel-core/query-builders/query.ts:32-62
 */
export class GelRelationalQuery<TResult> extends QueryPromise<TResult> {
  /**
   * Type brand for result type extraction
   * Critical for Expect<Equal<>> type tests to work correctly
   * Following Drizzle pattern: allows TypeScript to infer result type before await
   */
  declare readonly _: {
    readonly result: TResult;
  };

  constructor(
    _fullSchema: TablesRelationalConfig,
    private tableConfig: TableRelationalConfig,
    private edgeMetadata: EdgeMetadata[],
    private db: GenericDatabaseReader<any>,
    private config: DBQueryConfig<
      'one' | 'many',
      TablesRelationalConfig,
      TableRelationalConfig
    >,
    private mode: 'many' | 'first'
  ) {
    super();
  }

  /**
   * Execute the query and return results
   * Phase 4 implementation with WhereClauseCompiler integration
   */
  async execute(): Promise<TResult> {
    const queryConfig = this._toConvexQuery();

    // Start Convex query
    let query: any = this.db.query(queryConfig.table);

    // Apply index if selected
    if (queryConfig.index) {
      const indexConfig = queryConfig.index;
      query = query.withIndex(indexConfig.name, (q: any) => {
        // Apply index filters (eq operations on indexed fields)
        let indexQuery = q;
        for (const filter of indexConfig.filters) {
          indexQuery = this._applyFilterToQuery(indexQuery, filter);
        }
        return indexQuery;
      });
    }

    // Apply post-filters
    if (queryConfig.postFilters.length > 0) {
      query = query.filter((q: any) => {
        // Combine all post-filters with AND logic
        let result = q;
        for (const filter of queryConfig.postFilters) {
          const filterFn = this._toConvexExpression(filter);
          result = filterFn(result);
        }
        return result;
      });
    }

    // Apply ordering if present (Phase 4.5 - deferred to M4.5)
    if (queryConfig.order) {
      query = query.order(queryConfig.order.direction);
    }

    // Execute query with limit - .take() returns Promise<Doc[]>
    const config = this.config as any;
    // TODO M4.5: Implement offset pagination
    // Note: Convex doesn't have skip() - need to use cursor-based pagination
    // if (config.offset) {
    //   query = query.skip(config.offset);
    // }
    const limit = config.limit ?? 1000; // Default max 1000 to prevent unbounded queries
    const rows = await query.take(limit);

    // Load relations if configured
    let rowsWithRelations = rows;
    if (this.config.with) {
      rowsWithRelations = await this._loadRelations(rows, this.config.with);
    }

    // Apply column selection if configured
    const selectedRows = this._selectColumns(
      rowsWithRelations,
      (this.config as any).columns
    );

    // Return based on mode
    if (this.mode === 'first') {
      return selectedRows[0] as TResult;
    }

    return selectedRows as TResult;
  }

  /**
   * Convert query config to Convex query parameters
   * Phase 4 implementation with WhereClauseCompiler
   */
  private _toConvexQuery(): {
    table: string;
    index?: { name: string; filters: FilterExpression<boolean>[] };
    postFilters: FilterExpression<boolean>[];
    order?: { direction: 'asc' | 'desc' };
  } {
    const config = this.config as any;

    // Initialize compiler for this table
    const compiler = new WhereClauseCompiler(
      this.tableConfig.dbName,
      this.edgeMetadata
    );

    // Compile where clause to FilterExpression (if present)
    let whereExpression: FilterExpression<boolean> | undefined;
    if (config.where) {
      // Call user's where function to get FilterExpression
      whereExpression = config.where(
        this._createColumnProxies(),
        this._createOperators()
      );
    }

    // Use compiler to split filters and select index
    const compiled = compiler.compile(whereExpression);

    // Build query config
    const result: {
      table: string;
      index?: { name: string; filters: FilterExpression<boolean>[] };
      postFilters: FilterExpression<boolean>[];
      order?: { direction: 'asc' | 'desc' };
    } = {
      table: this.tableConfig.dbName,
      postFilters: compiled.postFilters,
    };

    // Add index if selected
    if (compiled.selectedIndex && compiled.indexFilters.length > 0) {
      result.index = {
        name: compiled.selectedIndex.indexName,
        filters: compiled.indexFilters,
      };
    }

    // Compile orderBy (Phase 4.5 - deferred to M4.5)
    if (config.orderBy) {
      const order = config.orderBy(this.tableConfig.columns, {
        asc: (field: any) => ({ field, direction: 'asc' as const }),
        desc: (field: any) => ({ field, direction: 'desc' as const }),
      });
      if (order) {
        result.order = { direction: order.direction };
      }
    }

    return result;
  }

  /**
   * Create column wrappers for where clause
   * Used by where() function to pass columns to operators
   * Following Drizzle pattern: pass raw columns (validator + name) to operators
   */
  private _createColumnProxies(): typeof this.tableConfig.columns {
    const proxies: Record<string, any> = {};
    for (const [columnName, validator] of Object.entries(
      this.tableConfig.columns
    )) {
      // Each column proxy is a Column wrapper with validator + name
      proxies[columnName] = column(validator, columnName);
    }
    return proxies as any;
  }

  /**
   * Create operator functions that build FilterExpression trees
   * Used by where() function to construct filter expressions
   */
  private _createOperators(): any {
    // Import operators dynamically to avoid circular dependency
    const { eq, ne, gt, gte, lt, lte, inArray, notInArray, isNull, isNotNull } =
      require('./filter-expression');
    return { eq, ne, gt, gte, lt, lte, inArray, notInArray, isNull, isNotNull };
  }

  /**
   * Apply a single filter expression to a Convex query builder
   * Used for index filters (eq operations)
   */
  private _applyFilterToQuery(
    query: any,
    filter: FilterExpression<boolean>
  ): any {
    // For index filters, we only handle binary eq expressions
    if (filter.type === 'binary' && filter.operator === 'eq') {
      const [field, value] = filter.operands;
      if (isFieldReference(field)) {
        return query.eq(field.fieldName, value);
      }
    }
    return query;
  }

  /**
   * Convert FilterExpression to Convex filter function
   * Uses visitor pattern to traverse expression tree
   */
  private _toConvexExpression(
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

        // Map our operators to Convex operators
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
            // inArray: field must be in the provided array
            const values = value as any[];
            return (q: any) => {
              // Convert to OR of eq operations
              const conditions = values.map((v) => q.eq(q.field(fieldName), v));
              return conditions.reduce((acc, cond) => q.or(acc, cond));
            };
          }
          case 'notInArray': {
            // notInArray: field must NOT be in the provided array
            const values = value as any[];
            return (q: any) => {
              // Convert to AND of neq operations
              const conditions = values.map((v) =>
                q.neq(q.field(fieldName), v)
              );
              return conditions.reduce((acc, cond) => q.and(acc, cond));
            };
          }
          default:
            throw new Error(`Unsupported binary operator: ${expr.operator}`);
        }
      },

      visitLogical: (expr: LogicalExpression) => {
        // Recursively convert operands
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
          // not() operates on FilterExpression
          const operandFn = (operand as FilterExpression<boolean>).accept(
            visitor
          );
          return (q: any) => q.not(operandFn(q));
        }

        if (expr.operator === 'isNull') {
          // isNull() operates on FieldReference
          if (!isFieldReference(operand)) {
            throw new Error('isNull must operate on a field reference');
          }
          const fieldName = operand.fieldName;
          return (q: any) => q.eq(q.field(fieldName), null);
        }

        if (expr.operator === 'isNotNull') {
          // isNotNull() operates on FieldReference
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

  /**
   * Load relations for query results
   * Phase 4 implementation
   */
  private async _loadRelations(
    rows: any[],
    _withConfig: Record<string, unknown>
  ): Promise<any[]> {
    // Phase 4: Full implementation coming
    // For now, return rows unchanged
    // TODO: Implement batch relation loading with Promise.all
    return rows;
  }

  /**
   * Select specific columns from rows
   * Phase 5 implementation
   */
  private _selectColumns(
    rows: any[],
    columnsConfig?: Record<string, boolean>
  ): any[] {
    if (!columnsConfig) {
      // No column selection - return all columns
      return rows;
    }

    // Pick only selected columns
    return rows.map((row) => {
      const selected: any = {};
      for (const [key, include] of Object.entries(columnsConfig)) {
        if (include && key in row) {
          selected[key] = row[key];
        }
      }
      return selected;
    });
  }
}
