import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { generateMeta, getConvexConfig } from './codegen';

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'better-convex-codegen-'));
}

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

describe('cli/codegen', () => {
  test('getConvexConfig uses defaults when convex.json is missing', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      const cwd = process.cwd();
      const cfg = getConvexConfig();
      expect(cfg).toEqual({
        functionsDir: path.join(cwd, 'convex'),
        outputFile: path.join(cwd, 'convex', 'shared', 'meta.ts'),
      });
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('getConvexConfig respects convex.json functions dir and outputDir override', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeFile(
      path.join(dir, 'convex.json'),
      JSON.stringify({ functions: 'fn' })
    );

    process.chdir(dir);
    try {
      const cwd = process.cwd();
      const cfg = getConvexConfig('out/meta');
      expect(cfg).toEqual({
        functionsDir: path.join(cwd, 'fn'),
        outputFile: path.join(cwd, 'out', 'meta', 'meta.ts'),
      });
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta extracts _crpcMeta and _crpcHttpRoute, skips private/internal, and dedupes _http routes', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      // Functions (Convex default).
      writeFile(
        path.join(dir, 'convex', 'items', 'queries.ts'),
        `
        export const list = {
          _crpcMeta: {
            type: 'query',
            auth: 'optional',
            role: 'admin',
            rateLimit: 10,
            dev: true,
            nested: { a: 1 },
          },
        };

        export const internalOnly = { _crpcMeta: { type: 'query', internal: true } };
        export const _private = { _crpcMeta: { type: 'query', auth: 'required' } };

        export function __cov() {
          return 1;
        }
        __cov();
        `.trim()
      );

      writeFile(
        path.join(dir, 'convex', 'posts.ts'),
        `
        export const create = { _crpcMeta: { type: 'mutation' } };

        export function __cov() {
          return 1;
        }
        __cov();
        `.trim()
      );

      // Excluded by isValidConvexFile.
      writeFile(
        path.join(dir, 'convex', 'schema.ts'),
        `export const shouldNotAppear = { _crpcMeta: { type: 'query' } };`
      );
      // Excluded by private file/dir rule.
      writeFile(
        path.join(dir, 'convex', '_private.ts'),
        `export const shouldNotAppear = { _crpcMeta: { type: 'query' } };`
      );
      writeFile(
        path.join(dir, 'convex', '_generated', 'api.ts'),
        `export const shouldNotAppear = { _crpcMeta: { type: 'query' } };`
      );

      // HTTP routes: export-level + router-level with duplicate route keys.
      writeFile(
        path.join(dir, 'convex', 'http.ts'),
        `
        export const get = {
          _crpcHttpRoute: { path: '/api/todos/:id', method: 'GET' },
        };

        export function __cov() {
          return 1;
        }
        __cov();
        `.trim()
      );

      writeFile(
        path.join(dir, 'convex', 'routers', 'todos.ts'),
        `
        export const router = {
          _def: {
            router: true,
            procedures: {
              // Duplicate of todos.get (same route path+method) - should be deduped away.
              get: { _crpcHttpRoute: { path: '/api/todos/:id', method: 'GET' } },
              'todos.get': { _crpcHttpRoute: { path: '/api/todos/:id', method: 'GET' } },
              'todos.create': { _crpcHttpRoute: { path: '/api/todos', method: 'POST' } },
            },
          },
        };

        export function __cov() {
          return 1;
        }
        __cov();
        `.trim()
      );

      await generateMeta(undefined, { silent: true });

      const { outputFile } = getConvexConfig();
      expect(fs.existsSync(outputFile)).toBe(true);

      const module = await import(pathToFileURL(outputFile).href);
      expect(module).toHaveProperty('meta');

      const meta = module.meta as any;

      // Module keys are file paths without ".ts". Nested modules are joined with "/".
      expect(meta).toHaveProperty(['items/queries']);
      expect(meta['items/queries'].list).toEqual({
        auth: 'optional',
        dev: true,
        rateLimit: 10,
        role: 'admin',
        type: 'query',
      });
      expect(meta['items/queries']).not.toHaveProperty('internalOnly');
      expect(meta['items/queries']).not.toHaveProperty('_private');

      expect(meta.posts.create).toEqual({ type: 'mutation' });

      // Excluded files should not appear.
      expect(meta).not.toHaveProperty('schema');
      expect(meta).not.toHaveProperty('_private');
      expect(meta).not.toHaveProperty('_generated');

      // HTTP route map is always present and should prefer longer/nested keys.
      expect(meta._http['todos.get']).toEqual({
        path: '/api/todos/:id',
        method: 'GET',
      });
      expect(meta._http['todos.create']).toEqual({
        path: '/api/todos',
        method: 'POST',
      });
      expect(meta._http).not.toHaveProperty('get');
    } finally {
      process.chdir(oldCwd);
    }
  });
});
