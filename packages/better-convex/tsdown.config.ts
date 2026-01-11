import pluginBabel from '@rollup/plugin-babel';
import { defineConfig } from 'tsdown';

const babelPlugin = pluginBabel({
  babelHelpers: 'bundled',
  parserOpts: {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  },
  plugins: ['babel-plugin-react-compiler'],
  extensions: ['.js', '.jsx', '.ts', '.tsx'],
});

export default defineConfig([
  // Client builds (auth-client, react) - need "use client" directive
  {
    entry: {
      'auth-client/index': 'src/auth-client/index.ts',
      'react/index': 'src/react/index.ts',
    },
    platform: 'neutral',
    target: 'esnext',
    tsconfig: 'tooling/tsconfig.build.json',
    exports: true,
    dts: true,
    banner: "'use client';",
    plugins: [babelPlugin],
  },
  // Server-safe builds (crpc, rsc, server) - no "use client"
  {
    entry: {
      'auth/index': 'src/auth/index.ts',
      'auth-nextjs/index': 'src/auth-nextjs/index.ts',
      'crpc/index': 'src/crpc/index.ts',
      'rsc/index': 'src/rsc/index.ts',
      'server/index': 'src/server/index.ts',
    },
    platform: 'neutral',
    target: 'esnext',
    tsconfig: 'tooling/tsconfig.build.json',
    exports: true,
    dts: true,
  },
  // CLI builds (CJS) - skip bundling node_modules like tsup
  {
    entry: ['src/cli/cli.ts', 'src/cli/watcher.ts'],
    format: 'cjs',
    platform: 'node',
    target: 'esnext',
    tsconfig: 'tooling/tsconfig.build.json',
    shims: true,
    skipNodeModulesBundle: true,
    banner: '#!/usr/bin/env node',
  },
]);
