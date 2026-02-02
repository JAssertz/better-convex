/**
 * Schema extraction algorithm for relations
 *
 * Converts relation definitions into EdgeMetadata for M3 query builder
 * Uses Drizzle's O(n) buffering pattern for forward references
 */

import type { Relation, Relations } from './relations';
import { One } from './relations';
import { Columns, Relations as RelationsSymbol, TableName } from './symbols';
import type { ConvexTable } from './table';

/**
 * M2-M3 CONTRACT: EdgeMetadata interface
 * Consumed by M3 query builder for relation traversal
 */
export interface EdgeMetadata {
  /** Source table name */
  sourceTable: string;
  /** Edge/relation name */
  edgeName: string;
  /** Target/referenced table name */
  targetTable: string;
  /** Cardinality: one-to-one/many-to-one or one-to-many */
  cardinality: 'one' | 'many';
  /** Field name in source table (e.g., 'userId' for 'user' relation) */
  fieldName: string;
  /** Inverse edge if bidirectional relation */
  inverseEdge?: EdgeMetadata;
  /** Index name for efficient lookups */
  indexName: string;
  /** Index fields for compound indexes */
  indexFields: string[];
  /** Cascade deletion behavior */
  onDelete?: 'cascade' | 'setNull' | 'restrict';
  /** Whether the relation is optional (nullable) */
  optional: boolean;
  /** Relation name for disambiguation */
  relationName?: string;
}

/**
 * Extract relations configuration from schema
 * Drizzle's O(n) buffering pattern
 *
 * @param schema - Object containing tables and relations
 * @returns Array of EdgeMetadata for all relations
 */
export function extractRelationsConfig(
  schema: Record<string, unknown>
): EdgeMetadata[] {
  const edgeMetadata: EdgeMetadata[] = [];
  const tableNames = new Set<string>();

  // Build table name set for validation
  for (const [, value] of Object.entries(schema)) {
    if (isConvexTable(value)) {
      tableNames.add(value.tableName);
    }
  }

  // Phase 1: Extract all relation definitions + validate
  for (const [, value] of Object.entries(schema)) {
    if (isRelations(value)) {
      const relations = value;
      const sourceTableName = relations.table.tableName;
      const relationsConfig = relations[RelationsSymbol];

      for (const [relationName, relationValue] of Object.entries(
        relationsConfig
      )) {
        const relation = relationValue as Relation<any>;
        const targetTableName = relation.referencedTable[TableName];

        // SECURITY: Validate target table exists
        if (!tableNames.has(targetTableName)) {
          throw new Error(
            `Relation ${sourceTableName}.${relationName} references undefined table '${targetTableName}'`
          );
        }

        // Infer field name from relation name or config
        const fieldName = inferFieldName(relation, relationName);

        // DATA INTEGRITY: Validate field exists for one() relations
        if (isOne(relation)) {
          validateFieldExists(relation.sourceTable, fieldName, targetTableName);
        }

        const edge: EdgeMetadata = {
          sourceTable: sourceTableName,
          edgeName: relationName,
          targetTable: targetTableName,
          cardinality: isOne(relation) ? 'one' : 'many',
          fieldName,
          indexName: `${fieldName}_idx`,
          indexFields: [fieldName, '_creationTime'],
          onDelete: isOne(relation)
            ? (relation.config?.onDelete ?? 'restrict')
            : undefined,
          optional: isOne(relation)
            ? (relation.config?.optional ?? true)
            : true,
          relationName: relation.relationName,
        };

        edgeMetadata.push(edge);
      }
    }
  }

  // Phase 2: Detect inverse relations (O(n) with hash map)
  detectInverseRelations(edgeMetadata);

  // Phase 3: Validate circular dependencies
  detectCircularDependencies(edgeMetadata);

  return edgeMetadata;
}

/**
 * Detect and link inverse relations
 * Drizzle's pattern: relationName matching OR source/target matching
 * Optimized with O(n) hash map indexing
 */
function detectInverseRelations(edges: EdgeMetadata[]): void {
  // Build table → edges index for O(1) lookup
  const edgesByTable = new Map<string, EdgeMetadata[]>();

  for (const edge of edges) {
    const bucket = edgesByTable.get(edge.sourceTable) ?? [];
    bucket.push(edge);
    edgesByTable.set(edge.sourceTable, bucket);
  }

  // For each edge, search for inverse in target table
  for (const edge of edges) {
    if (edge.inverseEdge) continue; // Already linked

    const targetTableEdges = edgesByTable.get(edge.targetTable) ?? [];

    // DRIZZLE MATCHING LOGIC: relationName OR source/target match
    const reverseRelations = targetTableEdges.filter(
      (candidate) =>
        // Don't match with self
        candidate !== edge &&
        // Match 1: Both have relationName and they match
        ((edge.relationName && candidate.relationName === edge.relationName) ||
          // Match 2: No relationName, just source→target match
          (!edge.relationName && candidate.targetTable === edge.sourceTable))
    );

    // Validation: multiple matches require relationName
    if (reverseRelations.length > 1) {
      throw new Error(
        `Multiple relations found from "${edge.targetTable}" to "${edge.sourceTable}". ` +
          `Add relationName to "${edge.sourceTable}.${edge.edgeName}" to disambiguate.`
      );
    }

    // Link inverse if found (one-sided relations are valid)
    if (reverseRelations.length === 1) {
      const inverse = reverseRelations[0];

      // DATA INTEGRITY: Validate cardinality compatibility
      const validPairing =
        (edge.cardinality === 'one' && inverse.cardinality === 'many') ||
        (edge.cardinality === 'many' && inverse.cardinality === 'one') ||
        (edge.cardinality === 'one' && inverse.cardinality === 'one');

      if (!validPairing) {
        throw new Error(
          `Invalid cardinality: ${edge.sourceTable}.${edge.edgeName} (${edge.cardinality}) ` +
            `cannot pair with ${inverse.sourceTable}.${inverse.edgeName} (${inverse.cardinality}). ` +
            'Valid: one↔many, one↔one. many↔many not supported in M2.'
        );
      }

      edge.inverseEdge = inverse;
      inverse.inverseEdge = edge;
    }
  }
}

/**
 * Detect circular dependencies in relation graph
 * Uses DFS to find cycles
 * IMPORTANT: Only checks one() relations (foreign keys), not many() relations
 */
function detectCircularDependencies(edges: EdgeMetadata[]): void {
  const graph = new Map<string, Set<string>>();

  // Build adjacency list - only for one() relations (actual foreign keys)
  for (const edge of edges) {
    if (edge.cardinality === 'one') {
      if (!graph.has(edge.sourceTable)) {
        graph.set(edge.sourceTable, new Set());
      }
      graph.get(edge.sourceTable)!.add(edge.targetTable);
    }
  }

  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function hasCycle(node: string): boolean {
    visited.add(node);
    recursionStack.add(node);

    const neighbors = graph.get(node) || new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (hasCycle(neighbor)) return true;
      } else if (recursionStack.has(neighbor)) {
        return true;
      }
    }

    recursionStack.delete(node);
    return false;
  }

  for (const table of graph.keys()) {
    if (!visited.has(table) && hasCycle(table)) {
      throw new Error(
        'Circular dependency detected in relations. ' +
          'Use optional fields to break cycles.'
      );
    }
  }
}

/**
 * Infer field name from relation config or relation name
 */
function inferFieldName(relation: Relation<any>, relationName: string): string {
  if (isOne(relation) && relation.config?.fields?.[0]) {
    return relation.config.fields[0];
  }
  // Convention: relationName + 'Id'
  return `${relationName}Id`;
}

/**
 * Validate that field exists in table schema
 */
function validateFieldExists(
  table: ConvexTable<any>,
  fieldName: string,
  targetTable: string
): void {
  const columns = table[Columns];

  if (!(fieldName in columns)) {
    throw new Error(
      `Field '${fieldName}' does not exist in table schema. ` +
        `Add field with v.id('${targetTable}') or use explicit fields config.`
    );
  }

  // TODO: Validate field type is v.id(targetTable)
}

/**
 * Type guard for ConvexTable
 */
function isConvexTable(value: unknown): value is ConvexTable<any> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'tableName' in value &&
    typeof (value as any).tableName === 'string'
  );
}

/**
 * Type guard for Relations
 */
function isRelations(value: unknown): value is Relations<any, any> {
  return (
    typeof value === 'object' &&
    value !== null &&
    RelationsSymbol in value &&
    'table' in value
  );
}

/**
 * Type guard for One relation
 */
function isOne(relation: Relation<any>): relation is One<any, any> {
  return relation instanceof One;
}
