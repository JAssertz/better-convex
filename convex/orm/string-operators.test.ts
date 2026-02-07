/**
 * M5 String Operators - Comprehensive Test Suite
 *
 * Tests string matching operators:
 * - like() with % wildcards (prefix/suffix/substring)
 * - ilike() case-insensitive
 * - notLike() and notIlike() negation
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
// LIKE Operator Tests
// ============================================================================

describe('M5: like() operator', () => {
  test('like with %prefix% pattern matches substring', async ({ ctx }) => {
    const db = ctx.orm;

    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'JavaScript Guide',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Python Tutorial',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 2000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Advanced JavaScript',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 3000,
    });

    // Find posts with 'JavaScript' in title
    const posts = await db.query.posts.findMany({
      allowFullScan: true,
      where: { title: { like: '%JavaScript%' } },
    });

    expect(posts).toHaveLength(2);
    expect(posts.map((p: any) => p.title)).toContain('JavaScript Guide');
    expect(posts.map((p: any) => p.title)).toContain('Advanced JavaScript');
  });

  test('like with prefix% pattern matches prefix', async ({ ctx }) => {
    const db = ctx.orm;

    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'JavaScript Guide',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Python Tutorial',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 2000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Java Basics',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 3000,
    });

    // Find posts starting with 'Java'
    const posts = await db.query.posts.findMany({
      where: { title: { like: 'Java%' } },
    });

    expect(posts).toHaveLength(2);
    expect(posts.map((p: any) => p.title)).toContain('JavaScript Guide');
    expect(posts.map((p: any) => p.title)).toContain('Java Basics');
  });

  test('like with %suffix pattern matches suffix', async ({ ctx }) => {
    const db = ctx.orm;

    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Beginner Guide',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Advanced Tutorial',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 2000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Quick Guide',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 3000,
    });

    // Find posts ending with 'Guide'
    const posts = await db.query.posts.findMany({
      allowFullScan: true,
      where: { title: { like: '%Guide' } },
    });

    expect(posts).toHaveLength(2);
    expect(posts.map((p: any) => p.title)).toContain('Beginner Guide');
    expect(posts.map((p: any) => p.title)).toContain('Quick Guide');
  });

  test('like without wildcards matches exact', async ({ ctx }) => {
    const db = ctx.orm;

    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Exact Title',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Exact',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 2000,
    });

    // Find exact match
    const posts = await db.query.posts.findMany({
      allowFullScan: true,
      where: { title: { like: 'Exact Title' } },
    });

    expect(posts).toHaveLength(1);
    expect(posts[0].title).toBe('Exact Title');
  });

  test('notLike excludes pattern matches', async ({ ctx }) => {
    const db = ctx.orm;

    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'JavaScript Guide',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Python Tutorial',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 2000,
    });

    const posts = await db.query.posts.findMany({
      allowFullScan: true,
      where: { title: { notLike: '%JavaScript%' } },
    });

    expect(posts).toHaveLength(1);
    expect(posts[0].title).toBe('Python Tutorial');
  });
});

// ============================================================================
// ILIKE Operator Tests (Case-Insensitive)
// ============================================================================

describe('M5: ilike() operator', () => {
  test('ilike is case-insensitive', async ({ ctx }) => {
    const db = ctx.orm;

    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'JAVASCRIPT Guide',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Python Tutorial',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 2000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'javascript basics',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 3000,
    });

    // Find posts with 'javascript' (any case)
    const posts = await db.query.posts.findMany({
      allowFullScan: true,
      where: { title: { ilike: '%javascript%' } },
    });

    expect(posts).toHaveLength(2);
    expect(posts.map((p: any) => p.title)).toContain('JAVASCRIPT Guide');
    expect(posts.map((p: any) => p.title)).toContain('javascript basics');
  });

  test('notIlike excludes case-insensitive matches', async ({ ctx }) => {
    const db = ctx.orm;

    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'JavaScript Guide',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Python Tutorial',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 2000,
    });

    const posts = await db.query.posts.findMany({
      allowFullScan: true,
      where: { title: { notIlike: '%javascript%' } },
    });

    expect(posts).toHaveLength(1);
    expect(posts[0].title).toBe('Python Tutorial');
  });
});

// ============================================================================
// LIKE Prefix Pattern Tests
// ============================================================================

describe('M5: like() prefix pattern', () => {
  test('like matches prefix', async ({ ctx }) => {
    const db = ctx.orm;

    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'JavaScript Guide',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Python Tutorial',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 2000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Java Basics',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 3000,
    });

    // Find posts with prefix 'Java'
    const posts = await db.query.posts.findMany({
      allowFullScan: true,
      where: { title: { like: 'Java%' } },
    });

    expect(posts).toHaveLength(2);
    expect(posts.map((p: any) => p.title)).toContain('JavaScript Guide');
    expect(posts.map((p: any) => p.title)).toContain('Java Basics');
  });

  test('like is case-sensitive', async ({ ctx }) => {
    const db = ctx.orm;

    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'JavaScript Guide',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'javascript basics',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 2000,
    });

    // Find posts with prefix 'Java' (case-sensitive)
    const posts = await db.query.posts.findMany({
      allowFullScan: true,
      where: { title: { like: 'Java%' } },
    });

    expect(posts).toHaveLength(1);
    expect(posts[0].title).toBe('JavaScript Guide');
  });
});

// ============================================================================
// LIKE Suffix Pattern Tests
// ============================================================================

describe('M5: like() suffix pattern', () => {
  test('like matches suffix', async ({ ctx }) => {
    const db = ctx.orm;

    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Beginner Guide',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Advanced Tutorial',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 2000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Quick Guide',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 3000,
    });

    // Find posts ending with 'Guide'
    const posts = await db.query.posts.findMany({
      allowFullScan: true,
      where: { title: { like: '%Guide' } },
    });

    expect(posts).toHaveLength(2);
    expect(posts.map((p: any) => p.title)).toContain('Beginner Guide');
    expect(posts.map((p: any) => p.title)).toContain('Quick Guide');
  });

  test('like is case-sensitive', async ({ ctx }) => {
    const db = ctx.orm;

    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Quick Guide',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Quick guide',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 2000,
    });

    // Find posts ending with 'Guide' (case-sensitive)
    const posts = await db.query.posts.findMany({
      allowFullScan: true,
      where: { title: { like: '%Guide' } },
    });

    expect(posts).toHaveLength(1);
    expect(posts[0].title).toBe('Quick Guide');
  });
});

// ============================================================================
// LIKE Substring Pattern Tests
// ============================================================================

describe('M5: like() substring pattern', () => {
  test('like matches substring', async ({ ctx }) => {
    const db = ctx.orm;

    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'JavaScript Guide',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Python Tutorial',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 2000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Advanced JavaScript',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 3000,
    });

    // Find posts containing 'JavaScript'
    const posts = await db.query.posts.findMany({
      allowFullScan: true,
      where: { title: { like: '%JavaScript%' } },
    });

    expect(posts).toHaveLength(2);
    expect(posts.map((p: any) => p.title)).toContain('JavaScript Guide');
    expect(posts.map((p: any) => p.title)).toContain('Advanced JavaScript');
  });

  test('like is case-sensitive', async ({ ctx }) => {
    const db = ctx.orm;

    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'JavaScript Guide',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'javascript basics',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 2000,
    });

    // Find posts containing 'JavaScript' (case-sensitive)
    const posts = await db.query.posts.findMany({
      allowFullScan: true,
      where: { title: { like: '%JavaScript%' } },
    });

    expect(posts).toHaveLength(1);
    expect(posts[0].title).toBe('JavaScript Guide');
  });
});

// ============================================================================
// STARTSWITH / ENDSWITH / CONTAINS Operator Tests
// ============================================================================

describe('M5: startsWith operator', () => {
  test('startsWith matches prefix', async ({ ctx }) => {
    const db = ctx.orm;

    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'JavaScript Guide',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Java Basics',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 2000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Python Tutorial',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 3000,
    });

    const posts = await db.query.posts.findMany({
      where: { title: { startsWith: 'Java' } },
    });

    expect(posts).toHaveLength(2);
    expect(posts.map((p: any) => p.title)).toContain('JavaScript Guide');
    expect(posts.map((p: any) => p.title)).toContain('Java Basics');
  });
});

describe('M5: endsWith operator', () => {
  test('endsWith matches suffix', async ({ ctx }) => {
    const db = ctx.orm;

    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Beginner Guide',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Advanced Tutorial',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 2000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Quick Guide',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 3000,
    });

    const posts = await db.query.posts.findMany({
      allowFullScan: true,
      where: { title: { endsWith: 'Guide' } },
    });

    expect(posts).toHaveLength(2);
    expect(posts.map((p: any) => p.title)).toContain('Beginner Guide');
    expect(posts.map((p: any) => p.title)).toContain('Quick Guide');
  });
});

describe('M5: contains operator', () => {
  test('contains matches substring', async ({ ctx }) => {
    const db = ctx.orm;

    const user = await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
    });

    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'JavaScript Guide',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 1000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'TypeScript Handbook',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 2000,
    });
    await ctx.db.insert('posts', {
      text: 'test',
      numLikes: 0,
      type: 'text',
      title: 'Python Tutorial',
      content: 'Content',
      published: true,
      authorId: user,
      createdAt: 3000,
    });

    const posts = await db.query.posts.findMany({
      allowFullScan: true,
      where: { title: { contains: 'Script' } },
    });

    expect(posts).toHaveLength(2);
    expect(posts.map((p: any) => p.title)).toContain('JavaScript Guide');
    expect(posts.map((p: any) => p.title)).toContain('TypeScript Handbook');
  });
});
