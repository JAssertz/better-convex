/**
 * WhereClauseCompiler - Compiles FilterExpression to Convex queries
 *
 * Core responsibilities:
 * 1. Filter splitting - separate index-compatible from post-filters
 * 2. Index selection - choose best index using scoring algorithm
 * 3. Query generation - convert to Convex withIndex/filter calls
 *
 * Pattern from Drizzle: drizzle-orm/mysql-core/query-builders/select.ts
 */

import type { EdgeMetadata } from './extractRelationsConfig';
import type {
  BinaryExpression,
  ExpressionVisitor,
  FilterExpression,
  LogicalExpression,
  UnaryExpression,
} from './filter-expression';
import { isFieldReference } from './filter-expression';

// ============================================================================
// Compilation Result
// ============================================================================

/**
 * Result of compiling a where clause
 * Contains index selection and filter expressions
 */
export interface WhereClauseResult {
  /** Selected index for query optimization (null if no suitable index) */
  selectedIndex: EdgeMetadata | null;
  /** Filters that can use the index (eq on indexed fields) */
  indexFilters: FilterExpression<boolean>[];
  /** Filters applied after index scan (gt, lt, and, or, not) */
  postFilters: FilterExpression<boolean>[];
}

/**
 * Index match score for ranking candidate indexes
 */
interface IndexScore {
  index: EdgeMetadata;
  score: number;
  matchType: 'exact' | 'prefix' | 'partial';
  matchedFields: string[];
}

// ============================================================================
// WhereClauseCompiler
// ============================================================================

/**
 * Compiles FilterExpression trees into optimized Convex queries
 *
 * Algorithm:
 * 1. Extract field references from expression tree
 * 2. Score available indexes by field match quality
 * 3. Select best index (exact > prefix > partial)
 * 4. Split filters into index-compatible vs post-filters
 */
export class WhereClauseCompiler {
  constructor(
    _tableName: string,
    private availableIndexes: EdgeMetadata[]
  ) {}

  /**
   * Compile a filter expression to Convex query structure
   *
   * @param expression - Filter expression tree
   * @returns Compilation result with index and filters
   */
  compile(
    expression: FilterExpression<boolean> | undefined
  ): WhereClauseResult {
    // No filter - return empty result
    if (!expression) {
      return {
        selectedIndex: null,
        indexFilters: [],
        postFilters: [],
      };
    }

    // Extract all field references from expression
    const referencedFields = this.extractFieldReferences(expression);

    // Score and select best index
    const selectedIndex = this.selectIndex(referencedFields);

    // Split filters based on selected index
    const { indexFilters, postFilters } = this.splitFilters(
      expression,
      selectedIndex
    );

    return {
      selectedIndex,
      indexFilters,
      postFilters,
    };
  }

  /**
   * Extract all field references from expression tree
   * Uses visitor pattern to traverse tree
   *
   * @param expression - Filter expression to traverse
   * @returns Set of referenced field names
   */
  private extractFieldReferences(
    expression: FilterExpression<boolean>
  ): Set<string> {
    const fields = new Set<string>();

    const visitor: ExpressionVisitor<void> = {
      visitBinary: (expr: BinaryExpression) => {
        const [field] = expr.operands;
        if (isFieldReference(field)) {
          fields.add(field.fieldName);
        }
      },
      visitLogical: (expr: LogicalExpression) => {
        // Recursively traverse nested expressions
        for (const operand of expr.operands) {
          operand.accept(visitor);
        }
      },
      visitUnary: (expr: UnaryExpression) => {
        // Recursively traverse nested expression
        const operand = expr.operands[0];
        // Only FilterExpression has accept method, not FieldReference
        if ('accept' in operand && typeof operand.accept === 'function') {
          operand.accept(visitor);
        } else if (isFieldReference(operand)) {
          // FieldReference in unary expression (isNull, isNotNull) - just extract field name
          fields.add(operand.fieldName);
        }
      },
    };

    expression.accept(visitor);
    return fields;
  }

  /**
   * Select best index using scoring algorithm
   *
   * Scoring:
   * - Exact match: 100 + index field count (all fields match in order)
   * - Prefix match: 75 + matched field count (subset matches from start)
   * - Partial match: 50 * overlap ratio (some fields match)
   * - No match: null (no suitable index)
   *
   * @param referencedFields - Fields referenced in filter expression
   * @returns Best matching index or null
   */
  private selectIndex(referencedFields: Set<string>): EdgeMetadata | null {
    if (referencedFields.size === 0 || this.availableIndexes.length === 0) {
      return null;
    }

    const scores: IndexScore[] = [];

    for (const index of this.availableIndexes) {
      const score = this.scoreIndex(index, referencedFields);
      if (score) {
        scores.push(score);
      }
    }

    // Sort by score descending, then by match type priority
    scores.sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      // Tie-breaker: exact > prefix > partial
      const typeOrder = { exact: 3, prefix: 2, partial: 1 };
      return typeOrder[b.matchType] - typeOrder[a.matchType];
    });

    return scores[0]?.index ?? null;
  }

  /**
   * Score a single index for field match quality
   *
   * @param index - Index to score
   * @param referencedFields - Fields referenced in filter
   * @returns Score or null if no match
   */
  private scoreIndex(
    index: EdgeMetadata,
    referencedFields: Set<string>
  ): IndexScore | null {
    const indexFields = index.indexFields;
    const refArray = Array.from(referencedFields);

    // Check for exact match - all fields match in order
    if (this.isExactMatch(indexFields, refArray)) {
      return {
        index,
        score: 100 + indexFields.length,
        matchType: 'exact',
        matchedFields: indexFields,
      };
    }

    // Check for prefix match - subset matches from start
    const prefixCount = this.getPrefixMatchCount(indexFields, referencedFields);
    if (prefixCount > 0) {
      return {
        index,
        score: 75 + prefixCount,
        matchType: 'prefix',
        matchedFields: indexFields.slice(0, prefixCount),
      };
    }

    // Check for partial match - some fields overlap
    const overlapCount = this.getOverlapCount(indexFields, referencedFields);
    if (overlapCount > 0) {
      const overlapRatio =
        overlapCount / Math.max(indexFields.length, refArray.length);
      return {
        index,
        score: 50 * overlapRatio,
        matchType: 'partial',
        matchedFields: indexFields.filter((f) => referencedFields.has(f)),
      };
    }

    return null;
  }

  /**
   * Check if referenced fields exactly match index fields in order
   */
  private isExactMatch(
    indexFields: string[],
    referencedFields: string[]
  ): boolean {
    if (indexFields.length !== referencedFields.length) {
      return false;
    }
    return indexFields.every((field, i) => field === referencedFields[i]);
  }

  /**
   * Count how many index fields match from the start
   * Example: index [a, b, c], refs [a, b] → 2 (prefix match)
   */
  private getPrefixMatchCount(
    indexFields: string[],
    referencedFields: Set<string>
  ): number {
    let count = 0;
    for (const field of indexFields) {
      if (referencedFields.has(field)) {
        count++;
      } else {
        break; // Stop at first non-match
      }
    }
    return count;
  }

  /**
   * Count total field overlap between index and references
   */
  private getOverlapCount(
    indexFields: string[],
    referencedFields: Set<string>
  ): number {
    return indexFields.filter((field) => referencedFields.has(field)).length;
  }

  /**
   * Split filters into index-compatible and post-filters
   *
   * Index-compatible filters:
   * - Binary eq operations on indexed fields
   * - Can be pushed into .withIndex() for efficient scanning
   *
   * Post-filters:
   * - All other operators (ne, gt, lt, and, or, not)
   * - Applied via .filter() after index scan
   *
   * @param expression - Filter expression tree
   * @param selectedIndex - Selected index (if any)
   * @returns Split filters
   */
  private splitFilters(
    expression: FilterExpression<boolean>,
    selectedIndex: EdgeMetadata | null
  ): {
    indexFilters: FilterExpression<boolean>[];
    postFilters: FilterExpression<boolean>[];
  } {
    // No index selected - all filters are post-filters
    if (!selectedIndex) {
      return {
        indexFilters: [],
        postFilters: [expression],
      };
    }

    const indexableFields = new Set(selectedIndex.indexFields);
    const indexFilters: FilterExpression<boolean>[] = [];
    const postFilters: FilterExpression<boolean>[] = [];

    // Traverse expression tree and categorize filters
    const visitor: ExpressionVisitor<void> = {
      visitBinary: (expr: BinaryExpression) => {
        const [field] = expr.operands;
        const isIndexable =
          expr.operator === 'eq' &&
          isFieldReference(field) &&
          indexableFields.has(field.fieldName);

        if (isIndexable) {
          indexFilters.push(expr);
        } else {
          postFilters.push(expr);
        }
      },
      visitLogical: (expr: LogicalExpression) => {
        // Logical operators are always post-filters
        // They combine multiple conditions, can't push into index
        postFilters.push(expr);
      },
      visitUnary: (expr: UnaryExpression) => {
        // Unary operators (not) are always post-filters
        postFilters.push(expr);
      },
    };

    expression.accept(visitor);

    return { indexFilters, postFilters };
  }
}
