import {
  convexTable,
  createDatabase,
  defineRelations,
  defineSchema,
  eq,
  extractRelationsConfig,
  text,
  uniqueIndex,
} from 'better-convex/orm';
import { describe, expect, it } from 'vitest';
import { convexTest } from '../setup.testing';

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

const rawSchema = { unique_users: uniqueUsers, unique_teams: uniqueTeams };
const schema = defineSchema(rawSchema);
const relations = defineRelations(rawSchema);
const edges = extractRelationsConfig(relations);

const withCtx = async <T>(
  fn: (ctx: { table: ReturnType<typeof createDatabase> }) => Promise<T>
) => {
  const t = convexTest(schema);
  let result: T | undefined;
  await t.run(async (baseCtx) => {
    const table = createDatabase(baseCtx.db, relations, edges);
    result = await fn({ table });
  });
  return result as T;
};

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
