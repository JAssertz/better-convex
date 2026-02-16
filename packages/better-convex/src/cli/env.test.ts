import * as childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { syncEnv } from './env';

const PROCESS_EXIT_1_RE = /process\.exit:1/;

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'better-convex-cli-'));
}

describe('cli/env', () => {
  test('syncEnv exits with 1 when convex/.env is missing', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();
    const oldExit = process.exit;
    const infoSpy = spyOn(console, 'info').mockImplementation(() => {});
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});

    process.chdir(dir);
    (process.exit as any) = (code?: number) => {
      throw new Error(`process.exit:${code}`);
    };

    try {
      await expect(syncEnv()).rejects.toThrow(PROCESS_EXIT_1_RE);
    } finally {
      process.chdir(oldCwd);
      process.exit = oldExit;
      infoSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  test('syncEnv sets only changed variables when force=false', async () => {
    const dir = mkTempDir();
    fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'convex', '.env'),
      `${['FOO=bar', 'EMPTY=', 'BAZ=qux'].join('\n')}\n`,
      'utf-8'
    );

    const oldCwd = process.cwd();

    process.chdir(dir);

    const infoSpy = spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});

    const execCalls: string[] = [];
    const execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(((
      command: string
    ) => {
      const cmd = String(command);
      execCalls.push(cmd);

      if (cmd === 'npx convex env get CONVEX_DEPLOYMENT')
        return 'dev:deployment\n';
      if (cmd === 'npx convex env get FOO') return 'bar\n';
      if (cmd === 'npx convex env get BAZ') return 'old\n';
      if (cmd === 'npx convex env set BAZ="qux"') return Buffer.alloc(0);

      // If the code tries to set anything else, we want the test to fail loudly.
      if (cmd.startsWith('npx convex env set ')) {
        throw new Error(`Unexpected set: ${cmd}`);
      }
      throw new Error(`Unexpected execSync: ${cmd}`);
    }) as any);

    try {
      await syncEnv({ force: false, auth: false, prod: false });

      expect(execCalls).toContain('npx convex env get CONVEX_DEPLOYMENT');
      expect(execCalls).toContain('npx convex env get FOO');
      expect(execCalls).toContain('npx convex env get BAZ');
      expect(execCalls).toContain('npx convex env set BAZ="qux"');

      // FOO already matches -> no set. EMPTY is skipped.
      expect(execCalls.some((c) => c === 'npx convex env set FOO="bar"')).toBe(
        false
      );
      expect(execCalls.some((c) => c === 'npx convex env get EMPTY')).toBe(
        false
      );
    } finally {
      execSyncSpy.mockRestore();
      infoSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
      process.chdir(oldCwd);
    }
  });
});
