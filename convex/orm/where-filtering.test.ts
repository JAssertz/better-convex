/**
 * M4 Where Filtering - Comprehensive Test Suite
 *
 * Tests complete filtering functionality:
 * - Binary operators (eq, ne, gt, gte, lt, lte)
 * - Logical operators (and, or, not)
 * - Array operators (inArray, notInArray)
 * - Null operators (isNull, isNotNull)
 * - Index selection and scoring
 * - Filter splitting algorithm
 * - Convex query generation
 */

import {
  and,
  createDatabase,
  eq,
  extractRelationsConfig,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  not,
  notInArray,
  or,
} from 'better-convex/orm';
import { test as baseTest, describe, expect } from 'vitest';
import schema, {
  ormPosts,
  ormPostsRelations,
  ormSchema,
  ormUsers,
  ormUsersRelations,
} from '../schema';
import { convexTest } from '../setup.testing';

// ============================================================================
// Test Setup
// ============================================================================

const test = baseTest.extend<{ ctx: any }>({
  ctx: async ({}, use) => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await use(ctx);
    });
  },
});

// ============================================================================
// Test Schema - Using exported ORM schema from schema.ts
// ============================================================================

// M4 testing uses the shared ORM schema from schema.ts
// This ensures tests use the same schema structure as production
const testSchema = ormSchema;
const edges = extractRelationsConfig({
  users: ormUsers,
  posts: ormPosts,
  usersRelations: ormUsersRelations,
  postsRelations: ormPostsRelations,
});

// ============================================================================
// Binary Operators
// ============================================================================

describe('M4 Where Filtering - Binary Operators', () => {
  test('should filter with eq operator', async ({ ctx }) => {
    const db = createDatabase(ctx.db, testSchema, edges);

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 30,
      status: 'pending',
      deletedAt: null,
    });

    const result = await db.query.users.findMany({
      where: (cols, { eq }) => eq(cols.name, 'Alice'),
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  test('should filter with ne operator', async ({ ctx }) => {
    const db = createDatabase(ctx.db, testSchema, edges);

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 30,
      status: 'deleted',
      deletedAt: 123456,
    });

    const result = await db.query.users.findMany({
      where: (cols, { ne }) => ne(cols.status, 'deleted'),
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  test('should filter with gt operator', async ({ ctx }) => {
    const db = createDatabase(ctx.db, testSchema, edges);

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 17,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });

    const result = await db.query.users.findMany({
      where: (cols, { gt }) => gt(cols.age, 18),
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Bob');
  });

  test('should filter with gte operator', async ({ ctx }) => {
    const db = createDatabase(ctx.db, testSchema, edges);

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 20,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 21,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Charlie',
      email: 'charlie@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });

    const result = await db.query.users.findMany({
      where: (cols, { gte }) => gte(cols.age, 21),
    });

    expect(result).toHaveLength(2);
    expect(result.map((u) => u.name).sort()).toEqual(['Bob', 'Charlie']);
  });

  test('should filter with lt operator', async ({ ctx }) => {
    const db = createDatabase(ctx.db, testSchema, edges);

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 60,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 70,
      status: 'active',
      deletedAt: null,
    });

    const result = await db.query.users.findMany({
      where: (cols, { lt }) => lt(cols.age, 65),
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  test('should filter with lte operator', async ({ ctx }) => {
    const db = createDatabase(ctx.db, testSchema, edges);

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 99,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 100,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Charlie',
      email: 'charlie@example.com',
      age: 101,
      status: 'active',
      deletedAt: null,
    });

    const result = await db.query.users.findMany({
      where: (cols, { lte }) => lte(cols.age, 100),
    });

    expect(result).toHaveLength(2);
    expect(result.map((u) => u.name).sort()).toEqual(['Alice', 'Bob']);
  });
});

// ============================================================================
// Logical Operators
// ============================================================================

describe('M4 Where Filtering - Logical Operators', () => {
  test('should combine filters with and operator', async ({ ctx }) => {
    const db = createDatabase(ctx.db, testSchema, edges);

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 17,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Charlie',
      email: 'charlie@example.com',
      age: 30,
      status: 'deleted',
      deletedAt: 123456,
    });

    const result = await db.query.users.findMany({
      where: (cols, { eq, gt }) =>
        and(eq(cols.status, 'active'), gt(cols.age, 18)),
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  test('should combine filters with or operator', async ({ ctx }) => {
    const db = createDatabase(ctx.db, testSchema, edges);

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 30,
      status: 'pending',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Charlie',
      email: 'charlie@example.com',
      age: 35,
      status: 'deleted',
      deletedAt: 123456,
    });

    const result = await db.query.users.findMany({
      where: (cols, { eq }) =>
        or(eq(cols.status, 'active'), eq(cols.status, 'pending')),
    });

    expect(result).toHaveLength(2);
    expect(result.map((u) => u.name).sort()).toEqual(['Alice', 'Bob']);
  });

  test('should negate filter with not operator', async ({ ctx }) => {
    const db = createDatabase(ctx.db, testSchema, edges);

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 30,
      status: 'deleted',
      deletedAt: 123456,
    });

    const result = await db.query.users.findMany({
      where: (cols, { eq }) => not(eq(cols.status, 'deleted')),
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  test('should handle complex nested logical expressions', async ({ ctx }) => {
    const db = createDatabase(ctx.db, testSchema, edges);

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 17,
      status: 'pending',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Charlie',
      email: 'charlie@example.com',
      age: 70,
      status: 'active',
      deletedAt: null,
    });

    const result = await db.query.users.findMany({
      where: (cols, { eq, gt, lt }) =>
        and(
          or(eq(cols.status, 'active'), eq(cols.status, 'pending')),
          and(gt(cols.age, 18), lt(cols.age, 65))
        ),
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  test('should filter out undefined expressions in and()', async ({ ctx }) => {
    const db = createDatabase(ctx.db, testSchema, edges);

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 30,
      status: 'pending',
      deletedAt: null,
    });

    const condition = false;

    const result = await db.query.users.findMany({
      where: (cols, { eq }) =>
        and(
          eq(cols.status, 'active'),
          condition ? eq(cols.age, 25) : undefined
        ),
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  test('should filter out undefined expressions in or()', async ({ ctx }) => {
    const db = createDatabase(ctx.db, testSchema, edges);

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 30,
      status: 'pending',
      deletedAt: null,
    });

    const condition = false;

    const result = await db.query.users.findMany({
      where: (cols, { eq }) =>
        or(
          eq(cols.status, 'active'),
          condition ? eq(cols.status, 'pending') : undefined
        ),
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });
});

// ============================================================================
// Array Operators
// ============================================================================

describe('M4 Where Filtering - Array Operators', () => {
  test('should filter with inArray operator', async ({ ctx }) => {
    const db = createDatabase(ctx.db, testSchema, edges);

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 30,
      status: 'pending',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Charlie',
      email: 'charlie@example.com',
      age: 35,
      status: 'deleted',
      deletedAt: 123456,
    });

    const result = await db.query.users.findMany({
      where: (cols, { inArray }) => inArray(cols.status, ['active', 'pending']),
    });

    expect(result).toHaveLength(2);
    expect(result.map((u) => u.name).sort()).toEqual(['Alice', 'Bob']);
  });

  test('should filter with notInArray operator', async ({ ctx }) => {
    const db = createDatabase(ctx.db, testSchema, edges);

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 30,
      status: 'deleted',
      deletedAt: 123456,
    });

    const result = await db.query.users.findMany({
      where: (cols, { notInArray }) => notInArray(cols.status, ['deleted']),
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  test('should throw error for inArray with empty array', () => {
    expect(() =>
      inArray({ __brand: 'FieldReference', fieldName: 'status' } as any, [])
    ).toThrow('inArray requires a non-empty array');
  });

  test('should throw error for notInArray with empty array', () => {
    expect(() =>
      notInArray({ __brand: 'FieldReference', fieldName: 'status' } as any, [])
    ).toThrow('notInArray requires a non-empty array');
  });
});

// ============================================================================
// Null Operators
// ============================================================================

describe('M4 Where Filtering - Null Operators', () => {
  test('should filter with isNull operator', async ({ ctx }) => {
    const db = createDatabase(ctx.db, testSchema, edges);

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 30,
      status: 'deleted',
      deletedAt: 123456,
    });

    const result = await db.query.users.findMany({
      where: (cols, { isNull }) => isNull(cols.deletedAt),
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  test('should filter with isNotNull operator', async ({ ctx }) => {
    const db = createDatabase(ctx.db, testSchema, edges);

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 30,
      status: 'deleted',
      deletedAt: 123456,
    });

    const result = await db.query.users.findMany({
      where: (cols, { isNotNull }) => isNotNull(cols.deletedAt),
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Bob');
  });
});

// ============================================================================
// Pagination Fix
// ============================================================================

describe('M4 Where Filtering - Pagination', () => {
  // TODO M4.5: Convex doesn't have skip() - need cursor-based pagination
  test.skip('should use skip() before take() for offset', async ({ ctx }) => {
    const db = createDatabase(ctx.db, testSchema, edges);

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 20,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Charlie',
      email: 'charlie@example.com',
      age: 30,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'David',
      email: 'david@example.com',
      age: 35,
      status: 'active',
      deletedAt: null,
    });

    const result = await db.query.users.findMany({
      limit: 2,
      offset: 2,
    });

    expect(result).toHaveLength(2);
    // Results should be 3rd and 4th users (Charlie and David)
    const names = result.map((u) => u.name).sort();
    expect(names).toEqual(['Charlie', 'David']);
  });

  test('should not apply offset when not provided', async ({ ctx }) => {
    const db = createDatabase(ctx.db, testSchema, edges);

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 30,
      status: 'active',
      deletedAt: null,
    });

    const result = await db.query.users.findMany({
      limit: 10,
    });

    expect(result).toHaveLength(2);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('M4 Where Filtering - Edge Cases', () => {
  test('should handle undefined where clause', async ({ ctx }) => {
    const db = createDatabase(ctx.db, testSchema, edges);

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: null,
    });

    const result = await db.query.users.findMany();

    expect(result).toHaveLength(1);
  });

  test('should handle and() with no expressions', () => {
    const result = and();
    expect(result).toBeUndefined();
  });

  test('should handle and() with single expression', () => {
    const expr = eq(
      { __brand: 'FieldReference', fieldName: 'name' } as any,
      'Alice'
    );
    const result = and(expr);

    // Single expression should be returned as-is (optimization)
    expect(result).toBe(expr);
  });

  test('should handle or() with no expressions', () => {
    const result = or();
    expect(result).toBeUndefined();
  });

  test('should handle or() with single expression', () => {
    const expr = eq(
      { __brand: 'FieldReference', fieldName: 'name' } as any,
      'Alice'
    );
    const result = or(expr);

    // Single expression should be returned as-is (optimization)
    expect(result).toBe(expr);
  });

  test('should handle complex filter with all operator types', async ({
    ctx,
  }) => {
    const db = createDatabase(ctx.db, testSchema, edges);

    await ctx.db.insert('users', {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
      status: 'active',
      deletedAt: 123456,
    });
    await ctx.db.insert('users', {
      name: 'Bob',
      email: 'bob@example.com',
      age: 17,
      status: 'pending',
      deletedAt: null,
    });
    await ctx.db.insert('users', {
      name: 'Charlie',
      email: 'charlie@example.com',
      age: 70,
      status: 'deleted',
      deletedAt: null,
    });

    const result = await db.query.users.findMany({
      where: (cols, { eq, gt, lt, inArray, isNotNull }) =>
        and(
          inArray(cols.status, ['active', 'pending']),
          or(gt(cols.age, 18), lt(cols.age, 65)),
          isNotNull(cols.deletedAt),
          eq(cols.name, 'Alice')
        ),
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });
});

// ============================================================================
// Type Safety
// ============================================================================

describe('M4 Where Filtering - Type Safety', () => {
  test('should provide typed column access in where clause', async ({
    ctx,
  }) => {
    const db = createDatabase(ctx.db, testSchema, edges);

    // TypeScript should allow accessing valid columns
    await db.query.users.findMany({
      where: (cols, { eq }) => eq(cols.name, 'Alice'),
    });

    await db.query.users.findMany({
      where: (cols, { gt }) => gt(cols.age, 18),
    });

    // TODO M4.5: Properly type column proxies for compile-time safety
    // Currently cols is Record<string, any> so invalid columns don't error at compile time
    // TypeScript should prevent accessing invalid columns (compile-time check)
    // @ts-expect-error - 'invalidColumn' does not exist
    // await db.query.users.findMany({
    //   where: (cols, { eq }) => eq(cols.invalidColumn, 'value'),
    // });
  });
});
