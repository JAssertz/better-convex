/**
 * M3 Query Builder - Basic Functionality Tests
 *
 * Tests core query builder functionality:
 * - findMany() and findFirst() methods
 * - Type inference
 * - Promise-based execution
 * - Basic column selection
 */

import { it as baseIt, describe, expect } from 'vitest';
import schema from '../schema';
import { convexTest, runCtx, type TestCtx } from '../setup.testing';

// Test setup with convexTest
const it = baseIt.extend<{ ctx: TestCtx }>({
  ctx: async ({}, use) => {
    const t = convexTest(schema);
    await t.run(async (baseCtx) => {
      const ctx = await runCtx(baseCtx);
      await use(ctx);
    });
  },
});

describe('M3 Query Builder', () => {
  describe('Builder Creation', () => {
    it('should create query builders for tables', ({ ctx }) => {
      const db = ctx.table;

      expect(db.query).toBeDefined();
      expect(db.query.users).toBeDefined();
      expect(typeof db.query.users.findMany).toBe('function');
      expect(typeof db.query.users.findFirst).toBe('function');
    });
  });

  describe('findMany()', () => {
    it('should return QueryPromise instance', ({ ctx }) => {
      const db = ctx.table;
      const query = db.query.users.findMany();

      expect(query).toBeDefined();
      expect(typeof query.then).toBe('function');
      expect(typeof query.catch).toBe('function');
      expect(typeof query.finally).toBe('function');
    });

    it('should execute query and return empty array', async ({ ctx }) => {
      const db = ctx.table;
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

      const db = ctx.table;
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

      const db = ctx.table;
      const result = await db.query.users.findFirst();

      expect(result).toBeDefined();
      expect(result?.name).toBe('Alice');
    });

    it('should return undefined for empty results', async ({ ctx }) => {
      const db = ctx.table;
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

      const db = ctx.table;
      const result = await db.query.users.findMany({
        columns: { name: true },
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).not.toHaveProperty('email');
    });

    it('should exclude columns when all selections are false', async ({
      ctx,
    }) => {
      await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const db = ctx.table;
      const result = await db.query.users.findMany({
        columns: { email: false },
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).not.toHaveProperty('email');
    });

    it('should return no table columns when columns is empty', async ({
      ctx,
    }) => {
      await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const db = ctx.table;
      const result = await db.query.users.findMany({
        columns: {},
      });

      expect(result).toHaveLength(1);
      expect(Object.keys(result[0])).toHaveLength(0);
    });
  });

  describe('Extras', () => {
    it('should compute extras on results', async ({ ctx }) => {
      await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const db = ctx.table;
      const result = await db.query.users.findMany({
        extras: {
          nameUpper: (row) => row.name.toUpperCase(),
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0].nameUpper).toBe('ALICE');
    });

    it('should preserve extras when columns is empty', async ({ ctx }) => {
      await ctx.db.insert('users', {
        name: 'Alice',
        email: 'alice@example.com',
      });

      const db = ctx.table;
      const result = await db.query.users.findMany({
        columns: {},
        extras: {
          nameUpper: (row) => row.name.toUpperCase(),
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('nameUpper', 'ALICE');
      expect(Object.keys(result[0])).toEqual(['nameUpper']);
    });
  });
});
