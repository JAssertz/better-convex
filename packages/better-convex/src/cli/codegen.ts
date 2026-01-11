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

/**
 * Import a module using jiti and extract CRPC metadata from exports
 */
async function parseModuleRuntime(
  filePath: string,
  jiti: ReturnType<typeof createJiti>
): Promise<ModuleMeta | null> {
  const result: ModuleMeta = {};

  // Use jiti to import TypeScript files
  const module = await jiti.import(filePath);

  if (!module || typeof module !== 'object') {
    return null;
  }

  // Check each export for _crpcMeta
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
  }

  return Object.keys(result).length > 0 ? result : null;
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
  let totalFunctions = 0;

  // Get all .ts files in functions directory (not subdirs, not _generated)
  const files = fs
    .readdirSync(functionsDir)
    .filter(
      (file) =>
        file.endsWith('.ts') &&
        !file.startsWith('_') &&
        ![
          'schema.ts',
          'convex.config.ts',
          'auth.config.ts',
          'http.ts',
        ].includes(file)
    );

  for (const file of files) {
    const filePath = path.join(functionsDir, file);
    const moduleName = file.replace('.ts', '');

    try {
      const moduleMeta = await parseModuleRuntime(filePath, jiti);

      if (moduleMeta) {
        meta[moduleName] = moduleMeta;
        const fnCount = Object.keys(moduleMeta).length;
        totalFunctions += fnCount;
        if (debug) {
          console.info(`  ✓ ${moduleName}: ${fnCount} functions`);
        }
      }
    } catch (error) {
      if (debug) {
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
  const output = `// biome-ignore-all format: generated
// This file is auto-generated by better-convex
// Do not edit manually. Run \`better-convex codegen\` to regenerate.

export const meta = {${metaContent}} as const;

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
