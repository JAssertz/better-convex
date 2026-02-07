/**
 * Stream API - Basic functionality
 */

import { it as baseIt, describe, expect } from 'vitest';
import schema from '../schema';
import { convexTest, runCtx, type TestCtx } from '../setup.testing';

const it = baseIt.extend<{ ctx: TestCtx }>({
  ctx: async ({}, use) => {
    const t = convexTest(schema);
    await t.run(async (baseCtx) => {
      const ctx = await runCtx(baseCtx);
      await use(ctx);
    });
  },
});

describe('ORM stream', () => {
  it('should query via db.stream()', async ({ ctx }) => {
    const userId = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    const db = ctx.orm;
    const rows = await db.stream().query('users').take(1);

    expect(rows).toHaveLength(1);
    expect(rows[0]?._id).toBe(userId);
  });
});
