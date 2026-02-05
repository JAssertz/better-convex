import {
  check,
  convexTable,
  type DatabaseWithMutations,
  defineRelations,
  defineSchema,
  eq,
  extractRelationsConfig,
  gte,
  inArray,
  integer,
  text,
  unique,
} from 'better-convex/orm';
import { describe, expect, it } from 'vitest';
import { withTableCtx } from '../setup.testing';

let hookUpdatedAtCalls = 0;

const defaultUsers = convexTable('default_users', {
  name: text().notNull(),
  role: text().default('member'),
  nickname: text().default('anon'),
});

const hookUsers = convexTable('hook_users', {
  name: text().notNull(),
  nickname: text().$defaultFn(() => 'anon'),
  updatedAt: text()
    .$defaultFn(() => 'initial')
    .$onUpdateFn(() => {
      hookUpdatedAtCalls += 1;
      return `updated_${hookUpdatedAtCalls}`;
    }),
  touchedAt: text()
    .notNull()
    .$onUpdateFn(() => 'touched'),
});

const checkUsers = convexTable(
  'check_users',
  {
    name: text().notNull(),
    age: integer(),
  },
  (t) => [check('age_min', gte(t.age, 21))]
);

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
  hook_users: hookUsers,
  check_users: checkUsers,
  unique_column_users: uniqueColumnUsers,
  unique_table_users: uniqueTableUsers,
  unique_nulls: uniqueNulls,
  unique_nulls_strict: uniqueNullsStrict,
};

const schema = defineSchema(rawSchema);
const relations = defineRelations(rawSchema);
const edges = extractRelationsConfig(relations);

const withCtx = async <T>(
  fn: (ctx: { table: DatabaseWithMutations<typeof relations> }) => Promise<T>
) => withTableCtx(schema, relations, edges, async ({ table }) => fn({ table }));

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

describe('column hooks', () => {
  it('$defaultFn applies when value is missing', async () =>
    withCtx(async ({ table }) => {
      hookUpdatedAtCalls = 0;

      const [user] = await table
        .insert(hookUsers)
        .values({ name: 'Ada' })
        .returning();

      expect(user.nickname).toBe('anon');
      expect(user.updatedAt).toBe('initial');
      expect(user.touchedAt).toBe('touched');
    }));

  it('$defaultFn does not override explicit null', async () =>
    withCtx(async ({ table }) => {
      const [user] = await table
        .insert(hookUsers)
        .values({ name: 'Ada', nickname: null })
        .returning();

      expect(user.nickname).toBeNull();
    }));

  it('$onUpdateFn applies on update when not explicitly set', async () =>
    withCtx(async ({ table }) => {
      hookUpdatedAtCalls = 0;

      await table
        .insert(hookUsers)
        .values([{ name: 'Ada' }, { name: 'Grace' }]);

      const updated = await table
        .update(hookUsers)
        .set({ name: 'Updated' })
        .where(inArray(hookUsers.name, ['Ada', 'Grace']))
        .returning();

      expect(hookUpdatedAtCalls).toBe(1);
      expect(updated).toHaveLength(2);
      for (const row of updated) {
        expect(row.updatedAt).toBe('updated_1');
        expect(row.touchedAt).toBe('touched');
      }
    }));

  it('$onUpdateFn does not override explicit set', async () =>
    withCtx(async ({ table }) => {
      hookUpdatedAtCalls = 0;

      const [user] = await table
        .insert(hookUsers)
        .values({ name: 'Ada' })
        .returning();

      const [updated] = await table
        .update(hookUsers)
        .set({ updatedAt: 'manual' })
        .where(eq(hookUsers._id, user._id))
        .returning();

      expect(hookUpdatedAtCalls).toBe(0);
      expect(updated.updatedAt).toBe('manual');
    }));
});

describe('check constraints enforcement', () => {
  it('rejects inserts when check evaluates to false', async () =>
    withCtx(async ({ table }) => {
      await expect(
        table.insert(checkUsers).values({ name: 'Ada', age: 18 })
      ).rejects.toThrow(/check/i);
    }));

  it('allows inserts when check evaluates to unknown (null/undefined)', async () =>
    withCtx(async ({ table }) => {
      await table.insert(checkUsers).values({ name: 'Ada', age: null });
      await table.insert(checkUsers).values({ name: 'Grace' });
    }));

  it('rejects updates when new row violates check', async () =>
    withCtx(async ({ table }) => {
      const [user] = await table
        .insert(checkUsers)
        .values({ name: 'Ada', age: 25 })
        .returning();

      await expect(
        table
          .update(checkUsers)
          .set({ age: 18 })
          .where(eq(checkUsers._id, user._id))
          .returning()
      ).rejects.toThrow(/check/i);
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
