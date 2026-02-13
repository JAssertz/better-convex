import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { encodeDeveloperDocumentId } from './id-v6';
import { migrateSnapshot } from './migrate-snapshot';

const writeJsonl = async (filePath: string, rows: unknown[]): Promise<void> => {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  const content = rows.map((row) => JSON.stringify(row)).join('\n');
  await fsPromises.writeFile(filePath, `${content}\n`, 'utf8');
};

const readJsonl = async (
  filePath: string
): Promise<Array<Record<string, unknown>>> => {
  const content = await fsPromises.readFile(filePath, 'utf8');
  return content
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
};

const buildInternalId = (seed: number): Uint8Array => {
  const internalId = new Uint8Array(16);
  let current = seed;
  for (let index = 0; index < 16; index += 1) {
    internalId[index] = current & 0xff;
    current = (current * 131 + 17) % 256;
  }
  return internalId;
};

describe('migrateSnapshot', () => {
  let tmpDir = '';

  beforeEach(async () => {
    tmpDir = await fsPromises.mkdtemp(
      path.join(os.tmpdir(), 'better-auth-migration-test-')
    );
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('rewrites IDs outside component folder and leaves component files unchanged', async () => {
    const snapshotDirPath = path.join(tmpDir, 'snapshot');

    const oldUserId = encodeDeveloperDocumentId({
      tableNumber: 400,
      internalId: buildInternalId(10),
    });

    await writeJsonl(path.join(snapshotDirPath, '_tables', 'documents.jsonl'), [
      { name: 'user', id: 101 },
    ]);

    await writeJsonl(
      path.join(
        snapshotDirPath,
        '_components',
        'betterAuth',
        '_tables',
        'documents.jsonl'
      ),
      [{ name: 'user', id: 400 }]
    );

    await writeJsonl(
      path.join(
        snapshotDirPath,
        '_components',
        'betterAuth',
        'user',
        'documents.jsonl'
      ),
      [{ _id: oldUserId, ownerId: oldUserId }]
    );

    await writeJsonl(path.join(snapshotDirPath, 'audit', 'documents.jsonl'), [
      { _id: 'audit_1', userId: oldUserId },
    ]);

    await writeJsonl(
      path.join(
        snapshotDirPath,
        '_components',
        'betterAuth',
        'audit',
        'documents.jsonl'
      ),
      [{ _id: 'component_audit_1', userId: oldUserId }]
    );

    const stats = await migrateSnapshot({ snapshotDirPath });

    const appRows = await readJsonl(
      path.join(snapshotDirPath, 'user', 'documents.jsonl')
    );
    const appUserId = String(appRows[0]?._id);

    expect(appUserId).not.toBe(oldUserId);
    expect(stats.idsRewritten).toBe(1);
    expect(stats.tablesTouched).toEqual(['user']);

    const rootAuditRows = await readJsonl(
      path.join(snapshotDirPath, 'audit', 'documents.jsonl')
    );
    expect(rootAuditRows[0]?.userId).toBe(appUserId);

    const componentAuditRows = await readJsonl(
      path.join(
        snapshotDirPath,
        '_components',
        'betterAuth',
        'audit',
        'documents.jsonl'
      )
    );
    expect(componentAuditRows[0]?.userId).toBe(oldUserId);
  });

  test('throws when destination app table id is missing', async () => {
    const snapshotDirPath = path.join(tmpDir, 'snapshot');
    const oldSessionId = encodeDeveloperDocumentId({
      tableNumber: 900,
      internalId: buildInternalId(44),
    });

    await writeJsonl(path.join(snapshotDirPath, '_tables', 'documents.jsonl'), [
      { name: 'user', id: 101 },
    ]);

    await writeJsonl(
      path.join(
        snapshotDirPath,
        '_components',
        'betterAuth',
        '_tables',
        'documents.jsonl'
      ),
      [{ name: 'session', id: 900 }]
    );

    await writeJsonl(
      path.join(
        snapshotDirPath,
        '_components',
        'betterAuth',
        'session',
        'documents.jsonl'
      ),
      [{ _id: oldSessionId }]
    );

    await expect(migrateSnapshot({ snapshotDirPath })).rejects.toThrowError(
      /Missing destination table id for table "session"/i
    );
  });

  test('filters migrate only selected tables', async () => {
    const snapshotDirPath = path.join(tmpDir, 'snapshot');

    const oldUserId = encodeDeveloperDocumentId({
      tableNumber: 400,
      internalId: buildInternalId(9),
    });
    const oldJwksId = encodeDeveloperDocumentId({
      tableNumber: 401,
      internalId: buildInternalId(33),
    });

    await writeJsonl(path.join(snapshotDirPath, '_tables', 'documents.jsonl'), [
      { name: 'user', id: 101 },
      { name: 'jwks', id: 102 },
    ]);

    await writeJsonl(
      path.join(
        snapshotDirPath,
        '_components',
        'betterAuth',
        '_tables',
        'documents.jsonl'
      ),
      [
        { name: 'user', id: 400 },
        { name: 'jwks', id: 401 },
      ]
    );

    await writeJsonl(
      path.join(
        snapshotDirPath,
        '_components',
        'betterAuth',
        'user',
        'documents.jsonl'
      ),
      [{ _id: oldUserId }]
    );

    await writeJsonl(
      path.join(
        snapshotDirPath,
        '_components',
        'betterAuth',
        'jwks',
        'documents.jsonl'
      ),
      [{ _id: oldJwksId }]
    );

    const stats = await migrateSnapshot({
      snapshotDirPath,
      filters: ['jwks'],
    });

    expect(stats.tablesTouched).toEqual(['jwks']);

    const jwksRows = await readJsonl(
      path.join(snapshotDirPath, 'jwks', 'documents.jsonl')
    );
    expect(String(jwksRows[0]?._id)).not.toBe(oldJwksId);

    const userDestination = path.join(
      snapshotDirPath,
      'user',
      'documents.jsonl'
    );
    expect(fs.existsSync(userDestination)).toBe(false);
  });
});
