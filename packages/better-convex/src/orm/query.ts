/**
 * GelRelationalQuery - Promise-based query builder
 *
 * Implements Drizzle's query pattern for Convex:
 * - Extends QueryPromise for lazy execution
 * - Stores query configuration
 * - Executes Convex queries on await
 */

import type { GenericDatabaseReader } from 'convex/server';
import { type ColumnBuilder, entityKind } from './builders/column-builder';
import type { EdgeMetadata } from './extractRelationsConfig';
import type {
  BinaryExpression,
  ExpressionVisitor,
  FilterExpression,
  LogicalExpression,
  UnaryExpression,
} from './filter-expression';
import {
  and,
  arrayContained,
  arrayContains,
  arrayOverlaps,
  between,
  column,
  contains,
  endsWith,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isFieldReference,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  not,
  notBetween,
  notIlike,
  notInArray,
  notLike,
  or,
  startsWith,
} from './filter-expression';
import {
  findRelationIndex,
  findSearchIndexByName,
  findVectorIndexByName,
  getIndexes,
} from './index-utils';
import { asc, desc } from './order-by';
import { QueryPromise } from './query-promise';
import type { RelationsFieldFilter, RelationsFilter } from './relations';
import { filterSelectRows } from './rls/evaluator';
import type { RlsContext } from './rls/types';
import { stream } from './stream';
import { Columns, OrmSchemaDefinition } from './symbols';
import type {
  DBQueryConfig,
  OrderByClause,
  OrderByValue,
  PaginateConfig,
  PredicateWhereIndexConfig,
  TableRelationalConfig,
  TablesRelationalConfig,
  ValueOrArray,
  VectorSearchProvider,
} from './types';
import {
  type IndexStrategy,
  WhereClauseCompiler,
} from './where-clause-compiler';

const DEFAULT_RELATION_FAN_OUT_MAX_KEYS = 1000;

/**
 * Relational query builder with promise-based execution
 *
 * @template TResult - The final result type after execution
 *
 * Pattern from Drizzle: gel-core/query-builders/query.ts:32-62
 */
export class GelRelationalQuery<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
  TResult,
> extends QueryPromise<TResult> {
  /**
   * Type brand for result type extraction
   * Critical for Expect<Equal<>> type tests to work correctly
   * Following Drizzle pattern: allows TypeScript to infer result type before await
   */
  declare readonly _: {
    readonly result: TResult;
  };
  private allowFullScan: boolean;

  constructor(
    private schema: TSchema,
    private tableConfig: TTableConfig,
    private edgeMetadata: EdgeMetadata[],
    private db: GenericDatabaseReader<any>,
    private config: DBQueryConfig<
      'one' | 'many',
      boolean,
      TSchema,
      TTableConfig
    >,
    private mode: 'many' | 'first',
    private _allEdges?: EdgeMetadata[], // M6.5 Phase 2: All edges for nested loading
    private rls?: RlsContext,
    private relationLoading?: { concurrency?: number },
    private vectorSearchProvider?: VectorSearchProvider
  ) {
    super();
    this.allowFullScan = (config as any).allowFullScan === true;
  }

  private _applyRlsSelectFilter(
    rows: any[],
    tableConfig?: TableRelationalConfig
  ): any[] {
    if (!rows.length || !tableConfig) return rows;
    return filterSelectRows({
      table: tableConfig.table as any,
      rows,
      rls: this.rls,
    });
  }

  private _isColumnBuilder(
    value: unknown
  ): value is ColumnBuilder<any, any, any> {
    return (
      !!value &&
      typeof value === 'object' &&
      (value as any)[entityKind] === 'ColumnBuilder'
    );
  }

  private _isOrderByClause(value: unknown): value is OrderByClause<any> {
    return (
      !!value &&
      typeof value === 'object' &&
      'direction' in (value as any) &&
      !!(value as any).column?.columnName
    );
  }

  private _normalizeOrderByValue(value: OrderByValue): OrderByClause<any> {
    if (this._isOrderByClause(value)) {
      return value;
    }
    if (this._isColumnBuilder(value)) {
      return asc(value);
    }
    throw new Error('Invalid orderBy value. Use a column or asc()/desc().');
  }

  private _normalizeOrderBy(
    orderBy: ValueOrArray<OrderByValue> | undefined
  ): OrderByClause<any>[] {
    if (!orderBy) return [];
    const items = Array.isArray(orderBy) ? orderBy : [orderBy];
    return items
      .filter((item): item is OrderByValue => item !== undefined)
      .map((item) => this._normalizeOrderByValue(item));
  }

  private _orderBySpecs(
    orderBy:
      | ValueOrArray<OrderByValue>
      | Record<string, 'asc' | 'desc' | undefined>
      | undefined
  ): { field: string; direction: 'asc' | 'desc' }[] {
    if (
      orderBy &&
      typeof orderBy === 'object' &&
      !Array.isArray(orderBy) &&
      !this._isOrderByClause(orderBy) &&
      !this._isColumnBuilder(orderBy)
    ) {
      return Object.entries(orderBy)
        .filter(([, direction]) => direction === 'asc' || direction === 'desc')
        .map(([field, direction]) => ({
          field,
          direction: direction as 'asc' | 'desc',
        }));
    }

    return this._normalizeOrderBy(
      orderBy as ValueOrArray<OrderByValue> | undefined
    ).map((clause) => ({
      field: clause.column.columnName,
      direction: clause.direction,
    }));
  }

  private _resolveNonPaginatedLimit(config: any): number | undefined {
    const explicitLimit = config.limit;
    const defaultLimit = this.tableConfig.defaults?.defaultLimit;
    const resolvedLimit = explicitLimit ?? defaultLimit;

    if (resolvedLimit === undefined) {
      if (this.allowFullScan) {
        return;
      }
      throw new Error(
        'findMany() requires explicit sizing. Provide limit, paginate, allowFullScan: true, or defineSchema(..., { defaults: { defaultLimit } }).'
      );
    }

    if (!Number.isInteger(resolvedLimit) || resolvedLimit < 1) {
      throw new Error(
        'Only positive integer limit is supported in Better Convex ORM.'
      );
    }

    return resolvedLimit;
  }

  private _compareByOrderSpecs(
    a: any,
    b: any,
    orders: { field: string; direction: 'asc' | 'desc' }[]
  ): number {
    for (const order of orders) {
      const aVal = a[order.field];
      const bVal = b[order.field];

      if (aVal === null || aVal === undefined) {
        if (bVal === null || bVal === undefined) continue;
        return 1;
      }
      if (bVal === null || bVal === undefined) {
        return -1;
      }

      if (aVal < bVal) {
        return order.direction === 'asc' ? -1 : 1;
      }
      if (aVal > bVal) {
        return order.direction === 'asc' ? 1 : -1;
      }
    }
    return 0;
  }

  private _getTableConfigByDbName(
    dbName: string
  ): TableRelationalConfig | undefined {
    const tables = Object.values(this.schema) as TableRelationalConfig[];
    return tables.find((table) => table.name === dbName);
  }

  private _matchLike(
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

  /**
   * Evaluate a filter expression against a fetched row
   * Used for post-fetch filtering (string operators, etc.)
   */
  private _evaluatePostFetchFilter(
    row: any,
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
          return this._matchLike(fieldValue, pattern, false);
        }
        case 'ilike': {
          const pattern = value as string;
          if (typeof fieldValue !== 'string') return false;
          return this._matchLike(fieldValue, pattern, true);
        }
        case 'notLike': {
          const pattern = value as string;
          if (typeof fieldValue !== 'string') return false;
          return !this._matchLike(fieldValue, pattern, false);
        }
        case 'notIlike': {
          const pattern = value as string;
          if (typeof fieldValue !== 'string') return false;
          return !this._matchLike(fieldValue, pattern, true);
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
        // Basic operators fallback (shouldn't reach here normally)
        case 'eq':
          return fieldValue === value;
        case 'ne':
          return fieldValue !== value;
        case 'gt':
          return fieldValue > value;
        case 'gte':
          return fieldValue >= value;
        case 'lt':
          return fieldValue < value;
        case 'lte':
          return fieldValue <= value;
        case 'inArray': {
          const arr = value as any[];
          return arr.includes(fieldValue);
        }
        case 'notInArray': {
          const arr = value as any[];
          return !arr.includes(fieldValue);
        }
        case 'arrayContains': {
          if (!Array.isArray(fieldValue)) return false;
          const arr = value as any[];
          return arr.every((item) => fieldValue.includes(item));
        }
        case 'arrayContained': {
          if (!Array.isArray(fieldValue)) return false;
          const arr = value as any[];
          return fieldValue.every((item) => arr.includes(item));
        }
        case 'arrayOverlaps': {
          if (!Array.isArray(fieldValue)) return false;
          const arr = value as any[];
          return arr.some((item) => fieldValue.includes(item));
        }
        default:
          throw new Error(
            `Unsupported post-fetch operator: ${filter.operator}`
          );
      }
    }

    if (filter.type === 'unary') {
      const [operand] = filter.operands;

      // Handle null checks on field references
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

      // Handle NOT operator on nested expressions
      if (filter.operator === 'not') {
        return !this._evaluatePostFetchFilter(
          row,
          operand as FilterExpression<boolean>
        );
      }

      throw new Error(
        'Unary expression must have FieldReference or FilterExpression as operand'
      );
    }

    if (filter.type === 'logical') {
      if (filter.operator === 'and') {
        return filter.operands.every((f) =>
          this._evaluatePostFetchFilter(row, f)
        );
      }
      if (filter.operator === 'or') {
        return filter.operands.some((f) =>
          this._evaluatePostFetchFilter(row, f)
        );
      }
    }

    throw new Error(`Unsupported filter type for post-fetch: ${filter.type}`);
  }

  private _isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  private _isPlaceholder(value: unknown): boolean {
    return this._isRecord(value) && '__placeholder' in value;
  }

  private _isSQLWrapper(value: unknown): boolean {
    return this._isRecord(value) && '__sqlWrapper' in value;
  }

  private _evaluateFieldFilter(
    fieldValue: any,
    filter: RelationsFieldFilter
  ): boolean {
    if (filter === undefined) return true;

    if (this._isPlaceholder(filter) || this._isSQLWrapper(filter)) {
      throw new Error('SQL placeholders are not supported in Convex filters.');
    }

    if (
      filter === null ||
      typeof filter !== 'object' ||
      Array.isArray(filter)
    ) {
      return fieldValue === filter;
    }

    const entries = Object.entries(filter as Record<string, any>);
    if (!entries.length) return true;

    const results: boolean[] = [];

    for (const [op, value] of entries) {
      if (value === undefined) continue;

      switch (op) {
        case 'NOT': {
          results.push(!this._evaluateFieldFilter(fieldValue, value));
          continue;
        }
        case 'OR': {
          if (!Array.isArray(value) || value.length === 0) continue;
          results.push(
            value.some((sub) => this._evaluateFieldFilter(fieldValue, sub))
          );
          continue;
        }
        case 'AND': {
          if (!Array.isArray(value) || value.length === 0) continue;
          results.push(
            value.every((sub) => this._evaluateFieldFilter(fieldValue, sub))
          );
          continue;
        }
        case 'isNull': {
          if (!value) continue;
          results.push(fieldValue === null || fieldValue === undefined);
          continue;
        }
        case 'isNotNull': {
          if (!value) continue;
          results.push(fieldValue !== null && fieldValue !== undefined);
          continue;
        }
        case 'in': {
          if (!Array.isArray(value)) {
            results.push(false);
            continue;
          }
          results.push(value.includes(fieldValue));
          continue;
        }
        case 'notIn': {
          if (!Array.isArray(value)) {
            results.push(false);
            continue;
          }
          results.push(!value.includes(fieldValue));
          continue;
        }
        case 'arrayContains': {
          if (!Array.isArray(fieldValue) || !Array.isArray(value)) {
            results.push(false);
            continue;
          }
          results.push(value.every((item) => fieldValue.includes(item)));
          continue;
        }
        case 'arrayContained': {
          if (!Array.isArray(fieldValue) || !Array.isArray(value)) {
            results.push(false);
            continue;
          }
          results.push(fieldValue.every((item) => value.includes(item)));
          continue;
        }
        case 'arrayOverlaps': {
          if (!Array.isArray(fieldValue) || !Array.isArray(value)) {
            results.push(false);
            continue;
          }
          results.push(value.some((item) => fieldValue.includes(item)));
          continue;
        }
        case 'like': {
          if (typeof fieldValue !== 'string' || typeof value !== 'string') {
            results.push(false);
            continue;
          }
          results.push(this._matchLike(fieldValue, value, false));
          continue;
        }
        case 'ilike': {
          if (typeof fieldValue !== 'string' || typeof value !== 'string') {
            results.push(false);
            continue;
          }
          results.push(this._matchLike(fieldValue, value, true));
          continue;
        }
        case 'notLike': {
          if (typeof fieldValue !== 'string' || typeof value !== 'string') {
            results.push(false);
            continue;
          }
          results.push(!this._matchLike(fieldValue, value, false));
          continue;
        }
        case 'notIlike': {
          if (typeof fieldValue !== 'string' || typeof value !== 'string') {
            results.push(false);
            continue;
          }
          results.push(!this._matchLike(fieldValue, value, true));
          continue;
        }
        case 'startsWith': {
          if (typeof fieldValue !== 'string' || typeof value !== 'string') {
            results.push(false);
            continue;
          }
          results.push(fieldValue.startsWith(value));
          continue;
        }
        case 'endsWith': {
          if (typeof fieldValue !== 'string' || typeof value !== 'string') {
            results.push(false);
            continue;
          }
          results.push(fieldValue.endsWith(value));
          continue;
        }
        case 'contains': {
          if (typeof fieldValue !== 'string' || typeof value !== 'string') {
            results.push(false);
            continue;
          }
          results.push(fieldValue.includes(value));
          continue;
        }
        case 'eq':
          results.push(fieldValue === value);
          continue;
        case 'ne':
          results.push(fieldValue !== value);
          continue;
        case 'gt':
          results.push(fieldValue > value);
          continue;
        case 'gte':
          results.push(fieldValue >= value);
          continue;
        case 'lt':
          results.push(fieldValue < value);
          continue;
        case 'lte':
          results.push(fieldValue <= value);
          continue;
        case 'between': {
          if (!Array.isArray(value) || value.length !== 2) {
            results.push(false);
            continue;
          }
          const [min, max] = value;
          results.push(fieldValue >= min && fieldValue <= max);
          continue;
        }
        case 'notBetween': {
          if (!Array.isArray(value) || value.length !== 2) {
            results.push(false);
            continue;
          }
          const [min, max] = value;
          results.push(fieldValue < min || fieldValue > max);
          continue;
        }
        default:
          throw new Error(`Unsupported field operator: ${op}`);
      }
    }

    return results.every(Boolean);
  }

  private _evaluateTableFilter(
    row: any,
    tableConfig: TableRelationalConfig,
    filter: Record<string, unknown>
  ): boolean {
    if (!this._isRecord(filter)) return true;

    const entries = Object.entries(filter);
    if (!entries.length) return true;

    const columns = this._getColumns(tableConfig);
    const results: boolean[] = [];

    for (const [key, value] of entries) {
      if (value === undefined) continue;

      switch (key) {
        case 'RAW':
          throw new Error('RAW filters are not supported in Convex.');
        case 'OR':
          if (!Array.isArray(value) || value.length === 0) continue;
          {
            const subFilters = value.filter((sub) => this._isRecord(sub));
            if (!subFilters.length) continue;
            results.push(
              subFilters.some((sub) =>
                this._evaluateTableFilter(row, tableConfig, sub)
              )
            );
          }
          continue;
        case 'AND':
          if (!Array.isArray(value) || value.length === 0) continue;
          {
            const subFilters = value.filter((sub) => this._isRecord(sub));
            if (!subFilters.length) continue;
            results.push(
              subFilters.every((sub) =>
                this._evaluateTableFilter(row, tableConfig, sub)
              )
            );
          }
          continue;
        case 'NOT':
          results.push(
            !this._evaluateTableFilter(row, tableConfig, value as any)
          );
          continue;
        default:
          if (!(key in columns)) {
            throw new Error(`Unknown filter column: "${key}"`);
          }
          results.push(this._evaluateFieldFilter(row[key], value as any));
      }
    }

    return results.every(Boolean);
  }

  private _evaluateRelationsFilter(
    row: any,
    tableConfig: TableRelationalConfig,
    filter: RelationsFilter<any, any>
  ): boolean {
    if (!this._isRecord(filter)) return true;

    const entries = Object.entries(filter);
    if (!entries.length) return true;

    const columns = this._getColumns(tableConfig);
    const results: boolean[] = [];

    for (const [key, value] of entries) {
      if (value === undefined) continue;

      switch (key) {
        case 'RAW':
          throw new Error('RAW filters are not supported in Convex.');
        case 'OR':
          if (!Array.isArray(value) || value.length === 0) continue;
          {
            const subFilters = value.filter((sub) => this._isRecord(sub));
            if (!subFilters.length) continue;
            results.push(
              subFilters.some((sub) =>
                this._evaluateRelationsFilter(row, tableConfig, sub)
              )
            );
          }
          continue;
        case 'AND':
          if (!Array.isArray(value) || value.length === 0) continue;
          {
            const subFilters = value.filter((sub) => this._isRecord(sub));
            if (!subFilters.length) continue;
            results.push(
              subFilters.every((sub) =>
                this._evaluateRelationsFilter(row, tableConfig, sub)
              )
            );
          }
          continue;
        case 'NOT':
          results.push(
            !this._evaluateRelationsFilter(row, tableConfig, value as any)
          );
          continue;
        default: {
          if (key in columns) {
            results.push(this._evaluateFieldFilter(row[key], value as any));
            continue;
          }

          const relation = tableConfig.relations[key];
          if (!relation) {
            throw new Error(`Unknown relational filter field: "${key}"`);
          }

          const targetTableConfig = this._getTableConfigByDbName(
            relation.targetTableName
          );
          if (!targetTableConfig) {
            throw new Error(
              `Missing table config for relation "${key}" -> "${relation.targetTableName}"`
            );
          }

          const relatedValue = row[key];
          if (typeof value === 'boolean') {
            if (relation.relationType === 'one') {
              results.push(value ? !!relatedValue : !relatedValue);
            } else {
              results.push(
                value
                  ? Array.isArray(relatedValue) && relatedValue.length > 0
                  : !Array.isArray(relatedValue) || relatedValue.length === 0
              );
            }
            continue;
          }

          if (relation.relationType === 'one') {
            if (!relatedValue) {
              results.push(false);
              continue;
            }
            results.push(
              this._evaluateRelationsFilter(
                relatedValue,
                targetTableConfig,
                value as any
              )
            );
            continue;
          }

          if (!Array.isArray(relatedValue) || relatedValue.length === 0) {
            results.push(false);
            continue;
          }

          results.push(
            relatedValue.some((target) =>
              this._evaluateRelationsFilter(
                target,
                targetTableConfig,
                value as any
              )
            )
          );
        }
      }
    }

    return results.every(Boolean);
  }

  private _buildFieldFilterExpression(
    fieldName: string,
    tableConfig: TableRelationalConfig,
    filter: RelationsFieldFilter
  ): FilterExpression<boolean> | undefined {
    if (filter === undefined) return;

    if (this._isPlaceholder(filter) || this._isSQLWrapper(filter)) {
      throw new Error('SQL placeholders are not supported in Convex filters.');
    }

    const columns = this._getColumns(tableConfig);
    const columnBuilder = columns[fieldName];
    if (!columnBuilder) {
      throw new Error(`Unknown filter column: "${fieldName}"`);
    }

    const columnRef = column(columnBuilder, fieldName);

    if (
      filter === null ||
      typeof filter !== 'object' ||
      Array.isArray(filter)
    ) {
      return eq(columnRef, filter);
    }

    const entries = Object.entries(filter as Record<string, any>);
    if (!entries.length) return;

    const parts: FilterExpression<boolean>[] = [];

    for (const [op, value] of entries) {
      if (value === undefined) continue;

      switch (op) {
        case 'NOT': {
          const expr = this._buildFieldFilterExpression(
            fieldName,
            tableConfig,
            value
          );
          if (expr) parts.push(not(expr));
          continue;
        }
        case 'OR': {
          if (!Array.isArray(value) || value.length === 0) continue;
          const subs = value
            .map((sub) =>
              this._buildFieldFilterExpression(fieldName, tableConfig, sub)
            )
            .filter(Boolean) as FilterExpression<boolean>[];
          if (subs.length) {
            parts.push(or(...subs)!);
          }
          continue;
        }
        case 'AND': {
          if (!Array.isArray(value) || value.length === 0) continue;
          const subs = value
            .map((sub) =>
              this._buildFieldFilterExpression(fieldName, tableConfig, sub)
            )
            .filter(Boolean) as FilterExpression<boolean>[];
          if (subs.length) {
            parts.push(and(...subs)!);
          }
          continue;
        }
        case 'isNull':
          if (value) parts.push(isNull(columnRef));
          continue;
        case 'isNotNull':
          if (value) parts.push(isNotNull(columnRef));
          continue;
        case 'in':
          if (Array.isArray(value)) {
            parts.push(inArray(columnRef, value));
          }
          continue;
        case 'notIn':
          if (Array.isArray(value)) {
            parts.push(notInArray(columnRef, value));
          }
          continue;
        case 'arrayContains':
          parts.push(arrayContains(columnRef, value));
          continue;
        case 'arrayContained':
          parts.push(arrayContained(columnRef, value));
          continue;
        case 'arrayOverlaps':
          parts.push(arrayOverlaps(columnRef, value));
          continue;
        case 'like':
          parts.push(like(columnRef, value));
          continue;
        case 'ilike':
          parts.push(ilike(columnRef, value));
          continue;
        case 'notLike':
          parts.push(notLike(columnRef, value));
          continue;
        case 'notIlike':
          parts.push(notIlike(columnRef, value));
          continue;
        case 'startsWith':
          parts.push(startsWith(columnRef, value));
          continue;
        case 'endsWith':
          parts.push(endsWith(columnRef, value));
          continue;
        case 'contains':
          parts.push(contains(columnRef, value));
          continue;
        case 'eq':
          parts.push(eq(columnRef, value));
          continue;
        case 'ne':
          parts.push(ne(columnRef, value));
          continue;
        case 'gt':
          parts.push(gt(columnRef, value));
          continue;
        case 'gte':
          parts.push(gte(columnRef, value));
          continue;
        case 'lt':
          parts.push(lt(columnRef, value));
          continue;
        case 'lte':
          parts.push(lte(columnRef, value));
          continue;
        case 'between':
          if (Array.isArray(value) && value.length === 2) {
            parts.push(between(columnRef, value[0], value[1]));
          }
          continue;
        case 'notBetween':
          if (Array.isArray(value) && value.length === 2) {
            parts.push(notBetween(columnRef, value[0], value[1]));
          }
          continue;
        default:
          throw new Error(`Unsupported field operator: ${op}`);
      }
    }

    if (!parts.length) return;
    if (parts.length === 1) return parts[0];
    return and(...parts);
  }

  private _buildFilterExpression(
    filter: RelationsFilter<any, any>,
    tableConfig: TableRelationalConfig
  ): FilterExpression<boolean> | undefined {
    if (!this._isRecord(filter)) return;

    const entries = Object.entries(filter);
    if (!entries.length) return;

    const columns = this._getColumns(tableConfig);
    const parts: FilterExpression<boolean>[] = [];

    for (const [key, value] of entries) {
      if (value === undefined) continue;

      switch (key) {
        case 'RAW':
          throw new Error('RAW filters are not supported in Convex.');
        case 'OR': {
          if (!Array.isArray(value) || value.length === 0) continue;
          const subs = value
            .map((sub) => this._buildFilterExpression(sub, tableConfig))
            .filter(Boolean) as FilterExpression<boolean>[];
          if (subs.length) parts.push(or(...subs)!);
          continue;
        }
        case 'AND': {
          if (!Array.isArray(value) || value.length === 0) continue;
          const subs = value
            .map((sub) => this._buildFilterExpression(sub, tableConfig))
            .filter(Boolean) as FilterExpression<boolean>[];
          if (subs.length) parts.push(and(...subs)!);
          continue;
        }
        case 'NOT': {
          const sub = this._buildFilterExpression(
            value as RelationsFilter<any, any>,
            tableConfig
          );
          if (sub) parts.push(not(sub));
          continue;
        }
        default: {
          if (!(key in columns)) {
            // Relation filter - skip in expression compilation
            continue;
          }
          const expr = this._buildFieldFilterExpression(
            key,
            tableConfig,
            value as RelationsFieldFilter
          );
          if (expr) parts.push(expr);
        }
      }
    }

    if (!parts.length) return;
    if (parts.length === 1) return parts[0];
    return and(...parts);
  }

  private _mergeWithConfig(
    target: Record<string, unknown>,
    source: Record<string, unknown>
  ): void {
    for (const [key, value] of Object.entries(source)) {
      if (!(key in target)) {
        target[key] = value;
        continue;
      }

      const existing = target[key];
      if (existing === true) {
        target[key] = value;
        continue;
      }
      if (value === true) {
        continue;
      }
      if (this._isRecord(existing) && this._isRecord(value)) {
        const existingWith = (existing as any).with;
        const valueWith = (value as any).with;
        if (this._isRecord(existingWith) && this._isRecord(valueWith)) {
          this._mergeWithConfig(existingWith, valueWith);
        } else if (this._isRecord(valueWith)) {
          (existing as any).with = valueWith;
        }
      }
    }
  }

  private _buildFilterWithConfig(
    filter: RelationsFilter<any, any>,
    tableConfig: TableRelationalConfig
  ): Record<string, unknown> {
    if (!this._isRecord(filter)) return {};

    const result: Record<string, unknown> = {};
    const entries = Object.entries(filter);
    if (!entries.length) return result;

    for (const [key, value] of entries) {
      if (value === undefined) continue;

      if (key === 'OR' || key === 'AND') {
        if (!Array.isArray(value) || value.length === 0) continue;
        for (const sub of value) {
          const nested = this._buildFilterWithConfig(
            sub as RelationsFilter<any, any>,
            tableConfig
          );
          this._mergeWithConfig(result, nested);
        }
        continue;
      }

      if (key === 'NOT') {
        const nested = this._buildFilterWithConfig(
          value as RelationsFilter<any, any>,
          tableConfig
        );
        this._mergeWithConfig(result, nested);
        continue;
      }

      const relation = tableConfig.relations[key];
      if (!relation) continue;

      if (typeof value === 'boolean') {
        result[key] = true;
        continue;
      }

      const targetTableConfig = this._getTableConfigByDbName(
        relation.targetTableName
      );
      if (!targetTableConfig) {
        continue;
      }

      const nested = this._buildFilterWithConfig(
        value as RelationsFilter<any, any>,
        targetTableConfig
      );
      result[key] = Object.keys(nested).length > 0 ? { with: nested } : true;
    }

    return result;
  }

  private _stripFilterRelations(
    rows: any[],
    filterWith: Record<string, unknown>,
    requestedWith?: Record<string, unknown>
  ): void {
    if (!rows.length) return;

    const filterKeys = Object.keys(filterWith);
    if (filterKeys.length === 0) return;

    for (const row of rows) {
      for (const key of filterKeys) {
        if (requestedWith && key in requestedWith) {
          continue;
        }
        delete row[key];
      }
    }
  }

  private _hasSearchDisallowedRelationFilter(
    filter: RelationsFilter<any, any> | undefined,
    tableConfig: TableRelationalConfig
  ): boolean {
    if (!this._isRecord(filter)) {
      return false;
    }

    const columns = this._getColumns(tableConfig);
    for (const [key, value] of Object.entries(filter)) {
      if (value === undefined) {
        continue;
      }

      if (key === 'OR' || key === 'AND') {
        if (!Array.isArray(value)) {
          continue;
        }
        if (
          value.some((sub) =>
            this._hasSearchDisallowedRelationFilter(
              sub as RelationsFilter<any, any>,
              tableConfig
            )
          )
        ) {
          return true;
        }
        continue;
      }

      if (key === 'NOT') {
        if (
          this._hasSearchDisallowedRelationFilter(
            value as RelationsFilter<any, any>,
            tableConfig
          )
        ) {
          return true;
        }
        continue;
      }

      if (key === 'RAW') {
        continue;
      }

      if (key in columns) {
        continue;
      }

      if (key in tableConfig.relations) {
        return true;
      }

      return true;
    }

    return false;
  }

  private _searchFilterValuesEqual(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) {
      return true;
    }
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }

  private _extractSearchEqFromWhereField(value: unknown): unknown {
    if (value === undefined) {
      return;
    }

    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return value;
    }

    const record = value as Record<string, unknown>;
    if (!('eq' in record)) {
      return;
    }

    for (const [key, fieldValue] of Object.entries(record)) {
      if (key === 'eq') {
        continue;
      }
      if (fieldValue !== undefined) {
        return;
      }
    }

    return record.eq;
  }

  private _mergeSearchFiltersWithWhereEq(
    searchFilters: Record<string, unknown> | undefined,
    whereFilter: RelationsFilter<any, any> | undefined,
    tableConfig: TableRelationalConfig,
    allowedFilterFields: Set<string>
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = {
      ...(searchFilters ?? {}),
    };

    if (!this._isRecord(whereFilter)) {
      return merged;
    }

    const columns = this._getColumns(tableConfig);
    for (const [key, value] of Object.entries(whereFilter)) {
      if (value === undefined) {
        continue;
      }
      if (key === 'OR' || key === 'AND' || key === 'NOT' || key === 'RAW') {
        continue;
      }
      if (!(key in columns)) {
        continue;
      }
      if (!allowedFilterFields.has(key)) {
        continue;
      }

      const eqValue = this._extractSearchEqFromWhereField(value);
      if (eqValue === undefined) {
        continue;
      }

      if (
        key in merged &&
        !this._searchFilterValuesEqual(merged[key], eqValue)
      ) {
        throw new Error(
          `Conflict between search.filters.${key} and where.${key}.`
        );
      }

      merged[key] = eqValue;
    }

    return merged;
  }

  private async _applyRelationsFilterToRows(
    rows: any[],
    tableConfig: TableRelationalConfig,
    filter: RelationsFilter<any, any>,
    targetTableEdges: EdgeMetadata[],
    depth: number,
    maxDepth: number,
    requestedWith?: Record<string, unknown>
  ): Promise<any[]> {
    if (!rows.length) return rows;
    if (!this._isRecord(filter)) return rows;

    const filterWith = this._buildFilterWithConfig(filter, tableConfig);
    const hasFilterWith = Object.keys(filterWith).length > 0;

    if (hasFilterWith) {
      await this._loadRelations(
        rows,
        filterWith,
        depth,
        maxDepth,
        targetTableEdges,
        tableConfig
      );
    }

    const filtered = rows.filter((row) =>
      this._evaluateRelationsFilter(row, tableConfig, filter)
    );

    if (hasFilterWith) {
      this._stripFilterRelations(filtered, filterWith, requestedWith);
    }

    return filtered;
  }

  private async _finalizeRows(rows: any[]): Promise<any[]> {
    let rowsWithRelations = rows;
    if (this.config.with) {
      rowsWithRelations = await this._loadRelations(
        rows,
        this.config.with,
        0,
        3,
        this.edgeMetadata,
        this.tableConfig
      );
    }

    if ((this.config as any).extras) {
      rowsWithRelations = this._applyExtras(
        rowsWithRelations,
        (this.config as any).extras,
        this._getColumns(this.tableConfig),
        this.config.with as Record<string, unknown> | undefined,
        this.tableConfig.name
      );
    }

    return this._selectColumns(
      rowsWithRelations,
      (this.config as any).columns,
      this._getColumns(this.tableConfig)
    );
  }

  /**
   * Execute the query and return results
   * Phase 4 implementation with WhereClauseCompiler integration
   */
  async execute(): Promise<TResult> {
    const queryConfig = this._toConvexQuery();
    const config = this.config as any;
    const paginate = config.paginate as PaginateConfig | undefined;
    const searchConfig = config.search as
      | {
          index: string;
          query: string;
          filters?: Record<string, unknown>;
        }
      | undefined;
    const vectorSearchConfig = config.vectorSearch as
      | {
          index: string;
          vector: number[];
          limit: number;
          includeScore?: boolean;
          filter?: ((q: any) => unknown) | undefined;
        }
      | undefined;
    const wherePredicate =
      typeof config.where === 'function'
        ? (config.where as (row: any) => boolean | Promise<boolean>)
        : undefined;
    const whereFilter =
      typeof config.where === 'function'
        ? undefined
        : (config.where as RelationsFilter<any, any> | undefined);
    const strict = this.tableConfig.strict !== false;
    const allowFullScan = this.allowFullScan === true;

    // Start Convex query
    let query: any = this.db.query(queryConfig.table);

    if (vectorSearchConfig) {
      if (searchConfig) {
        throw new Error('vectorSearch cannot be combined with search.');
      }
      if (config.orderBy !== undefined) {
        throw new Error(
          'vectorSearch cannot be combined with orderBy. Vector results stay in similarity order.'
        );
      }
      if (paginate !== undefined) {
        throw new Error('vectorSearch cannot be combined with paginate.');
      }
      if (config.where !== undefined) {
        throw new Error('vectorSearch cannot be combined with where.');
      }
      if (config.index !== undefined) {
        throw new Error('vectorSearch cannot be combined with index.');
      }
      if (config.offset !== undefined) {
        throw new Error('vectorSearch cannot be combined with offset.');
      }
      if (config.limit !== undefined) {
        throw new Error(
          'vectorSearch uses vectorSearch.limit. Top-level limit is not supported.'
        );
      }
      if (!Array.isArray(vectorSearchConfig.vector)) {
        throw new Error('vectorSearch.vector must be an array of numbers.');
      }
      if (
        !Number.isInteger(vectorSearchConfig.limit) ||
        vectorSearchConfig.limit < 1 ||
        vectorSearchConfig.limit > 256
      ) {
        throw new Error(
          'vectorSearch.limit must be an integer between 1 and 256.'
        );
      }
      if (!this.vectorSearchProvider) {
        throw new Error(
          'vectorSearch is not configured. Pass { vectorSearch: ctx.vectorSearch } to orm.db(ctx, ...).'
        );
      }

      const vectorIndex = findVectorIndexByName(
        this.tableConfig.table as any,
        vectorSearchConfig.index
      );
      if (!vectorIndex) {
        throw new Error(
          `Vector index '${vectorSearchConfig.index}' was not found on table '${this.tableConfig.name}'.`
        );
      }

      const hits = await this.vectorSearchProvider(
        this.tableConfig.name as string,
        vectorSearchConfig.index,
        {
          vector: vectorSearchConfig.vector,
          limit: vectorSearchConfig.limit,
          filter: vectorSearchConfig.filter,
        }
      );

      const fetched = await this._mapWithConcurrency(hits, async (hit) =>
        this.db.get((hit as any)._id)
      );
      const includeScore = vectorSearchConfig.includeScore === true;
      const scoreById = includeScore
        ? new Map(hits.map((hit) => [String((hit as any)._id), hit._score]))
        : undefined;

      let rows = fetched.filter((row): row is any => !!row);
      if (scoreById) {
        rows = rows.map((row) => {
          const score = scoreById.get(String(row._id));
          return score === undefined ? row : { ...row, _score: score };
        });
      }
      rows = this._applyRlsSelectFilter(rows, this.tableConfig);

      const selectedRows = await this._finalizeRows(rows);

      if (this.mode === 'first') {
        return selectedRows[0] as TResult;
      }

      return selectedRows as TResult;
    }

    if (searchConfig) {
      if (config.orderBy !== undefined) {
        throw new Error(
          'search cannot be combined with orderBy. Search results are ordered by relevance.'
        );
      }
      if (wherePredicate) {
        throw new Error(
          'search cannot be combined with where(fn). Use search.filters or object where.'
        );
      }
      if (config.index !== undefined) {
        throw new Error('search cannot be combined with index.');
      }
      if (
        this._hasSearchDisallowedRelationFilter(whereFilter, this.tableConfig)
      ) {
        throw new Error(
          'search does not support relation-based where filters. Use base table fields only.'
        );
      }

      const searchIndex = findSearchIndexByName(
        this.tableConfig.table as any,
        searchConfig.index
      );
      if (!searchIndex) {
        throw new Error(
          `Search index '${searchConfig.index}' was not found on table '${this.tableConfig.name}'.`
        );
      }

      const mergedSearchFilters = this._mergeSearchFiltersWithWhereEq(
        searchConfig.filters as Record<string, unknown> | undefined,
        whereFilter,
        this.tableConfig,
        new Set(searchIndex.filterFields)
      );

      const searchQuery: any = query.withSearchIndex(
        searchConfig.index as any,
        (q: any) => {
          let builder = q.search(
            searchIndex.searchField as any,
            searchConfig.query
          );
          for (const [field, value] of Object.entries(mergedSearchFilters)) {
            builder = builder.eq(field as any, value);
          }
          return builder;
        }
      );

      if (paginate) {
        const paginationResult = await searchQuery.paginate({
          cursor: paginate.cursor ?? null,
          numItems: paginate.numItems ?? 20,
        } as any);

        let pageRows = paginationResult.page;
        pageRows = this._applyRlsSelectFilter(pageRows, this.tableConfig);

        if (whereFilter) {
          pageRows = await this._applyRelationsFilterToRows(
            pageRows,
            this.tableConfig,
            whereFilter,
            this.edgeMetadata,
            0,
            3,
            this.config.with as Record<string, unknown> | undefined
          );
        }

        const selectedPage = await this._finalizeRows(pageRows);

        return {
          page: selectedPage,
          continueCursor: paginationResult.continueCursor,
          isDone: paginationResult.isDone,
        } as TResult;
      }

      const offset = config.offset ?? 0;
      if (typeof offset !== 'number') {
        throw new Error(
          'Only numeric offset is supported in Better Convex ORM.'
        );
      }
      const limit = this._resolveNonPaginatedLimit(config);
      let rows =
        limit === undefined
          ? await searchQuery.collect()
          : await searchQuery.take(offset > 0 ? offset + limit : limit);

      if (offset > 0) {
        rows = rows.slice(offset);
      }

      rows = this._applyRlsSelectFilter(rows, this.tableConfig);

      if (whereFilter) {
        rows = await this._applyRelationsFilterToRows(
          rows,
          this.tableConfig,
          whereFilter,
          this.edgeMetadata,
          0,
          3,
          this.config.with as Record<string, unknown> | undefined
        );
      }

      const selectedRows = await this._finalizeRows(rows);

      if (this.mode === 'first') {
        return selectedRows[0] as TResult;
      }

      return selectedRows as TResult;
    }

    // M5: Index-aware ordering strategy
    // 1. If WHERE uses an index AND orderBy field matches → use .order() on that index
    // 2. If orderBy field has index AND no WHERE index → use orderBy index with .order()
    // 3. Otherwise → post-fetch sort (no index available)
    let usePostFetchSort = false;
    let needsPostFetchSortForPrimary = false;
    const postFetchOrders = queryConfig.order ?? [];
    const primaryOrder = postFetchOrders[0];
    const hasSecondaryOrders = postFetchOrders.length > 1;
    let orderIndexName: string | null = null;

    // Apply index if selected for WHERE filtering
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

      // Check if orderBy field matches WHERE index
      if (primaryOrder) {
        const orderField = primaryOrder.field;
        const indexFields = queryConfig.index.filters.map(
          (f: any) => (f as any).operands[0].fieldName
        );
        // If ordering by same field as index, apply .order()
        if (indexFields.includes(orderField)) {
          query = query.order(primaryOrder.direction);
        } else {
          // Different field - need post-fetch sort
          needsPostFetchSortForPrimary = true;
        }
      }
    } else if (queryConfig.order && primaryOrder) {
      // No WHERE index - check if orderBy field has an index
      const orderField = primaryOrder.field;

      // Special case: _creationTime uses Convex's default index
      if (orderField === '_creationTime') {
        // Default index on _creationTime - no withIndex() needed
        query = query.order(primaryOrder.direction);
      } else {
        const orderIndex =
          getIndexes(this.tableConfig.table).find((idx) =>
            idx.fields.includes(orderField)
          ) ??
          this.edgeMetadata.find((idx) => idx.indexFields.includes(orderField));

        if (orderIndex) {
          orderIndexName =
            'indexName' in orderIndex ? orderIndex.indexName : orderIndex.name;
          // Use orderBy field's index
          query = query.withIndex(orderIndexName, (q: any) => q);
          query = query.order(primaryOrder.direction);
        } else {
          // No index for orderBy field - post-fetch sort
          needsPostFetchSortForPrimary = true;
        }
      }
    }

    usePostFetchSort = needsPostFetchSortForPrimary || hasSecondaryOrders;

    if (!queryConfig.index && queryConfig.postFilters.length > 0) {
      if (!allowFullScan) {
        throw new Error(
          'Query requires allowFullScan: true when no index is available.'
        );
      }
      console.warn('Query is running without an index (allowFullScan: true).');
    }

    if (wherePredicate) {
      const predicateIndex = config.index as
        | PredicateWhereIndexConfig<TTableConfig>
        | undefined;
      if (!predicateIndex?.name) {
        throw new Error('Predicate where() requires index: { name, range? }.');
      }
      const schemaDefinition = (this.schema as any)[OrmSchemaDefinition];
      if (!schemaDefinition) {
        throw new Error(
          'where (function) requires defineSchema(). Ensure defineSchema(tables) was used with the same tables object passed to defineRelations.'
        );
      }

      let streamQuery: any = stream(
        this.db as GenericDatabaseReader<any>,
        schemaDefinition
      )
        .query(this.tableConfig.name as any)
        .withIndex(
          predicateIndex.name as any,
          predicateIndex.range ? (predicateIndex.range as any) : (q: any) => q
        );

      if (paginate) {
        if (needsPostFetchSortForPrimary) {
          if (strict) {
            throw new Error(
              `Pagination: Field '${primaryOrder?.field}' has no index. Add an index or disable strict.`
            );
          }
          console.warn(
            `Pagination: Field '${primaryOrder?.field}' has no index. ` +
              'Falling back to _creationTime ordering.'
          );
        }
        if (hasSecondaryOrders) {
          console.warn(
            'Pagination: Only the first orderBy field is used for cursor ordering. ' +
              'Secondary orderBy fields are applied per page and may be unstable across pages.'
          );
        }
      }

      if (primaryOrder && !needsPostFetchSortForPrimary) {
        streamQuery = streamQuery.order(primaryOrder.direction);
      } else if (paginate) {
        streamQuery = streamQuery.order('desc');
      }

      streamQuery = streamQuery.filterWith(async (row: any) => {
        for (const filter of queryConfig.postFilters) {
          if (!this._evaluatePostFetchFilter(row, filter)) {
            return false;
          }
        }
        return await wherePredicate(row);
      });

      if (paginate) {
        const paginationResult = await streamQuery.paginate({
          cursor: paginate.cursor ?? null,
          numItems: paginate.numItems ?? 20,
          maximumRowsRead: paginate.maximumRowsRead,
        });

        let pageRows = paginationResult.page;

        pageRows = this._applyRlsSelectFilter(pageRows, this.tableConfig);

        if (whereFilter) {
          pageRows = await this._applyRelationsFilterToRows(
            pageRows,
            this.tableConfig,
            whereFilter,
            this.edgeMetadata,
            0,
            3,
            this.config.with as Record<string, unknown> | undefined
          );
        }

        let pageWithRelations = pageRows;
        if (this.config.with) {
          pageWithRelations = await this._loadRelations(
            pageRows,
            this.config.with,
            0,
            3,
            this.edgeMetadata,
            this.tableConfig
          );
        }

        if ((this.config as any).extras) {
          pageWithRelations = this._applyExtras(
            pageWithRelations,
            (this.config as any).extras,
            this._getColumns(this.tableConfig),
            this.config.with as Record<string, unknown> | undefined,
            this.tableConfig.name
          );
        }

        const selectedPage = this._selectColumns(
          pageWithRelations,
          (this.config as any).columns,
          this._getColumns(this.tableConfig)
        );

        return {
          page: selectedPage,
          continueCursor: paginationResult.continueCursor,
          isDone: paginationResult.isDone,
        } as TResult;
      }

      const offset = config.offset ?? 0;
      if (typeof offset !== 'number') {
        throw new Error(
          'Only numeric offset is supported in Better Convex ORM.'
        );
      }
      const limit = this._resolveNonPaginatedLimit(config);
      const paginateAfterPostFetchSort =
        usePostFetchSort && postFetchOrders.length > 0;
      let rows =
        limit === undefined || paginateAfterPostFetchSort
          ? await streamQuery.collect()
          : await streamQuery.take(offset > 0 ? offset + limit : limit);

      if (!paginateAfterPostFetchSort && offset > 0) {
        rows = rows.slice(offset);
      }

      rows = this._applyRlsSelectFilter(rows, this.tableConfig);

      if (whereFilter) {
        rows = await this._applyRelationsFilterToRows(
          rows,
          this.tableConfig,
          whereFilter,
          this.edgeMetadata,
          0,
          3,
          this.config.with as Record<string, unknown> | undefined
        );
      }

      if (usePostFetchSort && postFetchOrders.length > 0) {
        rows = rows.sort((a: any, b: any) =>
          this._compareByOrderSpecs(a, b, postFetchOrders)
        );
      }

      if (paginateAfterPostFetchSort) {
        if (offset > 0) {
          rows = rows.slice(offset);
        }
        if (limit !== undefined) {
          rows = rows.slice(0, limit);
        }
      }

      let rowsWithRelations = rows;
      if (this.config.with) {
        rowsWithRelations = await this._loadRelations(
          rows,
          this.config.with,
          0,
          3,
          this.edgeMetadata,
          this.tableConfig
        );
      }

      if ((this.config as any).extras) {
        rowsWithRelations = this._applyExtras(
          rowsWithRelations,
          (this.config as any).extras,
          this._getColumns(this.tableConfig),
          this.config.with as Record<string, unknown> | undefined,
          this.tableConfig.name
        );
      }

      const selectedRows = this._selectColumns(
        rowsWithRelations,
        (this.config as any).columns,
        this._getColumns(this.tableConfig)
      );

      if (this.mode === 'first') {
        return selectedRows[0] as TResult;
      }

      return selectedRows as TResult;
    }

    if (
      queryConfig.strategy === 'multiProbe' &&
      queryConfig.index &&
      !paginate
    ) {
      const probeRows = await Promise.all(
        queryConfig.probeFilters.map(async (probeFilters) => {
          let probeQuery: any = this.db
            .query(queryConfig.table)
            .withIndex(queryConfig.index!.name, (q: any) => {
              let indexQuery = q;
              for (const filter of probeFilters) {
                indexQuery = this._applyFilterToQuery(indexQuery, filter);
              }
              return indexQuery;
            });

          if (queryConfig.postFilters.length > 0) {
            probeQuery = probeQuery.filter((q: any) => {
              let result: any | null = null;
              for (const filter of queryConfig.postFilters) {
                const filterFn = this._toConvexExpression(filter);
                const expr = filterFn(q);
                result = result ? q.and(result, expr) : expr;
              }
              return result ?? q;
            });
          }

          return await probeQuery.collect();
        })
      );

      let rows = Array.from(
        new Map(
          probeRows.flat().map((row: any) => [String(row._id), row] as const)
        ).values()
      );

      if (queryConfig.postFilters.length > 0) {
        rows = rows.filter((row: any) =>
          queryConfig.postFilters.every((filter) =>
            this._evaluatePostFetchFilter(row, filter)
          )
        );
      }

      rows = this._applyRlsSelectFilter(rows, this.tableConfig);

      if (whereFilter) {
        rows = await this._applyRelationsFilterToRows(
          rows,
          this.tableConfig,
          whereFilter,
          this.edgeMetadata,
          0,
          3,
          this.config.with as Record<string, unknown> | undefined
        );
      }

      if (usePostFetchSort && postFetchOrders.length > 0) {
        rows = rows.sort((a: any, b: any) =>
          this._compareByOrderSpecs(a, b, postFetchOrders)
        );
      }

      const offset = config.offset ?? 0;
      if (typeof offset !== 'number') {
        throw new Error(
          'Only numeric offset is supported in Better Convex ORM.'
        );
      }
      const limit = this._resolveNonPaginatedLimit(config);
      if (offset > 0) {
        rows = rows.slice(offset);
      }
      if (limit !== undefined) {
        rows = rows.slice(0, limit);
      }

      let rowsWithRelations = rows;
      if (this.config.with) {
        rowsWithRelations = await this._loadRelations(
          rows,
          this.config.with,
          0,
          3,
          this.edgeMetadata,
          this.tableConfig
        );
      }

      if ((this.config as any).extras) {
        rowsWithRelations = this._applyExtras(
          rowsWithRelations,
          (this.config as any).extras,
          this._getColumns(this.tableConfig),
          this.config.with as Record<string, unknown> | undefined,
          this.tableConfig.name
        );
      }

      const selectedRows = this._selectColumns(
        rowsWithRelations,
        (this.config as any).columns,
        this._getColumns(this.tableConfig)
      );

      if (this.mode === 'first') {
        return selectedRows[0] as TResult;
      }

      return selectedRows as TResult;
    }

    // M6.5 Phase 4: Handle cursor pagination separately
    if (paginate) {
      if (queryConfig.strategy === 'multiProbe') {
        if (!allowFullScan) {
          throw new Error(
            'Pagination with multi-probe index-union filters requires allowFullScan: true. Cursor-stable multi-probe pagination is not implemented yet.'
          );
        }
        console.warn(
          'Pagination with multi-probe index-union filters is falling back to full-scan pagination (allowFullScan: true).'
        );
      }

      // Apply post-filters
      if (queryConfig.postFilters.length > 0) {
        query = query.filter((q: any) => {
          let result: any | null = null;
          for (const filter of queryConfig.postFilters) {
            const filterFn = this._toConvexExpression(filter);
            const expr = filterFn(q);
            result = result ? q.and(result, expr) : expr;
          }
          return result ?? q;
        });
      }

      // Apply ORDER BY for pagination (required for stable cursors)
      if (queryConfig.order && primaryOrder) {
        // Check if ordering was already applied via index (needsPostFetchSortForPrimary would be false)
        if (needsPostFetchSortForPrimary) {
          // Field has no index - pagination can't use custom orderBy
          // Fall back to _creationTime ordering for cursor stability
          if (strict) {
            throw new Error(
              `Pagination: Field '${primaryOrder.field}' has no index. Add an index or disable strict.`
            );
          }
          console.warn(
            `Pagination: Field '${primaryOrder.field}' has no index. ` +
              'Falling back to _creationTime ordering.'
          );
          query = query.order(
            primaryOrder.direction === 'asc' ? 'asc' : 'desc'
          );
        } else {
          // Ordering already applied via index - query is ready for pagination
          // No additional action needed
        }
        if (hasSecondaryOrders) {
          console.warn(
            'Pagination: Only the first orderBy field is used for cursor ordering. ' +
              'Secondary orderBy fields are applied per page and may be unstable across pages.'
          );
        }
      } else {
        // Default to _creationTime desc if no orderBy specified
        query = query.order('desc');
      }

      // Use Convex native pagination (O(1) performance)
      const paginationResult = await query.paginate({
        cursor: paginate.cursor ?? null,
        numItems: paginate.numItems ?? 20,
      });

      let pageRows = paginationResult.page;

      pageRows = this._applyRlsSelectFilter(pageRows, this.tableConfig);

      if (whereFilter) {
        pageRows = await this._applyRelationsFilterToRows(
          pageRows,
          this.tableConfig,
          whereFilter,
          this.edgeMetadata,
          0,
          3,
          this.config.with as Record<string, unknown> | undefined
        );
      }

      // Load relations for page results if configured
      let pageWithRelations = pageRows;
      if (this.config.with) {
        pageWithRelations = await this._loadRelations(
          pageRows,
          this.config.with,
          0,
          3,
          this.edgeMetadata,
          this.tableConfig
        );
      }

      if ((this.config as any).extras) {
        pageWithRelations = this._applyExtras(
          pageWithRelations,
          (this.config as any).extras,
          this._getColumns(this.tableConfig),
          this.config.with as Record<string, unknown> | undefined,
          this.tableConfig.name
        );
      }

      // Apply column selection if configured
      const selectedPage = this._selectColumns(
        pageWithRelations,
        (this.config as any).columns,
        this._getColumns(this.tableConfig)
      );

      return {
        page: selectedPage,
        continueCursor: paginationResult.continueCursor,
        isDone: paginationResult.isDone,
      } as TResult;
    }

    // Apply post-filters
    if (queryConfig.postFilters.length > 0) {
      query = query.filter((q: any) => {
        // Combine all post-filters with AND logic
        let result: any | null = null;
        for (const filter of queryConfig.postFilters) {
          const filterFn = this._toConvexExpression(filter);
          const expr = filterFn(q);
          result = result ? q.and(result, expr) : expr;
        }
        return result ?? q;
      });
    }

    // Execute query with limit - .take() returns Promise<Doc[]>
    // M4.5: Offset pagination via post-fetch slicing
    // Convex doesn't have skip() - fetch offset + limit rows, then slice
    const offset = config.offset ?? 0;
    if (typeof offset !== 'number') {
      throw new Error('Only numeric offset is supported in Better Convex ORM.');
    }
    const limit = this._resolveNonPaginatedLimit(config);
    const paginateAfterPostFetchSort =
      usePostFetchSort && postFetchOrders.length > 0;
    let rows =
      limit === undefined || paginateAfterPostFetchSort
        ? await query.collect()
        : await query.take(offset > 0 ? offset + limit : limit);

    // Apply offset slicing if needed
    if (!paginateAfterPostFetchSort && offset > 0) {
      rows = rows.slice(offset);
    }

    // M5: Apply post-fetch string operator filters
    // String operators can't work in Convex filter context, apply after fetch
    if (queryConfig.postFilters.length > 0) {
      rows = rows.filter((row: any) =>
        queryConfig.postFilters.every((filter) =>
          this._evaluatePostFetchFilter(row, filter)
        )
      );
    }

    rows = this._applyRlsSelectFilter(rows, this.tableConfig);

    if (whereFilter) {
      rows = await this._applyRelationsFilterToRows(
        rows,
        this.tableConfig,
        whereFilter,
        this.edgeMetadata,
        0,
        3,
        this.config.with as Record<string, unknown> | undefined
      );
    }

    // Apply post-fetch sort if needed
    if (usePostFetchSort && postFetchOrders.length > 0) {
      rows = rows.sort((a: any, b: any) =>
        this._compareByOrderSpecs(a, b, postFetchOrders)
      );
    }

    if (paginateAfterPostFetchSort) {
      if (offset > 0) {
        rows = rows.slice(offset);
      }
      if (limit !== undefined) {
        rows = rows.slice(0, limit);
      }
    }

    // Load relations if configured
    let rowsWithRelations = rows;
    if (this.config.with) {
      rowsWithRelations = await this._loadRelations(
        rows,
        this.config.with,
        0,
        3,
        this.edgeMetadata,
        this.tableConfig
      );
    }

    if ((this.config as any).extras) {
      rowsWithRelations = this._applyExtras(
        rowsWithRelations,
        (this.config as any).extras,
        this._getColumns(this.tableConfig),
        this.config.with as Record<string, unknown> | undefined,
        this.tableConfig.name
      );
    }

    // Apply column selection if configured
    const selectedRows = this._selectColumns(
      rowsWithRelations,
      (this.config as any).columns,
      this._getColumns(this.tableConfig)
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
    strategy: IndexStrategy;
    index?: { name: string; filters: FilterExpression<boolean>[] };
    probeFilters: FilterExpression<boolean>[][];
    postFilters: FilterExpression<boolean>[];
    order?: { direction: 'asc' | 'desc'; field: string }[];
  } {
    const config = this.config as any;

    // Initialize compiler for this table using declared indexes
    const tableIndexes = getIndexes(this.tableConfig.table).map((index) => ({
      indexName: index.name,
      indexFields: index.fields,
    }));

    const compiler = new WhereClauseCompiler(
      this.tableConfig.table.tableName,
      tableIndexes
    );

    // Compile where clause to FilterExpression (if present)
    let whereExpression: FilterExpression<boolean> | undefined;
    if (config.where && typeof config.where !== 'function') {
      whereExpression = this._buildFilterExpression(
        config.where as RelationsFilter<any, any>,
        this.tableConfig
      );
    }

    // Use compiler to split filters and select index
    const compiled = compiler.compile(whereExpression);

    // Build query config
    const result: {
      table: string;
      strategy: IndexStrategy;
      index?: { name: string; filters: FilterExpression<boolean>[] };
      probeFilters: FilterExpression<boolean>[][];
      postFilters: FilterExpression<boolean>[];
      order?: { direction: 'asc' | 'desc'; field: string }[];
    } = {
      table: this.tableConfig.table.tableName,
      strategy: compiled.strategy,
      probeFilters: compiled.probeFilters,
      postFilters: compiled.postFilters,
    };

    // Add index if selected
    if (
      compiled.selectedIndex &&
      (compiled.indexFilters.length > 0 || compiled.probeFilters.length > 0)
    ) {
      result.index = {
        name: compiled.selectedIndex.indexName,
        filters: compiled.indexFilters,
      };
    }

    // Compile orderBy (M5 implementation)
    if (config.orderBy) {
      const orderByValue =
        typeof config.orderBy === 'function'
          ? config.orderBy(this.tableConfig.table as any, { asc, desc })
          : config.orderBy;

      const orderSpecs = this._orderBySpecs(orderByValue);
      if (orderSpecs.length > 0) {
        result.order = orderSpecs;
      }
    }

    return result;
  }

  private _buildRelationKey(row: any, fields: string[]): string | null {
    if (!fields.length) return null;
    const values = fields.map((field) => row[field]);
    if (values.some((value) => value === null || value === undefined)) {
      return null;
    }
    return JSON.stringify(values);
  }

  private _buildIndexPredicate(
    q: any,
    fields: string[],
    values: unknown[]
  ): any {
    let builder = q.eq(fields[0], values[0]);
    for (let i = 1; i < fields.length; i += 1) {
      builder = builder.eq(fields[i], values[i]);
    }
    return builder;
  }

  private _buildFilterPredicate(
    q: any,
    fields: string[],
    values: unknown[]
  ): any {
    let expression = q.eq(q.field(fields[0]), values[0]);
    for (let i = 1; i < fields.length; i += 1) {
      expression = q.and(expression, q.eq(q.field(fields[i]), values[i]));
    }
    return expression;
  }

  private _queryByFields(
    query: any,
    fields: string[],
    values: unknown[],
    indexName: string | null
  ): any {
    if (indexName) {
      return query.withIndex(indexName, (q: any) =>
        this._buildIndexPredicate(q, fields, values)
      );
    }
    return query.filter((q: any) =>
      this._buildFilterPredicate(q, fields, values)
    );
  }

  private _getColumns(
    tableConfig: TableRelationalConfig = this.tableConfig
  ): Record<string, ColumnBuilder<any, any, any>> {
    const columns = tableConfig.table[Columns] as Record<
      string,
      ColumnBuilder<any, any, any>
    >;
    const system: Record<string, ColumnBuilder<any, any, any>> = {};

    if ((tableConfig.table as any)._id) {
      system._id = (tableConfig.table as any)._id as ColumnBuilder<
        any,
        any,
        any
      >;
    }
    if ((tableConfig.table as any)._creationTime) {
      system._creationTime = (tableConfig.table as any)
        ._creationTime as ColumnBuilder<any, any, any>;
    }

    return { ...columns, ...system };
  }

  /**
   * Apply a single filter expression to a Convex query builder
   * Used for index filters (eq operations)
   */
  private _applyFilterToQuery(
    query: any,
    filter: FilterExpression<boolean>
  ): any {
    if (filter.type === 'binary') {
      const [field, value] = filter.operands;
      if (!isFieldReference(field)) {
        return query;
      }
      switch (filter.operator) {
        case 'eq':
          return query.eq(field.fieldName, value);
        case 'gt':
          return query.gt(field.fieldName, value);
        case 'gte':
          return query.gte(field.fieldName, value);
        case 'lt':
          return query.lt(field.fieldName, value);
        case 'lte':
          return query.lte(field.fieldName, value);
        default:
          return query;
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
          // M5: String operators (post-filter implementation)
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
            // String operators require post-fetch filtering
            // They can't work in Convex filter context (no JavaScript string methods on field expressions)
            // These are handled in _evaluatePostFetchFilter after rows are fetched
            return () => true; // No-op in Convex filter, will be applied post-fetch
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
   * Get edge metadata for a target table
   * Helper for recursive relation loading
   */
  private _getTargetTableEdges(tableName: string): EdgeMetadata[] {
    if (!this._allEdges) {
      return [];
    }

    // Filter all edges to find those originating from the target table
    return this._allEdges.filter((edge) => edge.sourceTable === tableName);
  }

  private _getRelationConcurrency(): number {
    const value = this.relationLoading?.concurrency;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 25;
    }
    if (value <= 0) {
      return 1;
    }
    return Math.floor(value);
  }

  private _getRelationFanOutKeyCap(tableConfig: TableRelationalConfig): number {
    const value = tableConfig.defaults?.relationFanOutMaxKeys;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return DEFAULT_RELATION_FAN_OUT_MAX_KEYS;
    }
    if (value <= 0) {
      return 1;
    }
    return Math.floor(value);
  }

  private _enforceRelationFanOutKeyCap(options: {
    tableConfig: TableRelationalConfig;
    relationName: string;
    keyCount: number;
    scope: 'source' | 'through-target';
  }) {
    const cap = this._getRelationFanOutKeyCap(options.tableConfig);
    if (options.keyCount <= cap) {
      return;
    }

    const baseMessage =
      `Relation "${options.tableConfig.name}.${options.relationName}" ` +
      `${options.scope} lookup keys (${options.keyCount}) exceed relationFanOutMaxKeys (${cap}).`;

    if (!this.allowFullScan) {
      throw new Error(
        `${baseMessage} Set allowFullScan: true, reduce fan-out, or increase defineSchema(..., { defaults: { relationFanOutMaxKeys } }).`
      );
    }

    if (options.tableConfig.strict !== false) {
      console.warn(`${baseMessage} Continuing because allowFullScan: true.`);
    }
  }

  private async _mapWithConcurrency<T, R>(
    items: T[],
    worker: (item: T, index: number) => Promise<R>
  ): Promise<R[]> {
    if (items.length === 0) {
      return [];
    }
    const limit = Math.min(this._getRelationConcurrency(), items.length);
    const results = new Array<R>(items.length);
    let nextIndex = 0;

    const runWorker = async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) {
          return;
        }
        results[index] = await worker(items[index], index);
      }
    };

    await Promise.all(Array.from({ length: limit }, () => runWorker()));

    return results;
  }

  /**
   * Load relations for query results
   * M6.5 Phase 2 implementation: Recursive relation loading with depth limiting
   *
   * @param rows - Array of parent records to load relations for
   * @param withConfig - Relation configuration object
   * @param depth - Current recursion depth (default 0)
   * @param maxDepth - Maximum recursion depth (default 3)
   * @param targetTableEdges - Edge metadata for nested relations (optional, defaults to this.edgeMetadata)
   */
  private async _loadRelations(
    rows: any[],
    withConfig: Record<string, unknown>,
    depth = 0,
    maxDepth = 3,
    targetTableEdges: EdgeMetadata[] = this.edgeMetadata,
    tableConfig: TableRelationalConfig = this.tableConfig
  ): Promise<any[]> {
    if (!withConfig || rows.length === 0) {
      return rows;
    }

    // Prevent infinite recursion / memory explosion
    if (depth >= maxDepth) {
      return rows;
    }

    // Load all relations in parallel to avoid sequential N+1 queries
    await Promise.all(
      Object.entries(withConfig).map(([relationName, relationConfig]) =>
        this._loadSingleRelation(
          rows,
          relationName,
          relationConfig,
          depth,
          maxDepth,
          targetTableEdges,
          tableConfig
        )
      )
    );

    return rows;
  }

  /**
   * Load a single relation for all rows
   * Handles both one() and many() cardinality
   * M6.5 Phase 2: Added support for nested relations
   */
  private async _loadSingleRelation(
    rows: any[],
    relationName: string,
    relationConfig: unknown,
    depth: number,
    maxDepth: number,
    targetTableEdges: EdgeMetadata[],
    tableConfig: TableRelationalConfig
  ): Promise<void> {
    // Find edge metadata for this relation
    const edge = targetTableEdges.find((e) => e.edgeName === relationName);

    if (!edge) {
      throw new Error(
        `Relation '${relationName}' not found in table '${tableConfig.name}'. ` +
          `Available relations: ${targetTableEdges.map((e) => e.edgeName).join(', ')}`
      );
    }

    // Load based on cardinality
    if (edge.cardinality === 'one') {
      await this._loadOneRelation(
        rows,
        relationName,
        edge,
        relationConfig,
        depth,
        maxDepth,
        tableConfig
      );
    } else {
      await this._loadManyRelation(
        rows,
        relationName,
        edge,
        relationConfig,
        depth,
        maxDepth,
        tableConfig
      );
    }
  }

  /**
   * Load one() relation (many-to-one or one-to-one)
   * Example: posts.author where posts.authorId → users._id
   * M6.5 Phase 2: Added support for nested relations
   */
  private async _loadOneRelation(
    rows: any[],
    relationName: string,
    edge: EdgeMetadata,
    relationConfig: unknown,
    depth: number,
    maxDepth: number,
    tableConfig: TableRelationalConfig
  ): Promise<void> {
    const sourceFields =
      edge.sourceFields.length > 0 ? edge.sourceFields : [edge.fieldName];
    const targetFields =
      edge.targetFields.length > 0 ? edge.targetFields : ['_id'];

    const sourceKeyMap = new Map<string, unknown[]>();
    for (const row of rows) {
      const values = sourceFields.map((field) => row[field]);
      if (values.some((value) => value === null || value === undefined)) {
        continue;
      }
      const key = JSON.stringify(values);
      if (!sourceKeyMap.has(key)) {
        sourceKeyMap.set(key, values);
      }
    }

    if (sourceKeyMap.size === 0) {
      for (const row of rows) {
        row[relationName] = null;
      }
      return;
    }
    this._enforceRelationFanOutKeyCap({
      tableConfig,
      relationName,
      keyCount: sourceKeyMap.size,
      scope: 'source',
    });

    const targetTableConfig = this._getTableConfigByDbName(edge.targetTable);
    if (!targetTableConfig) {
      throw new Error(
        `Relation '${relationName}' target table '${edge.targetTable}' not found.`
      );
    }
    const relationDefinition = tableConfig.relations[relationName];
    const strict = tableConfig.strict !== false;
    const useGetById = targetFields.length === 1 && targetFields[0] === '_id';
    const indexName = useGetById
      ? null
      : findRelationIndex(
          targetTableConfig.table as any,
          targetFields,
          `${tableConfig.name}.${relationName}`,
          edge.targetTable,
          strict,
          this.allowFullScan
        );

    const entries = Array.from(sourceKeyMap.entries());
    const fetched = await this._mapWithConcurrency(
      entries,
      async ([key, values]) => {
        let target: any | null = null;
        if (useGetById) {
          target = await this.db.get(values[0] as any);
        } else {
          const query = this._queryByFields(
            this.db.query(edge.targetTable),
            targetFields,
            values,
            indexName
          );
          target = await query.first();
        }
        return { key, target };
      }
    );

    const targetsByKey = new Map<string, any | null>();
    for (const entry of fetched) {
      targetsByKey.set(entry.key, entry.target ?? null);
    }

    let targets = Array.from(targetsByKey.values()).filter(
      (value): value is any => !!value
    );

    targets = this._applyRlsSelectFilter(targets, targetTableConfig);

    if (relationDefinition?.where) {
      targets = targets.filter((target) =>
        this._evaluateTableFilter(
          target,
          targetTableConfig,
          relationDefinition.where as any
        )
      );
    }

    if (
      relationConfig &&
      typeof relationConfig === 'object' &&
      'where' in relationConfig
    ) {
      const whereFilter = (relationConfig as any).where;
      if (typeof whereFilter === 'function') {
        throw new Error(
          'Function-style where clauses are not supported in Drizzle v1 mode.'
        );
      }
      if (whereFilter) {
        const targetEdges = this._getTargetTableEdges(edge.targetTable);
        targets = await this._applyRelationsFilterToRows(
          targets,
          targetTableConfig,
          whereFilter,
          targetEdges,
          depth + 1,
          maxDepth,
          (relationConfig as any).with
        );
      }
    }

    if (
      relationConfig &&
      typeof relationConfig === 'object' &&
      'with' in relationConfig
    ) {
      const targetTableEdges = this._getTargetTableEdges(edge.targetTable);
      await this._loadRelations(
        targets,
        (relationConfig as any).with,
        depth + 1,
        maxDepth,
        targetTableEdges,
        targetTableConfig
      );
    }

    if (
      relationConfig &&
      typeof relationConfig === 'object' &&
      'extras' in relationConfig
    ) {
      targets = this._applyExtras(
        targets,
        (relationConfig as any).extras,
        this._getColumns(targetTableConfig),
        (relationConfig as any).with,
        targetTableConfig.name
      );
    }

    let selectedTargets = targets;
    if (
      relationConfig &&
      typeof relationConfig === 'object' &&
      'columns' in relationConfig
    ) {
      selectedTargets = this._selectColumns(
        targets,
        (relationConfig as any).columns,
        this._getColumns(targetTableConfig)
      );
    }

    const selectedTargetsByKey = new Map<string, any>();
    for (let i = 0; i < targets.length; i += 1) {
      const key = this._buildRelationKey(targets[i], targetFields);
      if (key) {
        selectedTargetsByKey.set(key, selectedTargets[i]);
      }
    }

    for (const row of rows) {
      const rowKey = this._buildRelationKey(row, sourceFields);
      row[relationName] = rowKey
        ? (selectedTargetsByKey.get(rowKey) ?? null)
        : null;
    }
  }

  /**
   * Load many() relation (one-to-many)
   * Example: users.posts where posts.authorId → users._id
   *
   * For many() relations, use the configured from/to fields to match rows.
   * Supports .through() for many-to-many relations via a junction table.
   * M6.5 Phase 2: Added support for nested relations
   * M6.5 Phase 3: Added support for where filters, orderBy, and per-parent limit
   */
  private async _loadManyRelation(
    rows: any[],
    relationName: string,
    edge: EdgeMetadata,
    relationConfig: unknown,
    depth: number,
    maxDepth: number,
    tableConfig: TableRelationalConfig
  ): Promise<void> {
    const sourceFields =
      edge.sourceFields.length > 0 ? edge.sourceFields : ['_id'];
    const targetFields =
      edge.targetFields.length > 0 ? edge.targetFields : [edge.fieldName];

    const sourceKeyMap = new Map<string, unknown[]>();
    for (const row of rows) {
      const values = sourceFields.map((field) => row[field]);
      if (values.some((value) => value === null || value === undefined)) {
        continue;
      }
      const key = JSON.stringify(values);
      if (!sourceKeyMap.has(key)) {
        sourceKeyMap.set(key, values);
      }
    }

    if (sourceKeyMap.size === 0) {
      return;
    }
    this._enforceRelationFanOutKeyCap({
      tableConfig,
      relationName,
      keyCount: sourceKeyMap.size,
      scope: 'source',
    });

    const targetTableConfig = this._getTableConfigByDbName(edge.targetTable);
    if (!targetTableConfig) {
      throw new Error(
        `Relation '${relationName}' target table '${edge.targetTable}' not found.`
      );
    }
    const relationDefinition = tableConfig.relations[relationName];
    const strict = tableConfig.strict !== false;

    let orderSpecs: { field: string; direction: 'asc' | 'desc' }[] = [];
    if (
      relationConfig &&
      typeof relationConfig === 'object' &&
      'orderBy' in relationConfig
    ) {
      let orderByValue = (relationConfig as any).orderBy;
      if (typeof orderByValue === 'function') {
        orderByValue = orderByValue(targetTableConfig.table as any, {
          asc,
          desc,
        });
      }
      orderSpecs = this._orderBySpecs(orderByValue);
    }

    const perParentLimit =
      relationConfig &&
      typeof relationConfig === 'object' &&
      'limit' in relationConfig
        ? (relationConfig as any).limit
        : undefined;
    const effectivePerParentLimit =
      perParentLimit ?? tableConfig.defaults?.defaultLimit;
    if (
      effectivePerParentLimit !== undefined &&
      (!Number.isInteger(effectivePerParentLimit) ||
        effectivePerParentLimit < 1)
    ) {
      throw new Error(
        'Only positive integer limit is supported in Better Convex ORM.'
      );
    }
    if (effectivePerParentLimit === undefined && !this.allowFullScan) {
      throw new Error(
        `Relation "${tableConfig.name}.${relationName}" requires limit, allowFullScan: true, or defineSchema(..., { defaults: { defaultLimit } }).`
      );
    }

    const perParentOffset =
      relationConfig &&
      typeof relationConfig === 'object' &&
      'offset' in relationConfig
        ? (relationConfig as any).offset
        : undefined;
    if (perParentOffset !== undefined && typeof perParentOffset !== 'number') {
      throw new Error('Only numeric offset is supported in Better Convex ORM.');
    }

    const applyOffsetAndLimit = (items: any[]): any[] => {
      let result = items;
      if (perParentOffset !== undefined && perParentOffset > 0) {
        result = result.slice(perParentOffset);
      }
      if (effectivePerParentLimit !== undefined) {
        result = result.slice(0, effectivePerParentLimit);
      }
      return result;
    };

    let targets: any[] = [];
    let throughBySourceKey: Map<string, any[]> | undefined;

    if (edge.through) {
      const throughTableConfig = this._getTableConfigByDbName(
        edge.through.table
      );
      if (!throughTableConfig) {
        throw new Error(
          `Relation '${relationName}' through table '${edge.through.table}' not found.`
        );
      }

      const throughIndexName = findRelationIndex(
        throughTableConfig.table as any,
        edge.through.sourceFields,
        `${tableConfig.name}.${relationName}`,
        edge.through.table,
        strict,
        this.allowFullScan
      );

      const entries = Array.from(sourceKeyMap.entries());
      const throughRowsPerSource = await this._mapWithConcurrency(
        entries,
        async ([key, values]) => {
          const query = this._queryByFields(
            this.db.query(edge.through!.table),
            edge.through!.sourceFields,
            values,
            throughIndexName
          );
          const throughRows = await query.collect();
          return { key, rows: throughRows };
        }
      );

      throughBySourceKey = new Map<string, any[]>();
      const targetKeyMap = new Map<string, unknown[]>();
      for (const entry of throughRowsPerSource) {
        throughBySourceKey.set(entry.key, entry.rows);
        for (const row of entry.rows) {
          const values = edge.through!.targetFields.map((field) => row[field]);
          if (values.some((value) => value === null || value === undefined)) {
            continue;
          }
          const key = JSON.stringify(values);
          if (!targetKeyMap.has(key)) {
            targetKeyMap.set(key, values);
          }
        }
      }
      this._enforceRelationFanOutKeyCap({
        tableConfig,
        relationName,
        keyCount: targetKeyMap.size,
        scope: 'through-target',
      });

      if (targetKeyMap.size > 0) {
        const useGetById =
          targetFields.length === 1 && targetFields[0] === '_id';
        const targetIndexName = useGetById
          ? null
          : findRelationIndex(
              targetTableConfig.table as any,
              targetFields,
              `${tableConfig.name}.${relationName}`,
              edge.targetTable,
              strict,
              this.allowFullScan
            );

        const targetEntries = Array.from(targetKeyMap.entries());
        const fetchedTargets = await this._mapWithConcurrency(
          targetEntries,
          async ([key, values]) => {
            let target: any | null = null;
            if (useGetById) {
              target = await this.db.get(values[0] as any);
            } else {
              const query = this._queryByFields(
                this.db.query(edge.targetTable),
                targetFields,
                values,
                targetIndexName
              );
              target = await query.first();
            }
            return { key, target };
          }
        );

        targets = fetchedTargets
          .map((entry) => entry.target)
          .filter((value): value is any => !!value);
      }
    } else {
      const indexName = findRelationIndex(
        targetTableConfig.table as any,
        targetFields,
        `${tableConfig.name}.${relationName}`,
        edge.targetTable,
        strict,
        this.allowFullScan
      );

      const entries = Array.from(sourceKeyMap.entries());
      const targetGroups = await this._mapWithConcurrency(
        entries,
        async ([, values]) => {
          const query = this._queryByFields(
            this.db.query(edge.targetTable),
            targetFields,
            values,
            indexName
          );

          if (
            orderSpecs.length === 0 &&
            effectivePerParentLimit !== undefined
          ) {
            const fetchLimit =
              (perParentOffset ?? 0) + (effectivePerParentLimit ?? 0);
            return await query.take(fetchLimit);
          }

          return await query.collect();
        }
      );

      targets = targetGroups.flat();
    }

    targets = this._applyRlsSelectFilter(targets, targetTableConfig);

    if (relationDefinition?.where) {
      targets = targets.filter((target) =>
        this._evaluateTableFilter(
          target,
          targetTableConfig,
          relationDefinition.where as any
        )
      );
    }

    if (
      relationConfig &&
      typeof relationConfig === 'object' &&
      'where' in relationConfig
    ) {
      const whereFilter = (relationConfig as any).where;
      if (typeof whereFilter === 'function') {
        throw new Error(
          'Function-style where clauses are not supported in Drizzle v1 mode.'
        );
      }
      if (whereFilter) {
        const targetEdges = this._getTargetTableEdges(edge.targetTable);
        targets = await this._applyRelationsFilterToRows(
          targets,
          targetTableConfig,
          whereFilter,
          targetEdges,
          depth + 1,
          maxDepth,
          (relationConfig as any).with
        );
      }
    }

    if (orderSpecs.length > 0) {
      targets.sort((a, b) => this._compareByOrderSpecs(a, b, orderSpecs));
    }

    if (
      relationConfig &&
      typeof relationConfig === 'object' &&
      'with' in relationConfig
    ) {
      const targetTableEdges = this._getTargetTableEdges(edge.targetTable);
      await this._loadRelations(
        targets,
        (relationConfig as any).with,
        depth + 1,
        maxDepth,
        targetTableEdges,
        targetTableConfig
      );
    }

    if (
      relationConfig &&
      typeof relationConfig === 'object' &&
      'extras' in relationConfig
    ) {
      targets = this._applyExtras(
        targets,
        (relationConfig as any).extras,
        this._getColumns(targetTableConfig),
        (relationConfig as any).with,
        targetTableConfig.name
      );
    }

    let selectedTargets: any[] | undefined;
    let selectedTargetsByKey: Map<string, any> | undefined;
    if (
      relationConfig &&
      typeof relationConfig === 'object' &&
      'columns' in relationConfig &&
      targetTableConfig
    ) {
      selectedTargets = this._selectColumns(
        targets,
        (relationConfig as any).columns,
        this._getColumns(targetTableConfig)
      );
      selectedTargetsByKey = new Map<string, any>();
      for (let i = 0; i < targets.length; i += 1) {
        const key = this._buildRelationKey(targets[i], targetFields);
        if (key) {
          selectedTargetsByKey.set(key, selectedTargets[i]);
        }
      }
    }

    if (edge.through) {
      const targetOrder = new Map<string, number>();
      targets.forEach((target, index) => {
        const key = this._buildRelationKey(target, targetFields);
        if (key) targetOrder.set(key, index);
      });

      const targetsByKey = selectedTargetsByKey ?? new Map<string, any>();
      if (!selectedTargetsByKey) {
        for (const target of targets) {
          const key = this._buildRelationKey(target, targetFields);
          if (key) targetsByKey.set(key, target);
        }
      }

      for (const row of rows) {
        const sourceKey = this._buildRelationKey(row, sourceFields);
        if (!sourceKey || !throughBySourceKey) {
          row[relationName] = [];
          continue;
        }
        const throughRowsForSource = throughBySourceKey.get(sourceKey) ?? [];
        const relatedTargets = throughRowsForSource
          .map((throughRow) => {
            const key = this._buildRelationKey(
              throughRow,
              edge.through!.targetFields
            );
            return key ? targetsByKey.get(key) : undefined;
          })
          .filter((t): t is any => !!t)
          .sort((a, b) => {
            const aKey = this._buildRelationKey(a, targetFields) ?? '';
            const bKey = this._buildRelationKey(b, targetFields) ?? '';
            return (targetOrder.get(aKey) ?? 0) - (targetOrder.get(bKey) ?? 0);
          });
        row[relationName] = applyOffsetAndLimit(relatedTargets);
      }
    } else {
      // Group targets by parent key
      const byParentKey = new Map<string, any[]>();
      const targetsForMapping = selectedTargets ?? targets;
      for (let i = 0; i < targets.length; i += 1) {
        const target = targets[i];
        const mappedTarget = targetsForMapping[i];
        const parentKey = this._buildRelationKey(target, targetFields);
        if (!parentKey) continue;
        if (!byParentKey.has(parentKey)) {
          byParentKey.set(parentKey, []);
        }
        byParentKey.get(parentKey)!.push(mappedTarget);
      }

      // M6.5 Phase 3: Apply per-parent offset/limit
      if (
        perParentOffset !== undefined ||
        effectivePerParentLimit !== undefined
      ) {
        for (const [parentKey, children] of byParentKey.entries()) {
          byParentKey.set(parentKey, applyOffsetAndLimit(children));
        }
      }

      // Map relations back to parent rows
      for (const row of rows) {
        const rowKey = this._buildRelationKey(row, sourceFields);
        row[relationName] = rowKey ? (byParentKey.get(rowKey) ?? []) : [];
      }
    }
  }

  private _applyExtras(
    rows: any[],
    extrasConfig: unknown,
    tableColumns: Record<string, ColumnBuilder<any, any, any>>,
    withConfig: Record<string, unknown> | undefined,
    tableName: string
  ): any[] {
    if (!extrasConfig || rows.length === 0) {
      return rows;
    }

    const resolvedExtras =
      typeof extrasConfig === 'function'
        ? extrasConfig(tableColumns)
        : extrasConfig;

    if (!this._isRecord(resolvedExtras)) {
      return rows;
    }

    const entries = Object.entries(resolvedExtras);
    if (entries.length === 0) {
      return rows;
    }

    for (const [key] of entries) {
      if (key in tableColumns) {
        throw new Error(
          `extras.${key} conflicts with a column on table '${tableName}'.`
        );
      }
      if (withConfig && key in withConfig) {
        throw new Error(
          `extras.${key} conflicts with a relation on table '${tableName}'.`
        );
      }
    }

    for (const row of rows) {
      for (const [key, definition] of entries) {
        row[key] =
          typeof definition === 'function' ? definition(row) : definition;
      }
    }

    return rows;
  }

  /**
   * Select specific columns from rows
   * Phase 5 implementation
   */
  private _selectColumns(
    rows: any[],
    columnsConfig?: Record<string, boolean>,
    tableColumns?: Record<string, ColumnBuilder<any, any, any>>
  ): any[] {
    if (!columnsConfig) {
      // No column selection - return all columns
      return rows;
    }

    const columnKeys = tableColumns
      ? new Set(Object.keys(tableColumns))
      : undefined;
    const entries = Object.entries(columnsConfig).filter(
      ([, value]) => value !== undefined
    );
    const hasTrue = entries.some(([, value]) => value === true);

    if (entries.length === 0) {
      return rows.map((row) => {
        if (!columnKeys) return {};
        const selected: any = {};
        for (const key of Object.keys(row)) {
          if (!columnKeys.has(key)) {
            selected[key] = row[key];
          }
        }
        return selected;
      });
    }

    if (hasTrue) {
      const includeKeys = entries
        .filter(([, value]) => value === true)
        .map(([key]) => key);
      return rows.map((row) => {
        const selected: any = {};
        for (const key of includeKeys) {
          if (key in row) {
            selected[key] = row[key];
          }
        }
        if (columnKeys) {
          for (const key of Object.keys(row)) {
            if (!columnKeys.has(key)) {
              selected[key] = row[key];
            }
          }
        }
        return selected;
      });
    }

    const excludeKeys = entries
      .filter(([, value]) => value === false)
      .map(([key]) => key);
    return rows.map((row) => {
      const selected = { ...row };
      for (const key of excludeKeys) {
        if (!columnKeys || columnKeys.has(key)) {
          delete selected[key];
        }
      }
      return selected;
    });
  }
}
