/**
 * FilterExpression - Type-safe filter expression tree
 *
 * Pattern from Drizzle: drizzle-orm/sql/expressions/conditions.ts
 * Uses opaque branded types to prevent direct construction and ensure type safety
 *
 * Architecture:
 * - FilterExpression: Opaque branded type for all filter nodes
 * - Visitor pattern: Extensible traversal without modifying expression classes
 * - Immutable tree structure: Expressions are read-only after construction
 */

import type { ColumnBuilder } from './builders/column-builder';

/**
 * Extract TypeScript type from a column builder
 * Uses phantom `_` property to get type info
 */
type ColumnToType<TBuilder extends ColumnBuilder<any, any, any>> =
  TBuilder['_']['notNull'] extends true
    ? TBuilder['_']['data']
    : TBuilder['_']['data'] | null;

// ============================================================================
// Branded Type Symbol
// ============================================================================

/**
 * Unique symbol for FilterExpression brand
 * Prevents structural typing - only expressions created by factory functions are valid
 */
const FilterExpressionBrand: unique symbol = Symbol('FilterExpression');

// ============================================================================
// Core Expression Types
// ============================================================================

/**
 * Base filter expression interface
 * All filter expressions (binary, logical, unary) implement this interface
 *
 * @template TValue - The TypeScript type this expression evaluates to
 */
export interface FilterExpression<_TValue = boolean> {
  /** Brand symbol for nominal typing */
  readonly [FilterExpressionBrand]: true;
  /** Expression type discriminator */
  readonly type: 'binary' | 'logical' | 'unary';
  /** Operator string (eq, and, not, etc.) */
  readonly operator: string;
  /** Expression operands (FieldReference, values, or nested expressions) */
  readonly operands: readonly any[];
  /** Accept visitor for traversal */
  accept<R>(visitor: ExpressionVisitor<R>): R;
}

/**
 * Binary operator expression (eq, ne, gt, gte, lt, lte, inArray, notInArray)
 * Compares field to value: field eq value
 *
 * @template TField - Field type being compared
 */
export interface BinaryExpression<TField = any>
  extends FilterExpression<boolean> {
  readonly type: 'binary';
  readonly operator:
    | 'eq'
    | 'ne'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'inArray'
    | 'notInArray';
  /** [field, value] or [field, array] for inArray/notInArray */
  readonly operands: readonly [FieldReference<TField>, TField | TField[]];
}

/**
 * Logical operator expression (and, or)
 * Combines multiple filter expressions
 */
export interface LogicalExpression extends FilterExpression<boolean> {
  readonly type: 'logical';
  readonly operator: 'and' | 'or';
  /** Array of nested filter expressions */
  readonly operands: readonly FilterExpression<boolean>[];
}

/**
 * Unary operator expression (not, isNull, isNotNull)
 * Negates or checks null state of an expression
 */
export interface UnaryExpression extends FilterExpression<boolean> {
  readonly type: 'unary';
  readonly operator: 'not' | 'isNull' | 'isNotNull';
  /** Single nested filter expression or field reference for null checks */
  readonly operands: readonly [FilterExpression<boolean> | FieldReference<any>];
}

// ============================================================================
// Field Reference
// ============================================================================

/**
 * CRITICAL: FieldReference abstraction
 *
 * Decouples filter expressions from M2 table configuration
 * Allows filter expressions to reference fields without knowing about validators
 *
 * @template TValue - TypeScript type of the field
 */
export interface FieldReference<TValue = unknown> {
  readonly __brand: 'FieldReference';
  readonly fieldName: string;
  /** Phantom type for type inference - not present at runtime */
  readonly __type?: TValue;
}

/**
 * Create a field reference
 * Used internally by operator functions
 */
export function fieldRef<T>(fieldName: string): FieldReference<T> {
  return {
    __brand: 'FieldReference',
    fieldName,
  };
}

/**
 * Type guard for FieldReference
 */
export function isFieldReference(value: any): value is FieldReference<any> {
  return (
    value && typeof value === 'object' && value.__brand === 'FieldReference'
  );
}

// ============================================================================
// Column Wrapper
// ============================================================================

/**
 * Column wrapper - combines builder with column name
 * Used in where clause to pass column objects to operators
 * Following Drizzle's pattern: operators receive columns, not extracted types
 *
 * @template TBuilder - The column builder type
 * @template TName - The column name (string literal)
 */
export interface Column<
  TBuilder extends ColumnBuilder<any, any, any> = any,
  TName extends string = string,
> {
  readonly builder: TBuilder;
  readonly columnName: TName;
}

/**
 * Create a column wrapper
 * Used internally by query builder's _createColumnProxies
 */
export function column<
  TBuilder extends ColumnBuilder<any, any, any>,
  TName extends string,
>(builder: TBuilder, columnName: TName): Column<TBuilder, TName> {
  return { builder, columnName };
}

// ============================================================================
// Visitor Pattern
// ============================================================================

/**
 * Expression visitor interface for tree traversal
 * Extensible pattern - add new visit methods without modifying expression classes
 *
 * @template R - Return type of visit operations
 */
export interface ExpressionVisitor<R = void> {
  visitBinary(expr: BinaryExpression): R;
  visitLogical(expr: LogicalExpression): R;
  visitUnary(expr: UnaryExpression): R;
}

// ============================================================================
// Expression Implementation Classes
// ============================================================================

/**
 * Internal binary expression implementation
 * Private class - only accessible via factory functions
 */
class BinaryExpressionImpl<TField> implements BinaryExpression<TField> {
  readonly [FilterExpressionBrand] = true as const;
  readonly type = 'binary' as const;

  constructor(
    readonly operator: BinaryExpression['operator'],
    readonly operands: readonly [FieldReference<TField>, TField | TField[]]
  ) {}

  accept<R>(visitor: ExpressionVisitor<R>): R {
    return visitor.visitBinary(this);
  }
}

/**
 * Internal logical expression implementation
 * Private class - only accessible via factory functions
 */
class LogicalExpressionImpl implements LogicalExpression {
  readonly [FilterExpressionBrand] = true as const;
  readonly type = 'logical' as const;

  constructor(
    readonly operator: LogicalExpression['operator'],
    readonly operands: readonly FilterExpression<boolean>[]
  ) {}

  accept<R>(visitor: ExpressionVisitor<R>): R {
    return visitor.visitLogical(this);
  }
}

/**
 * Internal unary expression implementation
 * Private class - only accessible via factory functions
 */
class UnaryExpressionImpl implements UnaryExpression {
  readonly [FilterExpressionBrand] = true as const;
  readonly type = 'unary' as const;

  constructor(
    readonly operator: UnaryExpression['operator'],
    readonly operands: readonly [FilterExpression<boolean>]
  ) {}

  accept<R>(visitor: ExpressionVisitor<R>): R {
    return visitor.visitUnary(this);
  }
}

// ============================================================================
// Factory Functions - Binary Operators
// ============================================================================

/**
 * Equality operator: field == value
 *
 * @example
 * const filter = eq(cols.name, 'Alice');
 */
export function eq<TBuilder extends ColumnBuilder<any, any, any>>(
  col: Column<TBuilder, string>,
  value: ColumnToType<TBuilder>
): BinaryExpression<ColumnToType<TBuilder>> {
  return new BinaryExpressionImpl('eq', [fieldRef(col.columnName), value]);
}

/**
 * Not equal operator: field != value
 */
export function ne<TBuilder extends ColumnBuilder<any, any, any>>(
  col: Column<TBuilder, string>,
  value: ColumnToType<TBuilder>
): BinaryExpression<ColumnToType<TBuilder>> {
  return new BinaryExpressionImpl('ne', [fieldRef(col.columnName), value]);
}

/**
 * Greater than operator: field > value
 */
export function gt<TBuilder extends ColumnBuilder<any, any, any>>(
  col: Column<TBuilder, string>,
  value: ColumnToType<TBuilder>
): BinaryExpression<ColumnToType<TBuilder>> {
  return new BinaryExpressionImpl('gt', [fieldRef(col.columnName), value]);
}

/**
 * Greater than or equal operator: field >= value
 */
export function gte<TBuilder extends ColumnBuilder<any, any, any>>(
  col: Column<TBuilder, string>,
  value: ColumnToType<TBuilder>
): BinaryExpression<ColumnToType<TBuilder>> {
  return new BinaryExpressionImpl('gte', [fieldRef(col.columnName), value]);
}

/**
 * Less than operator: field < value
 */
export function lt<TBuilder extends ColumnBuilder<any, any, any>>(
  col: Column<TBuilder, string>,
  value: ColumnToType<TBuilder>
): BinaryExpression<ColumnToType<TBuilder>> {
  return new BinaryExpressionImpl('lt', [fieldRef(col.columnName), value]);
}

/**
 * Less than or equal operator: field <= value
 */
export function lte<TBuilder extends ColumnBuilder<any, any, any>>(
  col: Column<TBuilder, string>,
  value: ColumnToType<TBuilder>
): BinaryExpression<ColumnToType<TBuilder>> {
  return new BinaryExpressionImpl('lte', [fieldRef(col.columnName), value]);
}

// ============================================================================
// Factory Functions - Logical Operators
// ============================================================================

/**
 * Logical AND: all expressions must be true
 * Filters out undefined expressions (following Drizzle pattern)
 *
 * @example
 * const filter = and(
 *   eq(fieldRef('age'), 25),
 *   eq(fieldRef('name'), 'Alice')
 * );
 */
export function and(
  ...expressions: (FilterExpression<boolean> | undefined)[]
): LogicalExpression | undefined {
  // Filter out undefined expressions
  const defined = expressions.filter(
    (expr): expr is FilterExpression<boolean> => expr !== undefined
  );

  // If no expressions remain, return undefined
  if (defined.length === 0) {
    return;
  }

  // If only one expression, return it directly (optimization)
  if (defined.length === 1) {
    return defined[0] as LogicalExpression;
  }

  return new LogicalExpressionImpl('and', defined);
}

/**
 * Logical OR: at least one expression must be true
 * Filters out undefined expressions (following Drizzle pattern)
 *
 * @example
 * const filter = or(
 *   eq(fieldRef('status'), 'active'),
 *   eq(fieldRef('status'), 'pending')
 * );
 */
export function or(
  ...expressions: (FilterExpression<boolean> | undefined)[]
): LogicalExpression | undefined {
  // Filter out undefined expressions
  const defined = expressions.filter(
    (expr): expr is FilterExpression<boolean> => expr !== undefined
  );

  // If no expressions remain, return undefined
  if (defined.length === 0) {
    return;
  }

  // If only one expression, return it directly (optimization)
  if (defined.length === 1) {
    return defined[0] as LogicalExpression;
  }

  return new LogicalExpressionImpl('or', defined);
}

/**
 * Logical NOT: negates expression
 *
 * @example
 * const filter = not(eq(fieldRef('isDeleted'), true));
 */
export function not(expression: FilterExpression<boolean>): UnaryExpression {
  return new UnaryExpressionImpl('not', [expression]);
}

// ============================================================================
// Factory Functions - Array Operators
// ============================================================================

/**
 * Array membership operator: field IN array
 * Validates array is non-empty at construction time
 *
 * @example
 * const filter = inArray(cols.status, ['active', 'pending']);
 */
export function inArray<TBuilder extends ColumnBuilder<any, any, any>>(
  col: Column<TBuilder, string>,
  values: readonly ColumnToType<TBuilder>[]
): BinaryExpression<ColumnToType<TBuilder>> {
  // Validation: Array must be non-empty
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('inArray requires a non-empty array of values');
  }
  return new BinaryExpressionImpl('inArray', [
    fieldRef(col.columnName),
    values as any,
  ]);
}

/**
 * Array exclusion operator: field NOT IN array
 * Validates array is non-empty at construction time
 *
 * @example
 * const filter = notInArray(cols.role, ['admin', 'moderator']);
 */
export function notInArray<TBuilder extends ColumnBuilder<any, any, any>>(
  col: Column<TBuilder, string>,
  values: readonly ColumnToType<TBuilder>[]
): BinaryExpression<ColumnToType<TBuilder>> {
  // Validation: Array must be non-empty
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('notInArray requires a non-empty array of values');
  }
  return new BinaryExpressionImpl('notInArray', [
    fieldRef(col.columnName),
    values as any,
  ]);
}

// ============================================================================
// Factory Functions - Null Operators
// ============================================================================

/**
 * Null check operator: field IS NULL
 * Type validation: Only works with nullable fields
 *
 * @example
 * const filter = isNull(cols.deletedAt);
 */
export function isNull<TBuilder extends ColumnBuilder<any, any, any>>(
  col: Column<TBuilder, string>
): UnaryExpression {
  return new UnaryExpressionImpl('isNull', [fieldRef(col.columnName) as any]);
}

/**
 * Not null check operator: field IS NOT NULL
 * Type validation: Only works with nullable fields
 *
 * @example
 * const filter = isNotNull(cols.deletedAt);
 */
export function isNotNull<TBuilder extends ColumnBuilder<any, any, any>>(
  col: Column<TBuilder, string>
): UnaryExpression {
  return new UnaryExpressionImpl('isNotNull', [
    fieldRef(col.columnName) as any,
  ]);
}
