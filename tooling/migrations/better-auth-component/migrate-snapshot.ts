import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

import { remapDeveloperDocumentIdTable } from './id-v6';

type SnapshotTable = {
  id: number;
  name: string;
};

export type MigrateSnapshotOptions = {
  filters?: string[];
  snapshotDirPath: string;
};

export type MigrateSnapshotStats = {
  filesUpdated: number;
  idsRewritten: number;
  replacementsApplied: number;
  tablesTouched: string[];
};

const parseJsonlFile = async (filePath: string): Promise<Record<string, unknown>[]> => {
  const content = await fsPromises.readFile(filePath, 'utf8');

  return content
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as Record<string, unknown>);
};

const writeJsonlFile = async (
  filePath: string,
  rows: Record<string, unknown>[],
): Promise<void> => {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  const content = rows.map(row => JSON.stringify(row)).join('\n');
  await fsPromises.writeFile(filePath, `${content}\n`, 'utf8');
};

const toTableMap = (rows: Record<string, unknown>[]): Map<string, number> => {
  const tableMap = new Map<string, number>();

  for (const row of rows) {
    const name = row.name;
    const id = row.id;

    if (typeof name !== 'string' || typeof id !== 'number') {
      continue;
    }

    tableMap.set(name, id);
  }

  return tableMap;
};

const toComponentTables = (rows: Record<string, unknown>[]): SnapshotTable[] => {
  const tables: SnapshotTable[] = [];

  for (const row of rows) {
    const name = row.name;
    const id = row.id;

    if (typeof name !== 'string' || typeof id !== 'number') {
      continue;
    }

    tables.push({ id, name });
  }

  return tables;
};

const countOccurrences = (haystack: string, needle: string): number => {
  if (needle.length === 0) {
    return 0;
  }

  let count = 0;
  let index = 0;

  while (true) {
    const found = haystack.indexOf(needle, index);
    if (found === -1) {
      break;
    }

    count += 1;
    index = found + needle.length;
  }

  return count;
};

const isInsideDirectory = (candidatePath: string, directoryPath: string): boolean => {
  const relativePath = path.relative(directoryPath, candidatePath);
  if (relativePath === '') {
    return true;
  }

  return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
};

const replaceInFiles = async ({
  directoryPath,
  excludedPaths,
  replacements,
}: {
  directoryPath: string;
  excludedPaths: string[];
  replacements: Map<string, string>;
}): Promise<{ filesUpdated: number; replacementsApplied: number }> => {
  let filesUpdated = 0;
  let replacementsApplied = 0;

  const walk = async (currentPath: string): Promise<void> => {
    if (excludedPaths.some(excludedPath => isInsideDirectory(currentPath, excludedPath))) {
      return;
    }

    const entries = await fsPromises.readdir(currentPath, { withFileTypes: true });

    await Promise.all(
      entries.map(async entry => {
        const fullPath = path.join(currentPath, entry.name);

        if (excludedPaths.some(excludedPath => isInsideDirectory(fullPath, excludedPath))) {
          return;
        }

        if (entry.isDirectory()) {
          await walk(fullPath);
          return;
        }

        if (!entry.isFile()) {
          return;
        }

        const content = await fsPromises.readFile(fullPath, 'utf8');

        let updatedContent = content;
        let fileReplacements = 0;

        for (const [from, to] of replacements.entries()) {
          const matches = countOccurrences(updatedContent, from);
          if (matches === 0) {
            continue;
          }

          updatedContent = updatedContent.replaceAll(from, to);
          fileReplacements += matches;
        }

        if (fileReplacements > 0) {
          filesUpdated += 1;
          replacementsApplied += fileReplacements;
          await fsPromises.writeFile(fullPath, updatedContent, 'utf8');
        }
      }),
    );
  };

  await walk(directoryPath);

  return {
    filesUpdated,
    replacementsApplied,
  };
};

const ensureFileExists = (filePath: string, label: string): void => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
};

export const migrateSnapshot = async ({
  filters = [],
  snapshotDirPath,
}: MigrateSnapshotOptions): Promise<MigrateSnapshotStats> => {
  const resolvedSnapshotPath = path.resolve(snapshotDirPath);
  const betterAuthComponentDirPath = path.join(
    resolvedSnapshotPath,
    '_components',
    'betterAuth',
  );

  const appTablesPath = path.join(resolvedSnapshotPath, '_tables', 'documents.jsonl');
  const componentTablesPath = path.join(
    betterAuthComponentDirPath,
    '_tables',
    'documents.jsonl',
  );

  ensureFileExists(appTablesPath, 'app table metadata file');
  ensureFileExists(componentTablesPath, 'component table metadata file');

  const appTablesMap = toTableMap(await parseJsonlFile(appTablesPath));
  const componentTables = toComponentTables(await parseJsonlFile(componentTablesPath));

  const filterSet = new Set(
    filters
      .map(value => value.trim())
      .filter(Boolean),
  );

  const selectedTables =
    filterSet.size === 0
      ? componentTables
      : componentTables.filter(table => filterSet.has(table.name));

  const replacements = new Map<string, string>();
  const tablesTouched: string[] = [];
  let idsRewritten = 0;

  for (const componentTable of selectedTables) {
    const destinationTableId = appTablesMap.get(componentTable.name);

    if (destinationTableId === undefined) {
      throw new Error(
        `Missing destination table id for table "${componentTable.name}". Push your app schema before migration.`,
      );
    }

    const sourceRowsPath = path.join(
      betterAuthComponentDirPath,
      componentTable.name,
      'documents.jsonl',
    );

    ensureFileExists(sourceRowsPath, `component rows file for table "${componentTable.name}"`);

    const sourceRows = await parseJsonlFile(sourceRowsPath);

    const migratedRows = sourceRows.map(row => {
      const rowId = row._id;

      if (typeof rowId !== 'string') {
        return row;
      }

      const newId = remapDeveloperDocumentIdTable(rowId, destinationTableId);
      replacements.set(rowId, newId);
      idsRewritten += 1;

      return {
        ...row,
        _id: newId,
      };
    });

    const destinationRowsPath = path.join(
      resolvedSnapshotPath,
      componentTable.name,
      'documents.jsonl',
    );

    const existingRows = fs.existsSync(destinationRowsPath)
      ? await parseJsonlFile(destinationRowsPath)
      : [];

    await writeJsonlFile(destinationRowsPath, [...existingRows, ...migratedRows]);
    tablesTouched.push(componentTable.name);
  }

  const replaceStats = await replaceInFiles({
    directoryPath: resolvedSnapshotPath,
    excludedPaths: [betterAuthComponentDirPath],
    replacements,
  });

  return {
    filesUpdated: replaceStats.filesUpdated,
    idsRewritten,
    replacementsApplied: replaceStats.replacementsApplied,
    tablesTouched,
  };
};
