/**
 * M5 OrderBy - Comprehensive Test Suite
 *
 * Tests orderBy functionality:
 * - asc() and desc() helpers
 * - Single-field ordering
 * - Combined with where filtering
 * - Combined with pagination (limit/offset)
 * - Index-aware optimization
 */

import { test as baseTest, describe, expect } from 'vitest';
import schema from '../schema';
import { convexTest, runCtx, type TestCtx } from '../setup.testing';

// ============================================================================
// Test Setup
// ============================================================================

const test = baseTest.extend<{ ctx: TestCtx }>({
  ctx: async ({}, use) => {
    const t = convexTest(schema);
    await t.run(async (baseCtx) => {
      const ctx = await runCtx(baseCtx);
      await use(ctx);
    });
  },
});

// ============================================================================
// Basic OrderBy Tests
// ============================================================================

describe('M5: OrderBy - Basic Ordering', () => {
  test('asc() orders by field ascending', async ({ ctx }) => {
    const db = ctx.orm;

    // Create test data with different creation times
    const user1 = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });
    const user2 = await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
    });
    const user3 = await ctx.db.insert('users', {
      name: 'Charlie',
      email: 'charlie@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 3',
      content: 'Content 3',
      published: true,
      authorId: user1,
      createdAt: 3000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 1',
      content: 'Content 1',
      published: true,
      authorId: user2,
      createdAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 2',
      content: 'Content 2',
      published: true,
      authorId: user3,
      createdAt: 2000,
    });

    // Query with ascending order by createdAt
    const posts = await db.query.posts.findMany({
      orderBy: (posts: any, { asc }: any) => asc(posts.createdAt),
    });

    expect(posts).toHaveLength(3);
    expect(posts[0].createdAt).toBe(1000);
    expect(posts[1].createdAt).toBe(2000);
    expect(posts[2].createdAt).toBe(3000);
  });

  test('desc() orders by field descending', async ({ ctx }) => {
    const db = ctx.orm;

    // Create test data
    const user1 = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });
    const user2 = await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
    });
    const user3 = await ctx.db.insert('users', {
      name: 'Charlie',
      email: 'charlie@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 1',
      content: 'Content 1',
      published: true,
      authorId: user1,
      createdAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 2',
      content: 'Content 2',
      published: true,
      authorId: user2,
      createdAt: 2000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 3',
      content: 'Content 3',
      published: true,
      authorId: user3,
      createdAt: 3000,
    });

    // Query with descending order by createdAt
    const posts = await db.query.posts.findMany({
      orderBy: (posts: any, { desc }: any) => desc(posts.createdAt),
    });

    expect(posts).toHaveLength(3);
    expect(posts[0].createdAt).toBe(3000);
    expect(posts[1].createdAt).toBe(2000);
    expect(posts[2].createdAt).toBe(1000);
  });

  test('orderBy callback accepts column builder (defaults to asc)', async ({
    ctx,
  }) => {
    const db = ctx.orm;

    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 3',
      content: 'Content 3',
      published: true,
      authorId: user,
      createdAt: 3000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 1',
      content: 'Content 1',
      published: true,
      authorId: user,
      createdAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 2',
      content: 'Content 2',
      published: true,
      authorId: user,
      createdAt: 2000,
    });

    const posts = await db.query.posts.findMany({
      orderBy: (posts: any) => posts.createdAt,
    });

    expect(posts).toHaveLength(3);
    expect(posts[0].createdAt).toBe(1000);
    expect(posts[1].createdAt).toBe(2000);
    expect(posts[2].createdAt).toBe(3000);
  });

  test('orderBy by _creationTime uses default index', async ({ ctx }) => {
    const db = ctx.orm;

    // Create test data
    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'First',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Second',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 2000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Third',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 3000,
    });

    // Query ordered by _creationTime (has default index)
    const postsAsc = await db.query.posts.findMany({
      orderBy: { _creationTime: 'asc' },
    });

    expect(postsAsc).toHaveLength(3);
    expect(postsAsc[0].title).toBe('First');
    expect(postsAsc[2].title).toBe('Third');

    const postsDesc = await db.query.posts.findMany({
      orderBy: { _creationTime: 'desc' },
    });

    expect(postsDesc).toHaveLength(3);
    expect(postsDesc[0].title).toBe('Third');
    expect(postsDesc[2].title).toBe('First');
  });
});

// ============================================================================
// OrderBy with Filtering
// ============================================================================

describe('M5: OrderBy - Combined with WHERE', () => {
  test('orderBy works with where filtering', async ({ ctx }) => {
    const db = ctx.orm;

    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Published 3',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 3000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Draft 1',
      content: 'Content',
      published: false,
      authorId: user,
      createdAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Published 2',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 2000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Published 1',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 1500,
    });

    // Query published posts ordered by createdAt
    const posts = await db.query.posts.findMany({
      where: { published: true },
      orderBy: { createdAt: 'asc' },
    });

    expect(posts).toHaveLength(3);
    expect(posts[0].title).toBe('Published 1');
    expect(posts[1].title).toBe('Published 2');
    expect(posts[2].title).toBe('Published 3');
  });
});

// ============================================================================
// OrderBy with Pagination
// ============================================================================

describe('M5: OrderBy - Combined with Pagination', () => {
  test('orderBy works with limit', async ({ ctx }) => {
    const db = ctx.orm;

    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 1',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 2',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 2000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 3',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 3000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 4',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 4000,
    });

    // Get top 2 oldest posts
    const posts = await db.query.posts.findMany({
      orderBy: { createdAt: 'asc' },
      limit: 2,
    });

    expect(posts).toHaveLength(2);
    expect(posts[0].title).toBe('Post 1');
    expect(posts[1].title).toBe('Post 2');
  });

  test('orderBy works with offset', async ({ ctx }) => {
    const db = ctx.orm;

    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 1',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 2',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 2000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 3',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 3000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Post 4',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 4000,
    });

    // Get page 2 (skip first 2, take 2)
    const posts = await db.query.posts.findMany({
      orderBy: { createdAt: 'asc' },
      limit: 2,
      offset: 2,
    });

    expect(posts).toHaveLength(2);
    expect(posts[0].title).toBe('Post 3');
    expect(posts[1].title).toBe('Post 4');
  });
});

// ============================================================================
// Multi-field Ordering
// ============================================================================

describe('M5: OrderBy - Multiple Fields', () => {
  test('orderBy callback supports multiple fields', async ({ ctx }) => {
    const db = ctx.orm;

    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'B Title',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'A Title',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'C Title',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 2000,
    });

    const posts = await db.query.posts.findMany({
      orderBy: (posts: any, { asc, desc }: any) => [
        desc(posts.createdAt),
        asc(posts.title),
      ],
    });

    expect(posts).toHaveLength(3);
    expect(posts[0].title).toBe('C Title'); // createdAt 2000
    expect(posts[1].title).toBe('A Title'); // createdAt 1000, title asc
    expect(posts[2].title).toBe('B Title');
  });

  test('multi-field orderBy applies sort before offset/limit', async ({
    ctx,
  }) => {
    const db = ctx.orm;

    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    // Same primary sort value to force secondary sort to determine ordering.
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'C Title',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'A Title',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'D Title',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'B Title',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 1000,
    });

    const posts = await db.query.posts.findMany({
      orderBy: (posts: any, { desc, asc }: any) => [
        desc(posts.createdAt),
        asc(posts.title),
      ],
      offset: 1,
      limit: 2,
    });

    expect(posts).toHaveLength(2);
    expect(posts[0].title).toBe('B Title');
    expect(posts[1].title).toBe('C Title');
  });
});
