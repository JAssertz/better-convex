import { describe, expect, it } from 'vitest';
import {
  convexTable,
  createDatabase,
  defineRelations,
  defineSchema,
  extractRelationsConfig,
  text,
  unique,
} from 'better-convex/orm';
import { convexTest } from '../setup.testing';

const defaultUsers = convexTable('default_users', {
  name: text().notNull(),
  role: text().default('member'),
  nickname: text().default('anon'),
});

const uniqueColumnUsers = convexTable('unique_column_users', {
  email: text().notNull().unique(),
  handle: text().unique('handle_unique', { nulls: 'not distinct' }),
});

const uniqueTableUsers = convexTable(
  'unique_table_users',
  {
    firstName: text(),
    lastName: text(),
  },
  (t) => [unique('full_name').on(t.firstName, t.lastName)]
);

const uniqueNulls = convexTable(
  'unique_nulls',
  {
    code: text(),
  },
  (t) => [unique().on(t.code)]
);

const uniqueNullsStrict = convexTable(
  'unique_nulls_strict',
  {
    code: text(),
  },
  (t) => [unique().on(t.code).nullsNotDistinct()]
);

const rawSchema = {
  default_users: defaultUsers,
  unique_column_users: uniqueColumnUsers,
  unique_table_users: uniqueTableUsers,
  unique_nulls: uniqueNulls,
  unique_nulls_strict: uniqueNullsStrict,
};

const schema = defineSchema(rawSchema);
const relations = defineRelations(rawSchema);
const edges = extractRelationsConfig(relations);

const withCtx = async <T>(fn: (ctx: { table: ReturnType<typeof createDatabase> }) => Promise<T>) => {
  const t = convexTest(schema);
  let result: T | undefined;
  await t.run(async (baseCtx) => {
    const table = createDatabase(baseCtx.db, relations, edges);
    result = await fn({ table });
  });
  return result as T;
};

describe('defaults enforcement', () => {
  it('applies defaults when value is undefined', async () =>
    withCtx(async ({ table }) => {
      const [user] = await table
        .insert(defaultUsers)
        .values({ name: 'Ada' })
        .returning();

      expect(user.role).toBe('member');
      expect(user.nickname).toBe('anon');
    }));

  it('does not override explicit null', async () =>
    withCtx(async ({ table }) => {
      const [user] = await table
        .insert(defaultUsers)
        .values({ name: 'Ada', nickname: null })
        .returning();

      expect(user.nickname).toBeNull();
    }));
});

describe('unique constraints enforcement', () => {
  it('rejects duplicate column unique values', async () =>
    withCtx(async ({ table }) => {
      await table
        .insert(uniqueColumnUsers)
        .values({ email: 'alice@example.com', handle: 'alice' })
        .returning();

      await expect(
        table.insert(uniqueColumnUsers).values({
          email: 'alice@example.com',
          handle: 'alice2',
        })
      ).rejects.toThrow(/unique/i);
    }));

  it('rejects duplicate table unique values', async () =>
    withCtx(async ({ table }) => {
      await table
        .insert(uniqueTableUsers)
        .values({ firstName: 'Ada', lastName: 'Lovelace' })
        .returning();

      await expect(
        table.insert(uniqueTableUsers).values({
          firstName: 'Ada',
          lastName: 'Lovelace',
        })
      ).rejects.toThrow(/unique/i);
    }));

  it('allows multiple nulls when nulls are distinct', async () =>
    withCtx(async ({ table }) => {
      await table.insert(uniqueNulls).values({ code: null });
      await table.insert(uniqueNulls).values({ code: null });
    }));

  it('rejects multiple nulls when nulls are not distinct', async () =>
    withCtx(async ({ table }) => {
      await table.insert(uniqueNullsStrict).values({ code: null });
      await expect(
        table.insert(uniqueNullsStrict).values({ code: null })
      ).rejects.toThrow(/unique/i);
    }));

  it('enforces column unique nullsNotDistinct', async () =>
    withCtx(async ({ table }) => {
      await table.insert(uniqueColumnUsers).values({
        email: 'bob@example.com',
        handle: null,
      });

      await expect(
        table.insert(uniqueColumnUsers).values({
          email: 'charlie@example.com',
          handle: null,
        })
      ).rejects.toThrow(/unique/i);
    }));
});
