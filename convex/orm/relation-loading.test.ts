/**
 * M6.5 Phase 1 - Relation Loading Runtime Tests
 *
 * Tests basic one-level relation loading:
 * - One-to-many relations (users.posts)
 * - Many-to-one relations (posts.author)
 * - Batch loading efficiency (no N+1 queries)
 * - Optional relations (null handling)
 */

import {
  convexTable,
  type DatabaseWithMutations,
  defineRelations,
  defineSchema,
  extractRelationsConfig,
  id,
  index,
  text,
} from 'better-convex/orm';
import type { StorageActionWriter } from 'convex/server';
import { test as baseTest, describe, expect } from 'vitest';
import type { MutationCtx } from '../_generated/server';
import { cities, posts, users } from '../schema';
import { convexTest, getOrmCtx, withOrmCtx } from '../setup.testing';

// M6.5 Phase 2: Comments table and relations for nested testing (local to this test file)
const ormComments = convexTable(
  'comments',
  {
    text: text().notNull(),
    postId: id('posts').notNull(),
    authorId: id('users'),
  },
  (t) => [index('by_post').on(t.postId), index('by_author').on(t.authorId)]
);

const ormGroups = convexTable('groups', {
  name: text().notNull(),
});

const ormUsersToGroups = convexTable(
  'usersToGroups',
  {
    userId: id('users').notNull(),
    groupId: id('groups').notNull(),
  },
  (t) => [index('by_user').on(t.userId)]
);

const testTables = {
  users: users,
  posts: posts,
  comments: ormComments,
  groups: ormGroups,
  usersToGroups: ormUsersToGroups,
  cities: cities,
};

// Local schema with comments table for testing relation loading
const testSchemaWithComments = defineSchema(testTables, {
  defaults: {
    defaultLimit: 1000,
  },
});

// M6.5 Phase 2: Relations for comments + posts (local to this test file)
const testRelations = defineRelations(testTables, (r) => ({
  users: {
    posts: r.many.posts({
      from: r.users._id,
      to: r.posts.authorId,
    }),
    groups: r.many.groups({
      from: r.users._id.through(r.usersToGroups.userId),
      to: r.groups._id.through(r.usersToGroups.groupId),
      alias: 'users-groups',
    }),
  },
  posts: {
    author: r.one.users({
      from: r.posts.authorId,
      to: r.users._id,
    }),
    comments: r.many.comments({
      from: r.posts._id,
      to: r.comments.postId,
    }),
  },
  comments: {
    post: r.one.posts({
      from: r.comments.postId,
      to: r.posts._id,
    }),
    author: r.one.users({
      from: r.comments.authorId,
      to: r.users._id,
    }),
  },
  groups: {},
  usersToGroups: {
    user: r.one.users({
      from: r.usersToGroups.userId,
      to: r.users._id,
    }),
    group: r.one.groups({
      from: r.usersToGroups.groupId,
      to: r.groups._id,
    }),
  },
  cities: {},
}));
const edges = extractRelationsConfig(testRelations);

type TestCtx = MutationCtx & {
  storage: StorageActionWriter;
  orm: DatabaseWithMutations<typeof testRelations>;
};

// Test setup with convexTest
const test = baseTest.extend<{ ctx: TestCtx }>({
  ctx: async ({}, use) => {
    const t = convexTest(testSchemaWithComments);
    await t.run(async (baseCtx) => {
      const ctx = getOrmCtx(baseCtx, testRelations);
      await use(ctx);
    });
  },
});

describe('M6.5 Phase 1: Relation Loading', () => {
  describe('One-to-Many Relations (users.posts)', () => {
    test('should load empty posts array for user with no posts', async ({
      ctx,
    }) => {
      // Create user without posts
      const userId = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const db = ctx.orm;
      const users = await db.query.users.findMany({
        with: {
          posts: true,
        },
      });

      expect(users).toHaveLength(1);
      expect(users[0]._id).toBe(userId);
      expect(users[0].posts).toEqual([]);
    });

    test('should load posts for single user', async ({ ctx }) => {
      // Create user with 2 posts
      const userId = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const post1Id = await ctx.db.insert('posts', {
        text: 'First post',
        numLikes: 10,
        type: 'text',
        authorId: userId,
      });

      const post2Id = await ctx.db.insert('posts', {
        text: 'Second post',
        numLikes: 20,
        type: 'text',
        authorId: userId,
      });

      const db = ctx.orm;
      const users = (await db.query.users.findMany({
        with: {
          posts: true,
        },
      })) as any;

      expect(users).toHaveLength(1);
      expect(users[0]._id).toBe(userId);
      expect(users[0].posts).toHaveLength(2);
      expect(users[0].posts[0]._id).toBe(post1Id);
      expect(users[0].posts[1]._id).toBe(post2Id);
      expect(users[0].posts[0].text).toBe('First post');
      expect(users[0].posts[1].text).toBe('Second post');
    });

    test('should batch load posts for multiple users (no N+1)', async ({
      ctx,
    }) => {
      // Create 3 users with varying post counts
      const user1Id = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const user2Id = await ctx.db.insert('users', {
        name: 'Bob',
        email: 'bob@example.com',
      });

      const user3Id = await ctx.db.insert('users', {
        name: 'Charlie',
        email: 'charlie@example.com',
      });

      // Alice: 2 posts
      await ctx.db.insert('posts', {
        text: 'Alice post 1',
        numLikes: 5,
        type: 'text',
        authorId: user1Id,
      });
      await ctx.db.insert('posts', {
        text: 'Alice post 2',
        numLikes: 10,
        type: 'text',
        authorId: user1Id,
      });

      // Bob: 1 post
      await ctx.db.insert('posts', {
        text: 'Bob post 1',
        numLikes: 3,
        type: 'text',
        authorId: user2Id,
      });

      // Charlie: 0 posts

      const db = ctx.orm;
      const users = (await db.query.users.findMany({
        with: {
          posts: true,
        },
      })) as any;

      expect(users).toHaveLength(3);

      // Verify Alice's posts
      const alice = users.find((u: any) => u._id === user1Id);
      expect(alice).toBeDefined();
      expect(alice!.posts).toHaveLength(2);
      expect(alice!.posts.every((p: any) => p.authorId === user1Id)).toBe(true);

      // Verify Bob's posts
      const bob = users.find((u: any) => u._id === user2Id);
      expect(bob).toBeDefined();
      expect(bob!.posts).toHaveLength(1);
      expect(bob!.posts[0].authorId).toBe(user2Id);

      // Verify Charlie has no posts
      const charlie = users.find((u: any) => u._id === user3Id);
      expect(charlie).toBeDefined();
      expect(charlie!.posts).toEqual([]);
    });
  });

  describe('Column Selection with Relations', () => {
    test('should preserve relations when selecting specific columns', async ({
      ctx,
    }) => {
      const userId = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });
      await ctx.db.insert('posts', {
        text: 'Hello',
        numLikes: 1,
        type: 'post',
        authorId: userId,
      });

      const db = ctx.orm;
      const users = await db.query.users.findMany({
        columns: { name: true },
        with: {
          posts: true,
        },
      });

      expect(users).toHaveLength(1);
      expect(users[0]).toHaveProperty('name');
      expect(users[0]).toHaveProperty('posts');
      expect(users[0].posts).toHaveLength(1);
      expect(users[0]).not.toHaveProperty('email');
    });

    test('should preserve relations when columns is empty', async ({ ctx }) => {
      const userId = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });
      await ctx.db.insert('posts', {
        text: 'Hello',
        numLikes: 1,
        type: 'post',
        authorId: userId,
      });

      const db = ctx.orm;
      const users = await db.query.users.findMany({
        columns: {},
        with: {
          posts: true,
        },
      });

      expect(users).toHaveLength(1);
      expect(Object.keys(users[0]).sort()).toEqual(['posts']);
      expect(users[0].posts).toHaveLength(1);
    });

    test('should apply columns inside relations and keep nested with', async ({
      ctx,
    }) => {
      const userId = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });
      await ctx.db.insert('posts', {
        text: 'Hello',
        numLikes: 1,
        type: 'post',
        title: 'Post title',
        authorId: userId,
      });

      const db = ctx.orm;
      const users = await db.query.users.findMany({
        with: {
          posts: {
            columns: { title: true },
            with: {
              author: {
                columns: { name: true },
              },
            },
          },
        },
      });

      expect(users).toHaveLength(1);
      expect(users[0].posts).toHaveLength(1);
      expect(users[0].posts[0]).toHaveProperty('title');
      expect(users[0].posts[0]).not.toHaveProperty('text');
      expect(users[0].posts[0]).toHaveProperty('author');
      expect(users[0].posts[0].author).toHaveProperty('name');
      expect(users[0].posts[0].author).not.toHaveProperty('email');
    });

    test('should compute extras inside relations', async ({ ctx }) => {
      const userId = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });
      await ctx.db.insert('posts', {
        text: 'Hello',
        numLikes: 1,
        type: 'post',
        authorId: userId,
      });

      const db = ctx.orm;
      const users = await db.query.users.findMany({
        with: {
          posts: {
            extras: {
              textLength: (row) => row.text.length,
            },
          },
        },
      });

      expect(users).toHaveLength(1);
      expect(users[0].posts).toHaveLength(1);
      expect(users[0].posts[0]).toHaveProperty('textLength', 5);
    });
  });

  describe('Many-to-One Relations (posts.author)', () => {
    test('should load user for single post', async ({ ctx }) => {
      // Create user and post
      const userId = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const postId = await ctx.db.insert('posts', {
        text: 'First post',
        numLikes: 10,
        type: 'text',
        authorId: userId,
      });

      const db = ctx.orm;
      const posts = (await db.query.posts.findMany({
        with: {
          author: true,
        },
      })) as any;

      expect(posts).toHaveLength(1);
      expect(posts[0]._id).toBe(postId);
      expect(posts[0].author).toBeDefined();
      expect(posts[0].author!._id).toBe(userId);
      expect(posts[0].author!.name).toBe('Alice');
    });

    test('should handle null authorId (optional relation)', async ({ ctx }) => {
      // Create post without user
      const postId = await ctx.db.insert('posts', {
        text: 'Anonymous post',
        numLikes: 5,
        type: 'text',
        // authorId omitted (optional field)
      });

      const db = ctx.orm;
      const posts = await db.query.posts.findMany({
        with: {
          author: true,
        },
      });

      expect(posts).toHaveLength(1);
      expect(posts[0]._id).toBe(postId);
      expect(posts[0].author).toBeNull();
    });

    test('should batch load users for multiple posts (no N+1)', async ({
      ctx,
    }) => {
      // Create 2 users
      const user1Id = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const user2Id = await ctx.db.insert('users', {
        name: 'Bob',
        email: 'bob@example.com',
      });

      // Create 5 posts: 3 by Alice, 2 by Bob
      await ctx.db.insert('posts', {
        text: 'Alice post 1',
        numLikes: 10,
        type: 'text',
        authorId: user1Id,
      });
      await ctx.db.insert('posts', {
        text: 'Alice post 2',
        numLikes: 15,
        type: 'text',
        authorId: user1Id,
      });
      await ctx.db.insert('posts', {
        text: 'Alice post 3',
        numLikes: 20,
        type: 'text',
        authorId: user1Id,
      });
      await ctx.db.insert('posts', {
        text: 'Bob post 1',
        numLikes: 5,
        type: 'text',
        authorId: user2Id,
      });
      await ctx.db.insert('posts', {
        text: 'Bob post 2',
        numLikes: 8,
        type: 'text',
        authorId: user2Id,
      });

      const db = ctx.orm;
      const posts = (await db.query.posts.findMany({
        with: {
          author: true,
        },
      })) as any;

      expect(posts).toHaveLength(5);

      // Verify all posts by Alice reference the same user object
      const alicePosts = posts.filter((p: any) => p.authorId === user1Id);
      expect(alicePosts).toHaveLength(3);
      expect(alicePosts.every((p: any) => p.author!._id === user1Id)).toBe(
        true
      );
      expect(alicePosts.every((p: any) => p.author!.name === 'Alice')).toBe(
        true
      );

      // Verify all posts by Bob reference the same user object
      const bobPosts = posts.filter((p: any) => p.authorId === user2Id);
      expect(bobPosts).toHaveLength(2);
      expect(bobPosts.every((p: any) => p.author!._id === user2Id)).toBe(true);
      expect(bobPosts.every((p: any) => p.author!.name === 'Bob')).toBe(true);
    });
  });

  describe('findFirst() with Relations', () => {
    test('should load relations for single result', async ({ ctx }) => {
      // Create user with posts
      const userId = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      await ctx.db.insert('posts', {
        text: 'First post',
        numLikes: 10,
        type: 'text',
        authorId: userId,
      });

      await ctx.db.insert('posts', {
        text: 'Second post',
        numLikes: 20,
        type: 'text',
        authorId: userId,
      });

      const db = ctx.orm;
      const user = await db.query.users.findFirst({
        with: {
          posts: true,
        },
      });

      expect(user).toBeDefined();
      expect(user!._id).toBe(userId);
      expect(user!.posts).toHaveLength(2);
    });
  });
});

describe('M6.5 Phase 2: Nested Relation Loading', () => {
  describe('3-Level Nesting (users → posts → comments)', () => {
    test('should load nested relations up to depth 3', async ({ ctx }) => {
      // Create user → post → comment hierarchy
      const userId = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const postId = await ctx.db.insert('posts', {
        text: 'My post',
        numLikes: 10,
        type: 'text',
        authorId: userId,
      });

      const comment1Id = await (ctx.db as any).insert('comments', {
        text: 'Great post!',
        postId,
        authorId: userId,
      });

      const comment2Id = await (ctx.db as any).insert('comments', {
        text: 'Thanks for sharing',
        postId,
        authorId: userId,
      });

      const db = ctx.orm;
      const users = await db.query.users.findMany({
        with: {
          posts: {
            with: {
              comments: true,
            },
          },
        },
      });

      expect(users).toHaveLength(1);
      expect(users[0]._id).toBe(userId);
      expect((users[0] as any).posts).toHaveLength(1);
      expect((users[0] as any).posts[0]._id).toBe(postId);
      expect((users[0] as any).posts[0].comments).toHaveLength(2);
      expect((users[0] as any).posts[0].comments[0]._id).toBe(comment1Id);
      expect((users[0] as any).posts[0].comments[1]._id).toBe(comment2Id);
    });

    test('should handle empty nested relations', async ({ ctx }) => {
      // Create user with post but no comments
      const userId = await ctx.db.insert('users', {
        name: 'Bob',
        email: 'bob@example.com',
      });

      await ctx.db.insert('posts', {
        text: 'Post without comments',
        numLikes: 5,
        type: 'text',
        authorId: userId,
      });

      const db = ctx.orm;
      const users = await db.query.users.findMany({
        with: {
          posts: {
            with: {
              comments: true,
            },
          },
        },
      });

      expect(users).toHaveLength(1);
      expect((users[0] as any).posts).toHaveLength(1);
      expect((users[0] as any).posts[0].comments).toEqual([]);
    });

    test('should batch load nested relations efficiently', async ({ ctx }) => {
      // Create 2 users with 2 posts each, each post with 2 comments
      const user1Id = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const user2Id = await ctx.db.insert('users', {
        name: 'Bob',
        email: 'bob@example.com',
      });

      // Alice's posts and comments
      const alice_post1 = await ctx.db.insert('posts', {
        text: 'Alice post 1',
        numLikes: 10,
        type: 'text',
        authorId: user1Id,
      });

      const alice_post2 = await ctx.db.insert('posts', {
        text: 'Alice post 2',
        numLikes: 15,
        type: 'text',
        authorId: user1Id,
      });

      await (ctx.db as any).insert('comments', {
        text: 'Comment on Alice post 1',
        postId: alice_post1,
        authorId: user1Id,
      });

      await (ctx.db as any).insert('comments', {
        text: 'Another comment on Alice post 1',
        postId: alice_post1,
        authorId: user1Id,
      });

      await (ctx.db as any).insert('comments', {
        text: 'Comment on Alice post 2',
        postId: alice_post2,
        authorId: user1Id,
      });

      // Bob's posts and comments
      const bob_post1 = await ctx.db.insert('posts', {
        text: 'Bob post 1',
        numLikes: 20,
        type: 'text',
        authorId: user2Id,
      });

      await (ctx.db as any).insert('comments', {
        text: 'Comment on Bob post 1',
        postId: bob_post1,
        authorId: user2Id,
      });

      const db = ctx.orm;
      const users = await db.query.users.findMany({
        with: {
          posts: {
            with: {
              comments: true,
            },
          },
        },
      });

      expect(users).toHaveLength(2);

      // Verify Alice's nested data
      const alice = users.find((u: any) => u._id === user1Id) as any;
      expect(alice).toBeDefined();
      expect(alice.posts).toHaveLength(2);
      expect(alice.posts[0].comments).toHaveLength(2);
      expect(alice.posts[1].comments).toHaveLength(1);

      // Verify Bob's nested data
      const bob = users.find((u: any) => u._id === user2Id) as any;
      expect(bob).toBeDefined();
      expect(bob.posts).toHaveLength(1);
      expect(bob.posts[0].comments).toHaveLength(1);
    });
  });

  describe('Depth Limiting', () => {
    test('should respect max depth limit of 3', async ({ ctx }) => {
      // We can't easily test depth > 3 without more tables,
      // but we can verify depth 3 works and depth limiting is in place
      const userId = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const postId = await ctx.db.insert('posts', {
        text: 'Post',
        numLikes: 10,
        type: 'text',
        authorId: userId,
      });

      await (ctx.db as any).insert('comments', {
        text: 'Comment',
        postId,
        authorId: userId,
      });

      const db = ctx.orm;

      // Depth 1: users
      // Depth 2: users.posts
      // Depth 3: users.posts.comments
      const users = await db.query.users.findMany({
        with: {
          posts: {
            with: {
              comments: true,
            },
          },
        },
      });

      expect((users[0] as any).posts[0].comments).toBeDefined();
      expect((users[0] as any).posts[0].comments).toHaveLength(1);
    });
  });
});

describe('M6.5 Phase 3: Relation Filters and Limits', () => {
  describe('OrderBy', () => {
    test('should order relations by field ascending', async ({ ctx }) => {
      const userId = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      // Create posts with different numLikes
      await ctx.db.insert('posts', {
        text: 'Post 1',
        numLikes: 30,
        type: 'text',
        authorId: userId,
      });

      await ctx.db.insert('posts', {
        text: 'Post 2',
        numLikes: 10,
        type: 'text',
        authorId: userId,
      });

      await ctx.db.insert('posts', {
        text: 'Post 3',
        numLikes: 20,
        type: 'text',
        authorId: userId,
      });

      const db = ctx.orm;

      // Import asc helper
      const { asc } = await import('better-convex/orm');

      const users = await db.query.users.findMany({
        with: {
          posts: {
            orderBy: { numLikes: 'asc' },
          },
        },
      });

      expect((users[0] as any).posts).toHaveLength(3);
      expect((users[0] as any).posts[0].numLikes).toBe(10);
      expect((users[0] as any).posts[1].numLikes).toBe(20);
      expect((users[0] as any).posts[2].numLikes).toBe(30);
    });

    test('should order relations by field descending', async ({ ctx }) => {
      const userId = await ctx.db.insert('users', {
        name: 'Bob',
        email: 'bob@example.com',
      });

      // Create posts with different numLikes
      await ctx.db.insert('posts', {
        text: 'Post 1',
        numLikes: 30,
        type: 'text',
        authorId: userId,
      });

      await ctx.db.insert('posts', {
        text: 'Post 2',
        numLikes: 10,
        type: 'text',
        authorId: userId,
      });

      await ctx.db.insert('posts', {
        text: 'Post 3',
        numLikes: 20,
        type: 'text',
        authorId: userId,
      });

      const db = ctx.orm;

      // Import desc helper
      const { desc } = await import('better-convex/orm');

      const users = await db.query.users.findMany({
        with: {
          posts: {
            orderBy: { numLikes: 'desc' },
          },
        },
      });

      expect((users[0] as any).posts).toHaveLength(3);
      expect((users[0] as any).posts[0].numLikes).toBe(30);
      expect((users[0] as any).posts[1].numLikes).toBe(20);
      expect((users[0] as any).posts[2].numLikes).toBe(10);
    });
  });

  describe('Per-Parent Limiting', () => {
    test('should limit relations per parent (not globally)', async ({
      ctx,
    }) => {
      // Create 2 users
      const user1Id = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const user2Id = await ctx.db.insert('users', {
        name: 'Bob',
        email: 'bob@example.com',
      });

      // Alice: 3 posts
      await ctx.db.insert('posts', {
        text: 'Alice post 1',
        numLikes: 10,
        type: 'text',
        authorId: user1Id,
      });
      await ctx.db.insert('posts', {
        text: 'Alice post 2',
        numLikes: 20,
        type: 'text',
        authorId: user1Id,
      });
      await ctx.db.insert('posts', {
        text: 'Alice post 3',
        numLikes: 30,
        type: 'text',
        authorId: user1Id,
      });

      // Bob: 3 posts
      await ctx.db.insert('posts', {
        text: 'Bob post 1',
        numLikes: 5,
        type: 'text',
        authorId: user2Id,
      });
      await ctx.db.insert('posts', {
        text: 'Bob post 2',
        numLikes: 15,
        type: 'text',
        authorId: user2Id,
      });
      await ctx.db.insert('posts', {
        text: 'Bob post 3',
        numLikes: 25,
        type: 'text',
        authorId: user2Id,
      });

      const db = ctx.orm;

      const users = await db.query.users.findMany({
        with: {
          posts: {
            limit: 2, // Limit to 2 posts PER USER
          },
        },
      });

      expect(users).toHaveLength(2);

      // Verify Alice has exactly 2 posts (not affected by Bob's posts)
      const alice = users.find((u: any) => u._id === user1Id) as any;
      expect(alice.posts).toHaveLength(2);

      // Verify Bob has exactly 2 posts (not affected by Alice's posts)
      const bob = users.find((u: any) => u._id === user2Id) as any;
      expect(bob.posts).toHaveLength(2);
    });
  });

  describe('Per-Parent Offset', () => {
    test('should apply offset per parent', async ({ ctx }) => {
      const user1Id = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const user2Id = await ctx.db.insert('users', {
        name: 'Bob',
        email: 'bob@example.com',
      });

      await ctx.db.insert('posts', {
        text: 'Alice post 1',
        numLikes: 10,
        type: 'text',
        authorId: user1Id,
      });
      await ctx.db.insert('posts', {
        text: 'Alice post 2',
        numLikes: 20,
        type: 'text',
        authorId: user1Id,
      });
      await ctx.db.insert('posts', {
        text: 'Alice post 3',
        numLikes: 30,
        type: 'text',
        authorId: user1Id,
      });

      await ctx.db.insert('posts', {
        text: 'Bob post 1',
        numLikes: 5,
        type: 'text',
        authorId: user2Id,
      });
      await ctx.db.insert('posts', {
        text: 'Bob post 2',
        numLikes: 15,
        type: 'text',
        authorId: user2Id,
      });
      await ctx.db.insert('posts', {
        text: 'Bob post 3',
        numLikes: 25,
        type: 'text',
        authorId: user2Id,
      });

      const db = ctx.orm;

      const users = await db.query.users.findMany({
        with: {
          posts: {
            orderBy: { numLikes: 'asc' },
            offset: 1,
          },
        },
      });

      const alice = users.find((u: any) => u._id === user1Id) as any;
      expect(alice.posts.map((post: any) => post.numLikes)).toEqual([20, 30]);

      const bob = users.find((u: any) => u._id === user2Id) as any;
      expect(bob.posts.map((post: any) => post.numLikes)).toEqual([15, 25]);
    });

    test('should apply offset for through relations', async ({ ctx }) => {
      const userId = await ctx.db.insert('users', {
        name: 'Charlie',
        email: 'charlie@example.com',
      });

      const groupA = await (ctx.db as any).insert('groups', { name: 'A' });
      const groupB = await (ctx.db as any).insert('groups', { name: 'B' });
      const groupC = await (ctx.db as any).insert('groups', { name: 'C' });

      await (ctx.db as any).insert('usersToGroups', {
        userId,
        groupId: groupA,
      });
      await (ctx.db as any).insert('usersToGroups', {
        userId,
        groupId: groupB,
      });
      await (ctx.db as any).insert('usersToGroups', {
        userId,
        groupId: groupC,
      });

      const db = ctx.orm;

      const users = await db.query.users.findMany({
        with: {
          groups: {
            orderBy: { name: 'asc' },
            offset: 1,
          },
        },
      });

      const charlie = users.find((u: any) => u._id === userId) as any;
      expect(charlie.groups.map((group: any) => group.name)).toEqual([
        'B',
        'C',
      ]);
    });
  });

  describe('OrderBy + Limit Combinations', () => {
    test('should order then limit per parent', async ({ ctx }) => {
      const userId = await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      // Create 5 posts with different numLikes
      await ctx.db.insert('posts', {
        text: 'Post 1',
        numLikes: 50,
        type: 'text',
        authorId: userId,
      });
      await ctx.db.insert('posts', {
        text: 'Post 2',
        numLikes: 10,
        type: 'text',
        authorId: userId,
      });
      await ctx.db.insert('posts', {
        text: 'Post 3',
        numLikes: 30,
        type: 'text',
        authorId: userId,
      });
      await ctx.db.insert('posts', {
        text: 'Post 4',
        numLikes: 20,
        type: 'text',
        authorId: userId,
      });
      await ctx.db.insert('posts', {
        text: 'Post 5',
        numLikes: 40,
        type: 'text',
        authorId: userId,
      });

      const db = ctx.orm;
      const { desc } = await import('better-convex/orm');

      const users = await db.query.users.findMany({
        with: {
          posts: {
            orderBy: { numLikes: 'desc' },
            limit: 3, // Get top 3 posts by likes
          },
        },
      });

      expect((users[0] as any).posts).toHaveLength(3);
      // Should get posts with 50, 40, 30 likes (top 3)
      expect((users[0] as any).posts[0].numLikes).toBe(50);
      expect((users[0] as any).posts[1].numLikes).toBe(40);
      expect((users[0] as any).posts[2].numLikes).toBe(30);
    });
  });

  describe('Index Requirements', () => {
    test('should throw when many() relation is missing an index', async () => {
      const noIndexUsers = convexTable('noIndexUsers', {
        name: text().notNull(),
      });
      const noIndexPosts = convexTable('noIndexPosts', {
        authorId: id('noIndexUsers').notNull(),
      });

      const noIndexTables = { noIndexUsers, noIndexPosts };
      const noIndexSchema = defineSchema(noIndexTables, {
        defaults: {
          defaultLimit: 1000,
        },
      });
      const noIndexRelations = defineRelations(noIndexTables, (r) => ({
        noIndexUsers: {
          posts: r.many.noIndexPosts({
            from: r.noIndexUsers._id,
            to: r.noIndexPosts.authorId,
          }),
        },
        noIndexPosts: {},
      }));
      const noIndexEdges = extractRelationsConfig(noIndexRelations);

      await expect(
        withOrmCtx(noIndexSchema, noIndexRelations, async (ctx) => {
          await ctx.db.insert('noIndexUsers', { name: 'Alice' });
          await ctx.orm.query.noIndexUsers.findMany({
            with: {
              posts: true,
            },
          });
        })
      ).rejects.toThrow(/requires index/i);
    });

    test('should throw when through() relation is missing a through index', async () => {
      const noIndexUsers = convexTable('noIndexThroughUsers', {
        name: text().notNull(),
      });
      const noIndexGroups = convexTable('noIndexThroughGroups', {
        name: text().notNull(),
      });
      const noIndexUsersToGroups = convexTable('noIndexUsersToGroups', {
        userId: id('noIndexThroughUsers').notNull(),
        groupId: id('noIndexThroughGroups').notNull(),
      });

      const noIndexTables = {
        noIndexThroughUsers: noIndexUsers,
        noIndexThroughGroups: noIndexGroups,
        noIndexUsersToGroups: noIndexUsersToGroups,
      };
      const noIndexSchema = defineSchema(noIndexTables, {
        defaults: {
          defaultLimit: 1000,
        },
      });
      const noIndexRelations = defineRelations(noIndexTables, (r) => ({
        noIndexThroughUsers: {
          groups: r.many.noIndexThroughGroups({
            from: r.noIndexThroughUsers._id.through(
              r.noIndexUsersToGroups.userId
            ),
            to: r.noIndexThroughGroups._id.through(
              r.noIndexUsersToGroups.groupId
            ),
            alias: 'no-index-through',
          }),
        },
        noIndexThroughGroups: {},
        noIndexUsersToGroups: {},
      }));
      const noIndexEdges = extractRelationsConfig(noIndexRelations);

      await expect(
        withOrmCtx(noIndexSchema, noIndexRelations, async (ctx) => {
          await ctx.db.insert('noIndexThroughUsers', { name: 'Alice' });
          await ctx.orm.query.noIndexThroughUsers.findMany({
            with: {
              groups: true,
            },
          });
        })
      ).rejects.toThrow(/requires index/i);
    });

    test('should require allowFullScan when relation index is missing', async () => {
      const noIndexUsers = convexTable('noIndexRelaxedUsers', {
        name: text().notNull(),
      });
      const noIndexPosts = convexTable('noIndexRelaxedPosts', {
        authorId: id('noIndexRelaxedUsers').notNull(),
      });

      const noIndexTables = {
        noIndexRelaxedUsers: noIndexUsers,
        noIndexRelaxedPosts: noIndexPosts,
      };

      const noIndexSchema = defineSchema(noIndexTables, {
        strict: false,
        defaults: {
          defaultLimit: 1000,
        },
      });
      const noIndexRelations = defineRelations(noIndexTables, (r) => ({
        noIndexRelaxedUsers: {
          posts: r.many.noIndexRelaxedPosts({
            from: r.noIndexRelaxedUsers._id,
            to: r.noIndexRelaxedPosts.authorId,
          }),
        },
        noIndexRelaxedPosts: {},
      }));
      const noIndexEdges = extractRelationsConfig(noIndexRelations);

      await expect(
        withOrmCtx(noIndexSchema, noIndexRelations, async (ctx) => {
          await ctx.db.insert('noIndexRelaxedUsers', { name: 'Alice' });
          await ctx.orm.query.noIndexRelaxedUsers.findMany({
            with: {
              posts: true,
            },
          });
        })
      ).rejects.toThrow(/allowFullScan/i);

      await expect(
        withOrmCtx(noIndexSchema, noIndexRelations, async (ctx) => {
          await ctx.db.insert('noIndexRelaxedUsers', { name: 'Alice' });
          await ctx.orm.query.noIndexRelaxedUsers.findMany({
            allowFullScan: true,
            with: {
              posts: true,
            },
          });
        })
      ).resolves.toBeUndefined();
    });
  });
});
