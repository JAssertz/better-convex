/**
 * M6.5 Phase 4: Cursor Pagination Tests
 *
 * Tests for findMany({ paginate }) with Convex-native cursor pagination (O(1) performance)
 */

import { expect, test } from 'vitest';
import schema from '../schema';
import { convexTest, runCtx } from '../setup.testing';

test('basic pagination - null cursor returns first page', async () => {
  const t = convexTest(schema);

  // Setup: Create 50 users
  await t.run(async (baseCtx) => {
    for (let i = 0; i < 50; i++) {
      await baseCtx.db.insert('users', {
        name: `User ${i}`,
        email: `user${i}@example.com`,
      });
    }
  });

  // Test: Paginate first page
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const db = ctx.orm;

    const result = await db.query.users.findMany({
      paginate: {
        cursor: null,
        limit: 10,
      },
    });

    expect(result.page).toHaveLength(10);
    expect(result.isDone).toBe(false);
    expect(result.continueCursor).not.toBeNull();
  });
});

test('pagination - multiple pages with cursor', async () => {
  const t = convexTest(schema);

  // Setup: Create 25 users
  await t.run(async (baseCtx) => {
    for (let i = 0; i < 25; i++) {
      await baseCtx.db.insert('users', {
        name: `User ${i}`,
        email: `user${i}@example.com`,
      });
    }
  });

  // Test: Paginate through all pages
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const db = ctx.orm;

    // Page 1
    const page1 = await db.query.users.findMany({
      paginate: {
        cursor: null,
        limit: 10,
      },
    });
    expect(page1.page).toHaveLength(10);
    expect(page1.isDone).toBe(false);
    expect(page1.continueCursor).not.toBeNull();

    // Page 2
    const page2 = await db.query.users.findMany({
      paginate: {
        cursor: page1.continueCursor,
        limit: 10,
      },
    });
    expect(page2.page).toHaveLength(10);
    expect(page2.isDone).toBe(false);
    expect(page2.continueCursor).not.toBeNull();

    // Page 3 (last page - only 5 items)
    const page3 = await db.query.users.findMany({
      paginate: {
        cursor: page2.continueCursor,
        limit: 10,
      },
    });
    expect(page3.page).toHaveLength(5);
    expect(page3.isDone).toBe(true);
    // Convex returns "_end_cursor" when done, not null
    expect(page3.isDone).toBe(true);

    // Verify no duplicates across pages
    const allUsers = [...page1.page, ...page2.page, ...page3.page];
    const uniqueIds = new Set(allUsers.map((u: any) => u._id));
    expect(uniqueIds.size).toBe(25);
  });
});

test('predicate pagination honors maxScan', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    for (let i = 0; i < 60; i++) {
      await baseCtx.db.insert('users', {
        name: `User ${String(i).padStart(2, '0')}`,
        email: `predicate-paging-${i}@example.com`,
      });
    }
  });

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const db = ctx.orm;

    const page1 = await db.query.users.findMany({
      where: (row) => row.name.endsWith('0'),
      index: { name: 'by_name' },
      paginate: {
        cursor: null,
        limit: 5,
        maxScan: 10,
      },
    });

    expect(page1.page.length).toBeLessThanOrEqual(5);
    expect(page1.isDone).toBe(false);
    expect(page1.continueCursor).not.toBeNull();

    const page2 = await db.query.users.findMany({
      where: (row) => row.name.endsWith('0'),
      index: { name: 'by_name' },
      paginate: {
        cursor: page1.continueCursor,
        limit: 5,
        maxScan: 10,
      },
    });

    expect(page2.page.length).toBeGreaterThan(0);
    expect(page2.page.length).toBeLessThanOrEqual(5);
  });
});

test('pagination - empty result set', async () => {
  const t = convexTest(schema);

  // No setup - empty database

  // Test: Paginate empty table
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const db = ctx.orm;

    const result = await db.query.users.findMany({
      paginate: {
        cursor: null,
        limit: 10,
      },
    });

    expect(result.page).toHaveLength(0);
    expect(result.isDone).toBe(true);
    // Convex pagination returns "_end_cursor" marker when done
  });
});

test('pagination - single page (isDone: true)', async () => {
  const t = convexTest(schema);

  // Setup: Create 5 users (less than page size)
  await t.run(async (baseCtx) => {
    for (let i = 0; i < 5; i++) {
      await baseCtx.db.insert('users', {
        name: `User ${i}`,
        email: `user${i}@example.com`,
      });
    }
  });

  // Test: Paginate with larger page size
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const db = ctx.orm;

    const result = await db.query.users.findMany({
      paginate: {
        cursor: null,
        limit: 10,
      },
    });

    expect(result.page).toHaveLength(5);
    expect(result.isDone).toBe(true);
    // Convex pagination returns "_end_cursor" marker when done
  });
});

test('pagination with WHERE filter', async () => {
  const t = convexTest(schema);

  // Setup: Create users with different ages
  await t.run(async (baseCtx) => {
    for (let i = 0; i < 30; i++) {
      await baseCtx.db.insert('users', {
        name: `User ${i}`,
        email: `user${i}@example.com`,
        age: 20 + (i % 10), // Ages 20-29
      });
    }
  });

  // Test: Paginate only users age >= 25
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const db = ctx.orm;

    const result = await db.query.users.findMany({
      where: { age: { gte: 25 } },
      paginate: {
        cursor: null,
        limit: 10,
      },
    });

    expect(result.page.length).toBeGreaterThan(0);
    // Verify all results match filter
    result.page.forEach((user: any) => {
      expect(user.age).toBeGreaterThanOrEqual(25);
    });
  });
});

test('pagination with index-union filter requires allowFullScan opt-in', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const statuses = ['active', 'pending', 'inactive'] as const;
    for (let i = 0; i < 15; i++) {
      await baseCtx.db.insert('users', {
        name: `User ${i}`,
        email: `multi-probe-${i}@example.com`,
        status: statuses[i % statuses.length],
      });
    }
  });

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const db = ctx.orm;

    await expect(
      db.query.users.findMany({
        where: { status: { in: ['active', 'pending'] } },
        paginate: {
          cursor: null,
          limit: 5,
        },
      })
    ).rejects.toThrow(/allowFullScan: true/i);
  });
});

test('pagination with index-union filter works with allowFullScan', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const statuses = ['active', 'pending', 'inactive'] as const;
    for (let i = 0; i < 15; i++) {
      await baseCtx.db.insert('users', {
        name: `User ${i}`,
        email: `multi-probe-allow-${i}@example.com`,
        status: statuses[i % statuses.length],
      });
    }
  });

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const db = ctx.orm;

    const page = await db.query.users.findMany({
      where: { status: { in: ['active', 'pending'] } },
      paginate: {
        cursor: null,
        limit: 5,
      },
      allowFullScan: true,
    });

    expect(page.page.length).toBeGreaterThan(0);
    expect(page.page.every((row: any) => row.status !== 'inactive')).toBe(true);
  });
});

test('pagination on non-leading compound field requires allowFullScan opt-in', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    await baseCtx.db.insert('posts', {
      text: 'A',
      type: 'news',
      numLikes: 10,
    });
    await baseCtx.db.insert('posts', {
      text: 'B',
      type: 'blog',
      numLikes: 10,
    });
    await baseCtx.db.insert('posts', {
      text: 'C',
      type: 'news',
      numLikes: 50,
    });
  });

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const db = ctx.orm;

    await expect(
      db.query.posts.findMany({
        where: { numLikes: 10 },
        paginate: {
          cursor: null,
          limit: 2,
        },
      })
    ).rejects.toThrow(/allowFullScan: true/i);

    const page = await db.query.posts.findMany({
      where: { numLikes: 10 },
      paginate: {
        cursor: null,
        limit: 2,
      },
      allowFullScan: true,
    });

    expect(page.page).toHaveLength(2);
    expect(page.page.every((row: any) => row.numLikes === 10)).toBe(true);
  });
});

test('pagination with ORDER BY ascending', async () => {
  const t = convexTest(schema);

  // Setup: Create users with specific names
  await t.run(async (baseCtx) => {
    const names = ['Charlie', 'Alice', 'Bob', 'David', 'Eve'];
    for (const name of names) {
      await baseCtx.db.insert('users', {
        name,
        email: `${name.toLowerCase()}@example.com`,
      });
    }
  });

  // Test: Paginate with ascending order on non-indexed field (strict default)
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const db = ctx.orm;

    await expect(
      db.query.users.findMany({
        orderBy: { role: 'asc' },
        paginate: {
          cursor: null,
          limit: 3,
        },
      })
    ).rejects.toThrow(/Pagination: Field 'role' has no index/);
  });
});

test('pagination with ORDER BY _creationTime', async () => {
  const t = convexTest(schema);

  // Setup: Create posts with different like counts
  await t.run(async (baseCtx) => {
    const userId = await baseCtx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    for (let i = 1; i <= 20; i++) {
      await baseCtx.db.insert('posts', {
        text: `Post ${i}`,
        title: `Post ${i}`,
        type: 'text',
        authorId: userId,
        numLikes: i * 10,
      });
    }
  });

  // Test: Paginate posts by _creationTime descending (indexed)
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const db = ctx.orm;

    const result = await db.query.posts.findMany({
      orderBy: { _creationTime: 'desc' },
      paginate: {
        cursor: null,
        limit: 5,
      },
    });

    expect(result.page).toHaveLength(5);
  });
});

test('pagination - cursor stability (replaying cursor returns same results)', async () => {
  const t = convexTest(schema);

  // Setup: Create 15 users
  await t.run(async (baseCtx) => {
    for (let i = 0; i < 15; i++) {
      await baseCtx.db.insert('users', {
        name: `User ${i}`,
        email: `user${i}@example.com`,
      });
    }
  });

  // Test: Replay same cursor multiple times
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const db = ctx.orm;

    // Get first page
    const page1 = await db.query.users.findMany({
      paginate: {
        cursor: null,
        limit: 5,
      },
    });

    // Replay second page cursor twice
    const page2a = await db.query.users.findMany({
      paginate: {
        cursor: page1.continueCursor,
        limit: 5,
      },
    });

    const page2b = await db.query.users.findMany({
      paginate: {
        cursor: page1.continueCursor,
        limit: 5,
      },
    });

    // Both should return identical results
    expect(page2a.page.length).toBe(page2b.page.length);
    expect((page2a.page[0] as any)._id).toBe((page2b.page[0] as any)._id);
    expect((page2a.page[4] as any)._id).toBe((page2b.page[4] as any)._id);
  });
});

test('pagination - default ordering (_creationTime desc)', async () => {
  const t = convexTest(schema);

  // Setup: Create users in sequence
  await t.run(async (baseCtx) => {
    const userIds = [];
    for (let i = 0; i < 10; i++) {
      const id = await baseCtx.db.insert('users', {
        name: `User ${i}`,
        email: `user${i}@example.com`,
      });
      userIds.push(id);
    }
  });

  // Test: Paginate without explicit orderBy (should default to _creationTime desc)
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const db = ctx.orm;

    const result = await db.query.users.findMany({
      paginate: {
        cursor: null,
        limit: 5,
      },
    });

    expect(result.page).toHaveLength(5);
    // Newest first (User 9, User 8, User 7, User 6, User 5)
    // Note: _creationTime ordering means most recently created comes first
    const names = result.page.map((u: any) => u.name);
    expect(names[0]).toBe('User 9');
    expect(names[4]).toBe('User 5');
  });
});

test('pagination - large result set (100+ items)', async () => {
  const t = convexTest(schema);

  // Setup: Create 150 users
  await t.run(async (baseCtx) => {
    for (let i = 0; i < 150; i++) {
      await baseCtx.db.insert('users', {
        name: `User ${i}`,
        email: `user${i}@example.com`,
      });
    }
  });

  // Test: Paginate through large dataset
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const db = ctx.orm;

    let cursor: string | null = null;
    let totalFetched = 0;
    let pageCount = 0;

    // Paginate until done
    while (true) {
      const result: any = await db.query.users.findMany({
        paginate: {
          cursor,
          limit: 20,
        },
      });

      totalFetched += result.page.length;
      pageCount++;

      if (result.isDone) {
        break;
      }

      cursor = result.continueCursor;
    }

    expect(totalFetched).toBe(150);
    expect(pageCount).toBe(8); // 7 full pages + 1 partial page (150 / 20 = 7.5)
  });
});

test('pagination with combined WHERE and ORDER BY (non-indexed)', async () => {
  const t = convexTest(schema);

  // Setup: Create posts with different publish status and likes
  await t.run(async (baseCtx) => {
    const userId = await baseCtx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    for (let i = 0; i < 30; i++) {
      await baseCtx.db.insert('posts', {
        text: `Post ${i}`,
        title: `Post ${i}`,
        type: 'text',
        authorId: userId,
        published: i % 3 === 0,
        numLikes: i,
      });
    }
  });

  // Test: Paginate published posts ordered by likes (non-indexed)
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const db = ctx.orm;

    await expect(
      db.query.posts.findMany({
        where: { published: true },
        orderBy: { numLikes: 'desc' },
        paginate: {
          cursor: null,
          limit: 5,
        },
      })
    ).rejects.toThrow(/Pagination: Field 'numLikes' has no index/);
  });
});
