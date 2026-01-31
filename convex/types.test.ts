import { v } from 'convex/values';
import { expect, test } from 'vitest';
// @ts-expect-error - ORM not implemented yet
import {
  convexTable,
  InferInsertModel,
  InferSelectModel,
} from '../packages/better-convex/src/orm';
import type { Id } from './_generated/dataModel';
import { MutationCtx, QueryCtx } from './types';

// Check that MutationCtx extends QueryCtx
export function mutable(ctx: MutationCtx) {
  function immutable(ctx: QueryCtx) {
    return ctx.table('users').firstX();
  }

  return immutable(ctx);
}

test('placeholder', async () => {
  expect(true).toBeTruthy();
});

// ORM Type Inference Tests (M1)

test('convexTable() creates table with symbol metadata', () => {
  const users = convexTable('users', {
    name: v.string(),
    email: v.string(),
  });

  // Check symbol metadata exists
  expect(users[Symbol.for('better-convex:TableName')]).toBe('users');
  expect(users[Symbol.for('better-convex:Columns')]).toHaveProperty('name');
  expect(users[Symbol.for('better-convex:Columns')]).toHaveProperty('email');
});

test('InferSelectModel includes _id and _creationTime', () => {
  const users = convexTable('users', {
    name: v.string(),
    email: v.string(),
  });

  type User = InferSelectModel<typeof users>;

  // Type-level test - should compile
  const user: User = {
    _id: '123' as Id<'users'>,
    _creationTime: Date.now(),
    name: 'Alice',
    email: 'alice@example.com',
  };

  expect(user.name).toBe('Alice');
});

test('InferInsertModel excludes _id and _creationTime', () => {
  const users = convexTable('users', {
    name: v.string(),
    email: v.string(),
  });

  type NewUser = InferInsertModel<typeof users>;

  // Type-level test - should compile
  const newUser: NewUser = {
    name: 'Bob',
    email: 'bob@example.com',
  };

  // Should NOT require _id or _creationTime
  expect(newUser.name).toBe('Bob');
});

test('InferSelectModel with optional fields', () => {
  const users = convexTable('users', {
    name: v.string(),
    nickname: v.optional(v.string()),
  });

  type User = InferSelectModel<typeof users>;

  // Optional field should be optional in type
  const user: User = {
    _id: '123' as Id<'users'>,
    _creationTime: Date.now(),
    name: 'Charlie',
    // nickname is optional, can be omitted
  };

  expect(user.name).toBe('Charlie');
  expect(user.nickname).toBeUndefined();
});

test('InferInsertModel with optional fields', () => {
  const users = convexTable('users', {
    name: v.string(),
    nickname: v.optional(v.string()),
  });

  type NewUser = InferInsertModel<typeof users>;

  // Should allow omitting optional field
  const newUser: NewUser = {
    name: 'Diana',
  };

  expect(newUser.name).toBe('Diana');
});

test('InferSelectModel with nested object', () => {
  const users = convexTable('users', {
    name: v.string(),
    address: v.object({
      street: v.string(),
      city: v.string(),
    }),
  });

  type User = InferSelectModel<typeof users>;

  const user: User = {
    _id: '123' as Id<'users'>,
    _creationTime: Date.now(),
    name: 'Eve',
    address: {
      street: '123 Main St',
      city: 'NYC',
    },
  };

  expect(user.address.city).toBe('NYC');
});

test('InferSelectModel with array', () => {
  const posts = convexTable('posts', {
    title: v.string(),
    tags: v.array(v.string()),
  });

  type Post = InferSelectModel<typeof posts>;

  const post: Post = {
    _id: '123' as Id<'posts'>,
    _creationTime: Date.now(),
    title: 'My Post',
    tags: ['tech', 'coding'],
  };

  expect(post.tags).toHaveLength(2);
});

test('InferSelectModel with union type', () => {
  const posts = convexTable('posts', {
    title: v.string(),
    status: v.union(v.literal('draft'), v.literal('published')),
  });

  type Post = InferSelectModel<typeof posts>;

  const post: Post = {
    _id: '123' as Id<'posts'>,
    _creationTime: Date.now(),
    title: 'My Post',
    status: 'draft',
  };

  expect(post.status).toBe('draft');
});

test('convexTable validates reserved table names', () => {
  expect(() => {
    convexTable('_storage', {
      name: v.string(),
    });
  }).toThrow('reserved');
});

test('convexTable validates table name format', () => {
  expect(() => {
    convexTable('my-table', {
      name: v.string(),
    });
  }).toThrow('Invalid table name');
});
