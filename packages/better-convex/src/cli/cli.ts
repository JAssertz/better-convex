import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import { generateMeta } from './codegen.js';
import { syncEnv } from './env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve real convex CLI binary
// Can't use require.resolve('convex/bin/main.js') because it's not exported
// Use the path relative to the convex package
const require = createRequire(import.meta.url);
const convexPkg = require.resolve('convex/package.json');
const realConvex = join(dirname(convexPkg), 'bin/main.js');

// Parse args: better-convex [command] [--meta <dir>] [--debug] [...convex-args]
const args = process.argv.slice(2);
const command = args[0] || 'dev';
const restArgs = args.slice(1);

// Extract better-convex specific flags
const debug = args.includes('--debug');
const metaIndex = restArgs.indexOf('--meta');
const outputDir = metaIndex >= 0 ? restArgs[metaIndex + 1] : undefined;

// Args to pass to convex CLI (filter out better-convex specific ones)
const convexArgs = restArgs.filter((a, i) => {
  if (a === '--debug') return false;
  if (a === '--meta') return false;
  if (metaIndex >= 0 && i === metaIndex + 1) return false; // --meta value
  return true;
});

// Track child processes for cleanup
const processes: any[] = [];

function cleanup() {
  for (const proc of processes) {
    if (proc && !proc.killed) {
      proc.kill('SIGTERM');
    }
  }
}

async function main() {
  if (command === 'dev') {
    // Initial codegen
    await generateMeta(outputDir, { debug });

    // Spawn watcher as child process
    const isTs = __filename.endsWith('.ts');
    const watcherPath = isTs
      ? join(__dirname, 'watcher.ts')
      : join(__dirname, 'watcher.cjs');
    const runtime = isTs ? 'bun' : process.execPath;

    const watcherProcess = execa(runtime, [watcherPath], {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: {
        ...process.env,
        BETTER_CONVEX_OUTPUT_DIR: outputDir || '',
        BETTER_CONVEX_DEBUG: debug ? '1' : '',
      },
    });
    processes.push(watcherProcess);

    // Spawn real convex dev
    const convexProcess = execa('node', [realConvex, 'dev', ...convexArgs], {
      stdio: 'inherit',
      cwd: process.cwd(),
      reject: false, // Don't throw on non-zero exit
    });
    processes.push(convexProcess);

    // Setup cleanup handlers
    process.on('exit', cleanup);
    process.on('SIGINT', () => {
      cleanup();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      cleanup();
      process.exit(0);
    });

    // Wait for either to exit, then cleanup
    const result = await Promise.race([
      watcherProcess.catch(() => ({ exitCode: 1 })),
      convexProcess,
    ]);
    cleanup();
    process.exit(result.exitCode ?? 0);
  } else if (command === 'codegen') {
    // Run better-convex codegen first
    await generateMeta(outputDir, { debug });

    // Then run real convex codegen
    await execa('node', [realConvex, 'codegen', ...convexArgs], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
  } else if (command === 'env') {
    const subcommand = convexArgs[0];

    if (subcommand === 'sync') {
      // better-convex env sync [--auth] [--force] [--prod]
      const auth = restArgs.includes('--auth');
      const force = restArgs.includes('--force');
      const prod = restArgs.includes('--prod');
      await syncEnv({ auth, force, prod });
    } else {
      // Pass through to convex env (list, get, set, remove)
      const result = await execa('node', [realConvex, 'env', ...convexArgs], {
        stdio: 'inherit',
        cwd: process.cwd(),
        reject: false,
      });
      process.exit(result.exitCode);
    }
  } else {
    // Pass through to real convex CLI
    const result = await execa('node', [realConvex, command, ...restArgs], {
      stdio: 'inherit',
      cwd: process.cwd(),
      reject: false,
    });
    process.exit(result.exitCode);
  }
}

main().catch((error) => {
  cleanup();
  console.error('Error:', error);
  process.exit(1);
});
