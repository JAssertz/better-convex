import fs from 'node:fs';
import path from 'node:path';
import { createJiti } from 'jiti';

/**
 * Generate meta.ts with metadata for all Convex functions.
 * Uses runtime imports to extract _crpcMeta from CRPC functions.
 */

type FnMeta = Record<string, unknown>;
type ModuleMeta = Record<string, FnMeta>;
type Meta = Record<string, ModuleMeta>;

/** HTTP route info from _crpcHttpRoute */
type HttpRoute = { path: string; method: string };
type HttpRoutes = Record<string, HttpRoute>;

/** Valid JS identifier pattern for object keys */
const VALID_IDENTIFIER_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/** CRPC metadata attached to functions at runtime */
type CRPCMeta = {
  type: 'query' | 'mutation' | 'action';
  internal?: boolean;
  auth?: 'optional' | 'required';
  [key: string]: unknown;
};

export function getConvexConfig(outputDir?: string): {
  functionsDir: string;
  outputFile: string;
} {
  const convexConfigPath = path.join(process.cwd(), 'convex.json');
  const convexConfig = fs.existsSync(convexConfigPath)
    ? JSON.parse(fs.readFileSync(convexConfigPath, 'utf-8'))
    : {};
  // convex.json "functions" is the path to functions dir, default is "convex"
  const functionsDir = convexConfig.functions || 'convex';
  const functionsDirPath = path.join(process.cwd(), functionsDir);

  // Default: convex/shared/meta.ts, or custom outputDir/meta.ts
  const outputFile = path.join(
    process.cwd(),
    outputDir || 'convex/shared',
    'meta.ts'
  );

  return {
    functionsDir: functionsDirPath,
    outputFile,
  };
}

/** HTTP route definition from _crpcHttpRoute */
type CRPCHttpRoute = {
  path: string;
  method: string;
};

/**
 * Check if a value is a CRPCHttpRouter (has _def.router === true)
 */
function isCRPCHttpRouter(value: unknown): value is {
  _def: {
    router: true;
    procedures: Record<string, { _crpcHttpRoute?: CRPCHttpRoute }>;
  };
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_def' in value &&
    (value as any)._def?.router === true
  );
}

/**
 * Import a module using jiti and extract CRPC metadata from exports
 */
async function parseModuleRuntime(
  filePath: string,
  jiti: ReturnType<typeof createJiti>
): Promise<{ meta: ModuleMeta | null; httpRoutes: HttpRoutes }> {
  const result: ModuleMeta = {};
  const httpRoutes: HttpRoutes = {};
  const isHttp = filePath.endsWith('http.ts');

  // Use jiti to import TypeScript files
  const module = await jiti.import(filePath);

  if (!module || typeof module !== 'object') {
    if (isHttp) {
      console.error('  http.ts: module is empty or not an object');
    }
    return { meta: null, httpRoutes: {} };
  }

  // Check each export for _crpcMeta, _crpcHttpRoute, or router
  for (const [name, value] of Object.entries(module)) {
    // Skip private exports
    if (name.startsWith('_')) continue;

    // Check if this is a CRPC function with metadata
    const meta = (value as any)?._crpcMeta as CRPCMeta | undefined;

    if (meta?.type) {
      // Skip internal functions
      if (meta.internal) continue;

      // Extract relevant metadata
      const fnMeta: FnMeta = { type: meta.type };

      if (meta.auth) {
        fnMeta.auth = meta.auth;
      }

      // Copy any additional meta properties (role, rateLimit, dev, etc.)
      for (const [key, val] of Object.entries(meta)) {
        if (key !== 'type' && key !== 'internal' && val !== undefined) {
          fnMeta[key] = val;
        }
      }

      result[name] = fnMeta;
    }

    // Check if this is an HTTP procedure with route metadata
    const httpRoute = (value as any)?._crpcHttpRoute as
      | CRPCHttpRoute
      | undefined;
    if (httpRoute?.path && httpRoute?.method) {
      httpRoutes[name] = {
        path: httpRoute.path,
        method: httpRoute.method,
      };
    }

    // Check if this is a CRPCHttpRouter with _def.procedures
    if (isCRPCHttpRouter(value)) {
      // Extract routes from router's flat procedures map
      for (const [procPath, procedure] of Object.entries(
        value._def.procedures
      )) {
        const route = procedure._crpcHttpRoute;
        if (route?.path && route?.method) {
          httpRoutes[procPath] = {
            path: route.path,
            method: route.method,
          };
        }
      }
    }
  }

  return {
    meta: Object.keys(result).length > 0 ? result : null,
    httpRoutes,
  };
}

export async function generateMeta(
  outputDir?: string,
  options?: { debug?: boolean; silent?: boolean }
): Promise<void> {
  const startTime = Date.now();
  const { functionsDir, outputFile } = getConvexConfig(outputDir);
  const debug = options?.debug ?? false;
  const silent = options?.silent ?? false;

  if (debug) {
    console.info('🔍 Scanning Convex functions for metadata...\n');
  }

  // Create jiti instance for importing TypeScript files
  const jiti = createJiti(process.cwd(), {
    interopDefault: true,
    moduleCache: false,
  });

  const meta: Meta = {};
  const allHttpRoutes: HttpRoutes = {};
  let totalFunctions = 0;

  // Get all .ts files in functions directory (not subdirs, not _generated)
  const files = fs
    .readdirSync(functionsDir)
    .filter(
      (file) =>
        file.endsWith('.ts') &&
        !file.startsWith('_') &&
        !['schema.ts', 'convex.config.ts', 'auth.config.ts'].includes(file)
    );

  for (const file of files) {
    const filePath = path.join(functionsDir, file);
    const moduleName = file.replace('.ts', '');

    try {
      const { meta: moduleMeta, httpRoutes } = await parseModuleRuntime(
        filePath,
        jiti
      );

      if (moduleMeta) {
        meta[moduleName] = moduleMeta;
        const fnCount = Object.keys(moduleMeta).length;
        totalFunctions += fnCount;
        if (debug) {
          console.info(`  ✓ ${moduleName}: ${fnCount} functions`);
        }
      }

      // Merge HTTP routes
      if (Object.keys(httpRoutes).length > 0 && debug) {
        console.info(
          `  ✓ ${moduleName}: ${Object.keys(httpRoutes).length} HTTP routes`
        );
      }
      Object.assign(allHttpRoutes, httpRoutes);
    } catch (error) {
      // Always log http.ts errors as they contain critical HTTP routes
      if (debug || file === 'http.ts') {
        console.error(`  ⚠ Failed to parse ${file}:`, error);
      }
    }
  }

  // Generate output with proper formatting for objects
  const metaEntries = Object.entries(meta)
    .map(([module, fns]) => {
      const fnEntries = Object.entries(fns)
        .map(([fn, fnMeta]) => {
          const metaProps: string[] = [];
          // All properties alphabetically
          for (const [key, value] of Object.entries(fnMeta).sort()) {
            if (value === undefined) continue;
            if (typeof value === 'string') {
              metaProps.push(`${key}: '${value}'`);
            } else if (typeof value === 'boolean') {
              metaProps.push(`${key}: ${value}`);
            } else if (typeof value === 'number') {
              metaProps.push(`${key}: ${value}`);
            }
          }
          const metaStr = `{ ${metaProps.join(', ')} }`;
          return `    ${fn}: ${metaStr}`;
        })
        .join(',\n');
      return `  ${module}: {\n${fnEntries},\n  }`;
    })
    .join(',\n');

  const metaContent = metaEntries ? `\n${metaEntries},\n` : '';

  // Dedupe HTTP routes: prefer nested paths (todos.get) over flat (get)
  // by keeping only routes where no other route has same path with longer key
  const routesByPath = new Map<string, { key: string; route: HttpRoute }[]>();
  for (const [key, route] of Object.entries(allHttpRoutes)) {
    const pathKey = `${route.path}:${route.method}`;
    const existing = routesByPath.get(pathKey) || [];
    existing.push({ key, route });
    routesByPath.set(pathKey, existing);
  }

  // Keep only the longest key for each path (nested paths are longer)
  const dedupedRoutes: Record<string, HttpRoute> = {};
  for (const entries of routesByPath.values()) {
    const best = entries.reduce((a, b) =>
      a.key.length >= b.key.length ? a : b
    );
    dedupedRoutes[best.key] = best.route;
  }

  // Helper: quote key if needed (contains dots, spaces, reserved words, etc.)
  const formatKey = (key: string) =>
    VALID_IDENTIFIER_RE.test(key) ? key : `'${key}'`;

  // Generate _http entries (merged into meta)
  const httpEntries = Object.entries(dedupedRoutes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([name, route]) =>
        `    ${formatKey(name)}: { path: '${route.path}', method: '${route.method}' }`
    )
    .join(',\n');
  const httpContent = httpEntries ? `\n${httpEntries},\n  ` : '';

  // Add _http to meta content
  const fullMetaContent = metaContent
    ? `${metaContent}  _http: {${httpContent}},\n`
    : `\n  _http: {${httpContent}},\n`;

  const output = `// biome-ignore-all format: generated
// This file is auto-generated by better-convex
// Do not edit manually. Run \`better-convex codegen\` to regenerate.

export const meta = {${fullMetaContent}} as const;

export type Meta = typeof meta;
`;

  // Ensure _meta directory exists
  const metaDir = path.dirname(outputFile);

  if (!fs.existsSync(metaDir)) {
    fs.mkdirSync(metaDir, { recursive: true });
  }

  fs.writeFileSync(outputFile, output);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  const time = new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  if (!silent) {
    if (debug) {
      console.info(`\n✅ Generated ${outputFile}`);
      console.info(
        `   ${Object.keys(meta).length} modules, ${totalFunctions} functions`
      );
    } else {
      console.info(`✔ ${time} Convex meta ready! (${elapsed}s)`);
    }
  }
}
