import path from 'node:path';
import { generateMeta, getConvexConfig } from './codegen.js';

const outputDir = process.env.BETTER_CONVEX_OUTPUT_DIR || undefined;
const debug = process.env.BETTER_CONVEX_DEBUG === '1';
const { functionsDir } = getConvexConfig(outputDir);
const watchFile = path.join(functionsDir, '_generated', 'api.d.ts');

import('chokidar').then(({ watch }) => {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  watch(watchFile, { ignoreInitial: true })
    .on('change', () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        generateMeta(outputDir, { debug, silent: true });
      }, 100);
    })
    .on('error', (err) => console.error('Watch error:', err));
});
