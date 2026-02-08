import { expect, test } from 'vitest';
import schema from '../../convex/schema';
import { convexTest } from '../../convex/setup.testing';
import { getPage } from '../../packages/better-convex/src/orm/pagination';

test('getPage accepts explicit indexFields without schema', async () => {
  const t = convexTest(schema);

  await t.run(async (ctx) => {
    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
    });
    await ctx.db.insert('users', {
      name: 'Charlie',
      email: 'charlie@example.com',
    });
  });

  await t.run(async (ctx) => {
    const page = await getPage(
      { db: ctx.db as any },
      {
        table: 'users' as any,
        index: 'by_name' as any,
        indexFields: ['name'],
        targetMaxRows: 10,
      }
    );

    expect(page.page.map((row: any) => row.name)).toEqual([
      'Alice',
      'Bob',
      'Charlie',
    ]);
    expect(page.hasMore).toBe(false);
    expect(page.indexKeys).toHaveLength(3);
  });
});
