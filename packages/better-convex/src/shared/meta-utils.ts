/**
 * Shared utilities for meta lookup and file filtering.
 * Used by codegen and runtime proxies.
 */

import type { FunctionReference } from 'convex/server';

/** Metadata for a single function */
export type FnMeta = {
  type?: 'query' | 'mutation' | 'action';
  [key: string]: unknown;
};

/** Metadata for all functions in a module */
export type ModuleMeta = Record<string, FnMeta>;

/** Metadata for all modules - from generated `@convex/meta` */
export type Meta = Record<string, ModuleMeta>;

/** Files to exclude from meta generation */
const EXCLUDED_FILES = new Set([
  'schema.ts',
  'convex.config.ts',
  'auth.config.ts',
]);

/**
 * Check if a file path should be included in meta generation.
 * Filters out private files/directories (prefixed with _) and config files.
 */
export function isValidConvexFile(file: string): boolean {
  // Skip private files/directories (prefixed with _)
  if (file.startsWith('_') || file.includes('/_')) return false;

  // Skip known config files
  const basename = file.split('/').pop() ?? '';
  if (EXCLUDED_FILES.has(basename)) return false;

  return true;
}

/**
 * Get a function reference from the API object by traversing the path.
 */
export function getFuncRef(
  api: Record<string, unknown>,
  path: string[]
): FunctionReference<'query' | 'mutation' | 'action'> {
  let current: unknown = api;

  for (const key of path) {
    if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[key];
    } else {
      throw new Error(`Invalid path: ${path.join('.')}`);
    }
  }

  return current as FunctionReference<'query' | 'mutation' | 'action'>;
}

/**
 * Get function type from meta using path.
 * Supports nested paths like ['items', 'queries', 'list'] → namespace='items/queries', fn='list'
 *
 * @param path - Path segments like ['todos', 'create'] or ['items', 'queries', 'list']
 * @param meta - The meta object from codegen
 * @returns Function type or 'query' as default
 */
export function getFunctionType(
  path: string[],
  meta: Meta
): 'query' | 'mutation' | 'action' {
  if (path.length < 2) return 'query';

  // Last segment is function name, rest is namespace joined by '/'
  const fnName = path.at(-1)!;
  const namespace = path.slice(0, -1).join('/');

  const fnType = meta[namespace]?.[fnName]?.type;
  if (fnType === 'query' || fnType === 'mutation' || fnType === 'action') {
    return fnType;
  }

  return 'query';
}

/**
 * Get function metadata from meta using path.
 * Supports nested paths like ['items', 'queries', 'list'] → namespace='items/queries', fn='list'
 *
 * @param path - Path segments like ['todos', 'create'] or ['items', 'queries', 'list']
 * @param meta - The meta object from codegen
 * @returns Function metadata or undefined
 */
export function getFunctionMeta(
  path: string[],
  meta: Meta
): FnMeta | undefined {
  if (path.length < 2) return;

  const fnName = path.at(-1)!;
  const namespace = path.slice(0, -1).join('/');

  return meta[namespace]?.[fnName];
}
