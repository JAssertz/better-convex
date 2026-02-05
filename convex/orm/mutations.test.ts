/**
 * M7 Mutations - Insert/Update/Delete Tests
 *
 * Tests Drizzle-style mutation builder API:
 * - insert().values().returning()
 * - update().set().where().returning()
 * - delete().where().returning()
 * - onConflictDoNothing/onConflictDoUpdate
 */

import {
  convexTable,
  defineRelations,
  defineSchema,
  eq,
  extractRelationsConfig,
  text,
} from 'better-convex/orm';
import { it as baseIt, describe, expect } from 'vitest';
import schema, { users } from '../schema';
import {
  convexTest,
  runCtx,
  type TestCtx,
  withTableCtx,
} from '../setup.testing';

const it = baseIt.extend<{ ctx: TestCtx }>({
  ctx: async ({}, use) => {
    const t = convexTest(schema);
    await t.run(async (baseCtx) => {
      const ctx = await runCtx(baseCtx);
      await use(ctx);
    });
  },
});

const baseUser = {
  name: 'Alice',
  email: 'alice@example.com',
  height: 1.8,
  age: 30,
  status: 'active',
  role: 'member',
  deletedAt: 0,
  cityId: null,
  homeCityId: null,
};

describe('M7 Mutations', () => {
  it('should insert and return full row', async ({ ctx }) => {
    const db = ctx.table;
    const [user] = await db.insert(users).values(baseUser).returning();

    expect(user).toBeDefined();
    expect(user.name).toBe('Alice');
    expect(user.email).toBe('alice@example.com');
    expect(user._id).toBeDefined();
  });

  it('should insert and return partial fields', async ({ ctx }) => {
    const db = ctx.table;
    const [user] = await db.insert(users).values(baseUser).returning({
      name: users.name,
      email: users.email,
    });

    expect(user).toEqual({
      name: 'Alice',
      email: 'alice@example.com',
    });
  });

  it('should update rows and return updated values', async ({ ctx }) => {
    const db = ctx.table;
    const [user] = await db.insert(users).values(baseUser).returning();

    const [updated] = await db
      .update(users)
      .set({ name: 'Updated' })
      .where(eq(users._id, user._id))
      .returning();

    expect(updated.name).toBe('Updated');
  });

  it('should delete rows and return deleted values', async ({ ctx }) => {
    const db = ctx.table;
    const [user] = await db.insert(users).values(baseUser).returning();

    const deleted = await db
      .delete(users)
      .where(eq(users._id, user._id))
      .returning({
        name: users.name,
        email: users.email,
      });

    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toEqual({
      name: 'Alice',
      email: 'alice@example.com',
    });
    expect(await ctx.db.get(user._id)).toBeNull();
  });

  it('should skip insert on conflict do nothing', async ({ ctx }) => {
    const db = ctx.table;
    await db.insert(users).values(baseUser).returning();

    const result = await db
      .insert(users)
      .values({
        ...baseUser,
        name: 'Duplicate',
      })
      .onConflictDoNothing({ target: users.email })
      .returning();

    expect(result).toHaveLength(0);
  });

  it('should update existing row on conflict do update', async ({ ctx }) => {
    const db = ctx.table;
    await db.insert(users).values(baseUser).returning();

    const [updated] = await db
      .insert(users)
      .values({
        ...baseUser,
        name: 'Second',
      })
      .onConflictDoUpdate({
        target: users.email,
        set: { name: 'Updated' },
      })
      .returning();

    expect(updated.name).toBe('Updated');
  });

  it('should throw update/delete without where when strict is true', async ({
    ctx,
  }) => {
    const db = ctx.table;
    await db.insert(users).values(baseUser).returning();

    await expect(db.update(users).set({ name: 'NoWhere' })).rejects.toThrow(
      /requires where\(\)/i
    );
    await expect(db.delete(users)).rejects.toThrow(/requires where\(\)/i);
  });

  it('should allow update/delete without where when strict is false', async () => {
    const relaxedUsers = convexTable('relaxedUsers', {
      name: text().notNull(),
    });
    const tables = { relaxedUsers };
    const relaxedSchema = defineSchema(tables, { strict: false });
    const relaxedRelations = defineRelations(tables);
    const relaxedEdges = extractRelationsConfig(relaxedRelations);

    const warn = console.warn;
    console.warn = () => {};
    try {
      await expect(
        withTableCtx(
          relaxedSchema,
          relaxedRelations,
          relaxedEdges,
          async (ctx) => {
            await ctx.db.insert('relaxedUsers', { name: 'Alice' });
            await ctx.table.update(relaxedUsers).set({ name: 'Bob' });
            await ctx.table.delete(relaxedUsers);
          }
        )
      ).resolves.toBeUndefined();
    } finally {
      console.warn = warn;
    }
  });
});
