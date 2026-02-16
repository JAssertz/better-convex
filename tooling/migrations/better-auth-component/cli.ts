import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { migrateSnapshot } from './migrate-snapshot';
import { unzipArchive, zipDirectory } from './zip';

type CliOptions = {
  filters: string[];
  outputZipPath: string;
  snapshotZipPath: string;
  workDirectoryPath: string;
};

const parseCliOptions = (): CliOptions => {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    options: {
      filters: {
        type: 'string',
        default: '',
      },
      outputZip: {
        type: 'string',
        default: path.resolve(process.cwd(), 'migration.zip'),
      },
      snapshotZip: {
        type: 'string',
        default: path.resolve(process.cwd(), 'snapshot.zip'),
      },
      workDir: {
        type: 'string',
        default: path.join(os.tmpdir(), 'better-auth-component-migration'),
      },
    },
    strict: true,
  });

  return {
    filters: parsed.values.filters
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    outputZipPath: path.resolve(parsed.values.outputZip),
    snapshotZipPath: path.resolve(parsed.values.snapshotZip),
    workDirectoryPath: path.resolve(parsed.values.workDir),
  };
};

const main = async (): Promise<void> => {
  const options = parseCliOptions();

  if (!fs.existsSync(options.snapshotZipPath)) {
    throw new Error(
      `Snapshot zip not found: ${options.snapshotZipPath}. Export your backup first.`
    );
  }

  await fsPromises.rm(options.workDirectoryPath, {
    force: true,
    recursive: true,
  });
  await fsPromises.mkdir(options.workDirectoryPath, { recursive: true });

  const snapshotDirectoryPath = path.join(
    options.workDirectoryPath,
    'snapshot'
  );

  await unzipArchive({
    destinationDirectoryPath: snapshotDirectoryPath,
    sourceZipPath: options.snapshotZipPath,
  });

  const stats = await migrateSnapshot({
    filters: options.filters,
    snapshotDirPath: snapshotDirectoryPath,
  });

  await zipDirectory({
    destinationZipPath: options.outputZipPath,
    sourceDirectoryPath: snapshotDirectoryPath,
  });

  const filterText =
    options.filters.length === 0 ? '(all tables)' : options.filters.join(', ');

  console.info('Better Auth component migration complete.');
  console.info(`Tables migrated: ${filterText}`);
  console.info(`IDs rewritten: ${stats.idsRewritten}`);
  console.info(`Files updated: ${stats.filesUpdated}`);
  console.info(`String replacements applied: ${stats.replacementsApplied}`);
  console.info(`Output zip: ${options.outputZipPath}`);
  console.warn(
    'IMPORTANT: this will replace all your data with updated Better Auth IDs.'
  );
  console.info(
    `Run manually: npx convex import "${options.outputZipPath}" --replace -y`
  );
};

main().catch((error) => {
  console.error('Migration failed.');
  console.error(error);
  process.exitCode = 1;
});
