/**
 * M3 Query Builder - Basic Functionality Tests
 *
 * Tests core query builder functionality:
 * - findMany() and findFirst() methods
 * - Type inference
 * - Promise-based execution
 * - Basic column selection
 */

import { createDatabase, extractRelationsConfig } from 'better-convex/orm';
import { it as baseIt, describe, expect } from 'vitest';
import schema, {
  ormPosts,
  ormPostsRelations,
  ormSchema,
  ormUsers,
  ormUsersRelations,
} from '../schema';
import { convexTest } from '../setup.testing';

// Test setup with convexTest
const it = baseIt.extend<{ ctx: any }>({
  ctx: async ({}, use) => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await use(ctx);
    });
  },
});

// Test schema and edges
const testSchema = ormSchema;
const edges = extractRelationsConfig({
  users: ormUsers,
  posts: ormPosts,
  usersRelations: ormUsersRelations,
  postsRelations: ormPostsRelations,
});

describe('M3 Query Builder', () => {
  describe('Builder Creation', () => {
    it('should create query builders for tables', ({ ctx }) => {
      const db = createDatabase(ctx.db, testSchema, edges);

      expect(db.query).toBeDefined();
      expect(db.query.users).toBeDefined();
      expect(typeof db.query.users.findMany).toBe('function');
      expect(typeof db.query.users.findFirst).toBe('function');
    });
  });

  describe('findMany()', () => {
    it('should return QueryPromise instance', ({ ctx }) => {
      const db = createDatabase(ctx.db, testSchema, edges);
      const query = db.query.users.findMany();

      expect(query).toBeDefined();
      expect(typeof query.then).toBe('function');
      expect(typeof query.catch).toBe('function');
      expect(typeof query.finally).toBe('function');
    });

    it('should execute query and return empty array', async ({ ctx }) => {
      const db = createDatabase(ctx.db, testSchema, edges);
      const result = await db.query.users.findMany();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it('should execute query and return results', async ({ ctx }) => {
      await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });
      await ctx.db.insert('users', {
        name: 'Bob',
        email: 'bob@example.com',
      });

      const db = createDatabase(ctx.db, testSchema, edges);
      const result = await db.query.users.findMany();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Alice');
      expect(result[1].name).toBe('Bob');
    });
  });

  describe('findFirst()', () => {
    it('should return first result', async ({ ctx }) => {
      await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });
      await ctx.db.insert('users', {
        name: 'Bob',
        email: 'bob@example.com',
      });

      const db = createDatabase(ctx.db, testSchema, edges);
      const result = await db.query.users.findFirst();

      expect(result).toBeDefined();
      expect(result?.name).toBe('Alice');
    });

    it('should return undefined for empty results', async ({ ctx }) => {
      const db = createDatabase(ctx.db, testSchema, edges);
      const result = await db.query.users.findFirst();

      expect(result).toBeUndefined();
    });
  });

  describe('Column Selection', () => {
    it('should select specific columns', async ({ ctx }) => {
      await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const db = createDatabase(ctx.db, testSchema, edges);
      const result = await db.query.users.findMany({
        columns: { name: true },
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).not.toHaveProperty('email');
    });
  });
});
