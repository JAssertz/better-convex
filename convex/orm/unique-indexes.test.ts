import {
  convexTable,
  type DatabaseWithMutations,
  defineRelations,
  defineSchema,
  eq,
  extractRelationsConfig,
  text,
  uniqueIndex,
} from 'better-convex/orm';
import { describe, expect, it } from 'vitest';
import { withTableCtx } from '../setup.testing';

let upsertUpdatedAtCalls = 0;

const uniqueUsers = convexTable(
  'unique_users',
  {
    email: text().notNull(),
    name: text().notNull(),
  },
  (t) => [uniqueIndex('unique_email').on(t.email)]
);

const uniqueTeams = convexTable(
  'unique_teams',
  {
    tenantId: text().notNull(),
    email: text().notNull(),
    name: text().notNull(),
  },
  (t) => [uniqueIndex('unique_tenant_email').on(t.tenantId, t.email)]
);

const upsertUsers = convexTable(
  'upsert_users',
  {
    email: text().notNull(),
    name: text().notNull(),
    updatedAt: text()
      .notNull()
      .$defaultFn(() => 'initial')
      .$onUpdateFn(() => {
        upsertUpdatedAtCalls += 1;
        return `updated_${upsertUpdatedAtCalls}`;
      }),
  },
  (t) => [uniqueIndex('unique_email').on(t.email)]
);

const rawSchema = {
  unique_users: uniqueUsers,
  unique_teams: uniqueTeams,
  upsert_users: upsertUsers,
};
const schema = defineSchema(rawSchema);
const relations = defineRelations(rawSchema);
const edges = extractRelationsConfig(relations);

const withCtx = async <T>(
  fn: (ctx: { table: DatabaseWithMutations<typeof relations> }) => Promise<T>
) => withTableCtx(schema, relations, edges, async ({ table }) => fn({ table }));

describe('uniqueIndex enforcement', () => {
  it('rejects duplicate inserts', async () =>
    withCtx(async ({ table }) => {
      await table.insert(uniqueUsers).values({
        email: 'alice@example.com',
        name: 'Alice',
      });

      await expect(
        table.insert(uniqueUsers).values({
          email: 'alice@example.com',
          name: 'Alice Duplicate',
        })
      ).rejects.toThrow(/unique/i);
    }));

  it('rejects updates that violate unique indexes', async () =>
    withCtx(async ({ table }) => {
      const [first] = await table
        .insert(uniqueUsers)
        .values({ email: 'alice@example.com', name: 'Alice' })
        .returning();

      const [second] = await table
        .insert(uniqueUsers)
        .values({ email: 'bob@example.com', name: 'Bob' })
        .returning();

      await expect(
        table
          .update(uniqueUsers)
          .set({ email: first.email })
          .where(eq(uniqueUsers._id, second._id))
          .returning()
      ).rejects.toThrow(/unique/i);
    }));

  it('allows onConflictDoNothing with unique indexes', async () =>
    withCtx(async ({ table }) => {
      await table
        .insert(uniqueUsers)
        .values({ email: 'alice@example.com', name: 'Alice' })
        .returning();

      const result = await table
        .insert(uniqueUsers)
        .values({ email: 'alice@example.com', name: 'Duplicate' })
        .onConflictDoNothing({ target: uniqueUsers.email })
        .returning();

      expect(result).toHaveLength(0);
    }));

  it('allows onConflictDoNothing without target (any unique conflict)', async () =>
    withCtx(async ({ table }) => {
      await table
        .insert(uniqueUsers)
        .values({ email: 'alice@example.com', name: 'Alice' })
        .returning();

      const result = await table
        .insert(uniqueUsers)
        .values({ email: 'alice@example.com', name: 'Duplicate' })
        .onConflictDoNothing()
        .returning();

      expect(result).toHaveLength(0);
    }));

  it('allows onConflictDoUpdate with unique indexes', async () =>
    withCtx(async ({ table }) => {
      await table
        .insert(uniqueUsers)
        .values({ email: 'alice@example.com', name: 'Alice' })
        .returning();

      const [updated] = await table
        .insert(uniqueUsers)
        .values({ email: 'alice@example.com', name: 'Duplicate' })
        .onConflictDoUpdate({
          target: uniqueUsers.email,
          set: { name: 'Updated' },
        })
        .returning();

      expect(updated.name).toBe('Updated');
    }));

  it('applies $onUpdateFn during onConflictDoUpdate when not set', async () =>
    withCtx(async ({ table }) => {
      upsertUpdatedAtCalls = 0;

      const [created] = await table
        .insert(upsertUsers)
        .values({ email: 'alice@example.com', name: 'Alice' })
        .returning();

      expect(created.updatedAt).toBe('initial');

      const [updated] = await table
        .insert(upsertUsers)
        .values({ email: 'alice@example.com', name: 'Duplicate' })
        .onConflictDoUpdate({
          target: upsertUsers.email,
          set: { name: 'Updated' },
        })
        .returning();

      expect(upsertUpdatedAtCalls).toBe(1);
      expect(updated.updatedAt).toBe('updated_1');
    }));

  it('enforces composite unique indexes', async () =>
    withCtx(async ({ table }) => {
      await table
        .insert(uniqueTeams)
        .values({ tenantId: 't1', email: 'alice@example.com', name: 'Alice' })
        .returning();

      await table
        .insert(uniqueTeams)
        .values({ tenantId: 't2', email: 'alice@example.com', name: 'Alice' })
        .returning();

      await expect(
        table.insert(uniqueTeams).values({
          tenantId: 't1',
          email: 'alice@example.com',
          name: 'Alice Duplicate',
        })
      ).rejects.toThrow(/unique/i);
    }));
});
