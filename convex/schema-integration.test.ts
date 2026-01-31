import { defineSchema } from 'convex/server';
import { v } from 'convex/values';
import { expect, test } from 'vitest';
import { convexTable } from '../packages/better-convex/src/orm';

test('convexTable works with defineSchema()', () => {
  const users = convexTable('users', {
    name: v.string(),
    email: v.string(),
  });

  const posts = convexTable('posts', {
    title: v.string(),
    content: v.string(),
  });

  // Should not throw
  const schema = defineSchema({
    users,
    posts,
  });

  expect(schema).toBeDefined();
  expect(schema.tables).toHaveProperty('users');
  expect(schema.tables).toHaveProperty('posts');
});

test('convexTable validator is compatible with Convex schema', () => {
  const users = convexTable('users', {
    name: v.string(),
    email: v.string(),
  });

  // Should have validator property
  expect(users.validator).toBeDefined();
  expect(users.tableName).toBe('users');
});
