/**
 * Public API guard: db.stream() is not user-facing.
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
  it('should not expose db.stream() on orm context', async ({ ctx }) => {
    const db = ctx.orm as any;
    expect(db.stream).toBeUndefined();
  });
});
