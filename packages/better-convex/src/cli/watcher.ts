import path from 'node:path';
import { generateMeta, getConvexConfig } from './codegen.js';

const outputDir = process.env.BETTER_CONVEX_OUTPUT_DIR || undefined;
const debug = process.env.BETTER_CONVEX_DEBUG === '1';
const { functionsDir } = getConvexConfig(outputDir);

// Watch api.d.ts, http.ts, and routers/**/*.ts for HTTP route changes
// Note: routers/ is sibling to functions/, not inside it
const convexDir = path.dirname(functionsDir);
const watchPatterns = [
  path.join(functionsDir, '_generated', 'api.d.ts'),
  path.join(functionsDir, 'http.ts'),
  path.join(convexDir, 'routers', '**', '*.ts'),
];

import('chokidar').then(({ watch }) => {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  watch(watchPatterns, { ignoreInitial: true })
    .on('change', () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        generateMeta(outputDir, { debug, silent: true });
      }, 100);
    })
    .on('error', (err) => console.error('Watch error:', err));
});
