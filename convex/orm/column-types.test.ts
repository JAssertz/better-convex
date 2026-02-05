import {
  bytes,
  convexTable,
  custom,
  type DatabaseWithMutations,
  defineRelations,
  defineSchema,
  extractRelationsConfig,
  textEnum,
} from 'better-convex/orm';
import { v } from 'convex/values';
import { describe, expect, it } from 'vitest';
import { withTableCtx } from '../setup.testing';

const bytesFiles = convexTable('bytes_files', {
  data: bytes().notNull(),
});

const customConfigs = convexTable('custom_configs', {
  meta: custom(v.object({ key: v.string() })).notNull(),
});

const enumUsers = convexTable('enum_users', {
  status: textEnum(['active', 'inactive'] as const).notNull(),
});

const rawSchema = {
  bytes_files: bytesFiles,
  custom_configs: customConfigs,
  enum_users: enumUsers,
};

const schema = defineSchema(rawSchema);
const relations = defineRelations(rawSchema);
const edges = extractRelationsConfig(relations);

const withCtx = async <T>(
  fn: (ctx: { table: DatabaseWithMutations<typeof relations> }) => Promise<T>
) => withTableCtx(schema, relations, edges, async ({ table }) => fn({ table }));

describe('column types', () => {
  it('bytes() stores and returns ArrayBuffer', async () =>
    withCtx(async ({ table }) => {
      const input = new Uint8Array([1, 2, 3]).buffer;
      const [row] = await table
        .insert(bytesFiles)
        .values({ data: input })
        .returning();

      expect(Array.from(new Uint8Array(row.data))).toEqual([1, 2, 3]);
    }));

  it('custom() enforces Convex validators', async () =>
    withCtx(async ({ table }) => {
      await table
        .insert(customConfigs)
        .values({ meta: { key: 'value' } })
        .returning();

      await expect(
        table.insert(customConfigs).values({ meta: { key: 123 } as any })
      ).rejects.toThrow();
    }));

  it('textEnum() rejects invalid values', async () =>
    withCtx(async ({ table }) => {
      await table.insert(enumUsers).values({ status: 'active' }).returning();

      await expect(
        table.insert(enumUsers).values({ status: 'other' as any })
      ).rejects.toThrow();
    }));
});
